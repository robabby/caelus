#!/usr/bin/env python3
"""Fit Chiron heliocentric ecliptic-J2000 position -> Chebyshev JSON.

Source: JPL Horizons (public domain). Geometric vectors only — no light-time
baked in — so the geocentric pipeline applies it once.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chebyshev import fit
from astroengine.core import julian_day
from horizons import ChironHorizonsCache

CACHE = os.path.join(os.path.dirname(__file__), "chiron_horizons_cache.json")
OUT_MONOREPO = os.path.join(
    os.path.dirname(__file__), "..", "packages", "caelus", "data", "chiron_cheb.json"
)
OUT_ENGINE = os.path.join(
    os.path.dirname(__file__), "astroengine", "data", "chiron_cheb.json"
)


def main():
    jd0, jd1 = julian_day(1850, 1, 1), julian_day(2150, 1, 1)
    cache = ChironHorizonsCache(CACHE)
    # pad past jd1: Chebyshev segments sample up to jd0 + nseg*seg_days > jd1
    cache.ensure(jd0, jd1, step=1.0, pad_days=5844)
    chiron_helio = cache.sample

    print("scan: seg_days, degree -> residual AU, size")
    best = None
    for seg in (1461, 2922, 5844):  # 4, 8, 16 years
        for deg in (8, 10, 12, 14, 16, 20):
            data, resid = fit(chiron_helio, jd0, jd1, seg, deg, scale=1.0, sig=10)
            size = len(json.dumps(data, separators=(",", ":")))
            ok = "OK" if resid < 5e-6 else "  "
            print(
                f"  seg={seg:5d} deg={deg:2d}  resid={resid:.2e} AU  "
                f"{size / 1024:6.1f} KB {ok}"
            )
            if resid < 5e-6 and (best is None or size < best[2]):
                best = (seg, deg, size, data, resid)

    if best is None:
        print("ERROR: no (seg, degree) met the 5e-6 AU residual target")
        sys.exit(1)

    seg, deg, size, data, resid = best
    data["provenance"] = {
        "source": "JPL Horizons",
        "body": "2060 Chiron",
        "center": "@sun",
        "frame": "heliocentric ecliptic J2000",
        "correction": "geometric (VEC_CORR=NONE)",
        "range": "1850-2150",
        "seg_days": seg,
        "degree": deg,
        "fit_residual_au": resid,
    }

    for path in (OUT_MONOREPO, OUT_ENGINE):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"\nchosen seg={seg} deg={deg}: {os.path.getsize(path) / 1024:.1f} KB")
        print(f"  -> {path}")


if __name__ == "__main__":
    main()
