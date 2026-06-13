#!/usr/bin/env python3
"""Refit the precise-Moon Chebyshev tiers from JPL DE440/441 via Horizons.

Replaces the 2010-era DE423 fit (current bound ~2.5 arcsec) with DE441
geometric geocentric states: target residual 0.05 km (~0.03 arcsec at
lunar distance), which cascades into the true node, true Lilith,
topocentric Moon, and eclipse contacts. Needs ssd.jpl.nasa.gov — run
locally, like fit_smallbody.py. The Horizons cache for 6-hour sampling
over 300 years is ~120 MB: it is NOT committed (gitignored); only the
fitted packs are.

Usage: python3 fit_moon.py          # writes both moon_cheb tiers
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chebyshev import fit
from astroengine.core import julian_day
from horizons import HorizonsCache

HERE = os.path.dirname(__file__)
KM_PER_AU = 149597870.7
RESID_KM = 0.05

TIERS = {
    "full": (julian_day(1850, 1, 1), julian_day(2150, 1, 1)),
    "embedded": (julian_day(1920, 1, 1), julian_day(2080, 1, 1)),
}


def main():
    cache = HorizonsCache(
        os.path.join(HERE, "moon_horizons_cache.json"),
        command="301", label="Moon (geocentric, DE441)", center="@399",
    )
    jd0_all, jd1_all = TIERS["full"]
    cache.ensure(jd0_all, jd1_all, step=0.25, pad_days=64)

    def sample_km(jds):
        import numpy as np
        x, y, z = cache.sample(jds)
        return np.asarray(x) * KM_PER_AU, np.asarray(y) * KM_PER_AU, \
            np.asarray(z) * KM_PER_AU

    for tier, (jd0, jd1) in TIERS.items():
        print(f"--- moon tier '{tier}': scan seg_days, degree")
        best = None
        for seg in (8, 16, 32):
            for deg in (10, 12, 14, 16, 18):
                data, resid = fit(sample_km, jd0, jd1, seg, deg, scale=1.0, sig=10)
                size = len(json.dumps(data, separators=(",", ":")))
                ok = "OK" if resid < RESID_KM else "  "
                print(f"  seg={seg:3d} deg={deg:2d}  resid={resid:.2e} km  "
                      f"{size / 1024:7.0f} KB {ok}")
                if resid < RESID_KM and (best is None or size < best[2]):
                    best = (seg, deg, size, data, resid)
        if best is None:
            print(f"ERROR: tier {tier}: no fit met {RESID_KM} km")
            sys.exit(1)
        seg, deg, size, data, resid = best
        data["provenance"] = {
            "source": "JPL Horizons (DE441)",
            "body": "Moon, geocentric geometric",
            "frame": "ecliptic J2000", "units": "km",
            "range": f"JD {jd0}-{jd1}", "seg_days": seg, "degree": deg,
            "fit_residual_km": resid,
        }
        for path in (
            os.path.join(HERE, "..", "packages", "caelus", "data",
                         f"moon_cheb.{tier}.json"),
            os.path.join(HERE, "astroengine", "data", f"moon_cheb.{tier}.json"),
        ):
            with open(path, "w") as f:
                json.dump(data, f, separators=(",", ":"))
            print(f"  -> {path} ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
