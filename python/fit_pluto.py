#!/usr/bin/env python3
"""Fit Pluto heliocentric ecliptic-J2000 position -> Chebyshev JSON.

Source: JPL Horizons (public domain). Geometric vectors only -- no light-time
baked in -- so the geocentric pipeline applies it once, the same contract as
fit_chiron.py / fit_smallbody.py.

Why: the embedded engine computes Pluto from the Meeus ch.37 series, which is
valid only over 1885-2099. A Chebyshev pack fit to Horizons extends Pluto to a
wide range at full precision; when present it is loaded into `chebPacks.pluto`
(node-loader.ts) and supersedes the Meeus series. Pluto is slow (≈248-yr
period), so long segments resolve it cheaply.

Run in an environment with outbound access to ssd.jpl.nasa.gov and numpy
installed; the data mint and validation cannot run in a sandbox without egress.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chebyshev import fit
from astroengine.core import julian_day
from horizons import HorizonsCache

CACHE = os.path.join(os.path.dirname(__file__), "pluto_horizons_cache.json")
OUT_MONOREPO = os.path.join(
    os.path.dirname(__file__), "..", "packages", "caelus", "data", "pluto_cheb.json"
)
OUT_ENGINE = os.path.join(
    os.path.dirname(__file__), "astroengine", "data", "pluto_cheb.json"
)

# Fit window. The Pluto *body* center (999) wobbles around the Pluto-Charon
# barycenter every 6.39 d at ~1.4e-5 AU (~2130 km) -- a high-frequency signal no
# multi-year Chebyshev can absorb, so 999 floors the fit at ~1.4e-5 AU. We fit
# the *barycenter* (command "9"): it is smooth (Charon averaged out), matches the
# Meeus ch.37 series this pack supersedes (also barycenter, no Charon term), and
# Horizons serves it across the full DE441 span. The 999-vs-barycenter offset is
# <= ~0.1" geocentric, below the engine's other Pluto error terms.
YEAR0, YEAR1 = 1700, 2200


def main():
    jd0, jd1 = julian_day(YEAR0, 1, 1), julian_day(YEAR1, 1, 1)
    # Pluto barycenter (9): smooth (Charon wobble averaged out), full DE441 range.
    cache = HorizonsCache(CACHE, command="9", label="9 Pluto barycenter")
    # pad past jd1: Chebyshev segments sample up to jd0 + nseg*seg_days > jd1.
    cache.ensure(jd0, jd1, step=1.0, pad_days=23376)
    pluto_helio = cache.sample

    print("scan: seg_days, degree -> residual AU, size")
    best = None
    for seg in (5844, 11688, 23376):  # 16, 32, 64 yr
        for deg in (10, 12, 14, 16, 20):
            data, resid = fit(pluto_helio, jd0, jd1, seg, deg, scale=1.0, sig=10)
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
        "body": "9 Pluto barycenter",
        "center": "@sun",
        "frame": "heliocentric ecliptic J2000",
        "correction": "geometric (VEC_CORR=NONE)",
        "range": f"{YEAR0}-{YEAR1}",
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
