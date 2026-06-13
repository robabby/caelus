#!/usr/bin/env python3
"""Refit the precise-Moon Chebyshev tiers from JPL DE440/441 via Horizons.

Replaces the 2010-era DE423 fit with DE441 geometric geocentric states.

Two correctness rules make this trustworthy where the first DE441 attempt
was not:

1. CUBIC sampling, not linear. The Moon moves ~13 deg/day with large
   curvature; LINEAR interpolation of a 6-hour Horizons grid is wrong by
   up to ~159 km (~85") mid-interval, and a Chebyshev fit to those samples
   faithfully reproduces the error. We sample the cache with cubic
   interpolation (HorizonsCache.sample_cubic) on a fine step, so the fit
   tracks the true motion between grid points.

2. The fit residual is measured at oversampled points and the real
   acceptance test is validate_horizons.py with OFF-GRID epochs -- a fit
   residual alone can look tiny while the pack is wrong between samples.

Target: residual under the ~0.2" JPL apparent-place floor (light-time,
aberration, nutation), which is all the apparent Moon can resolve anyway --
chasing 0.03" only inflates the pack. Output stays compact plain JSON
(~1-3 MB), no Git LFS.

Needs ssd.jpl.nasa.gov -- run locally, like fit_smallbody.py. The Horizons
cache is gitignored; only the fitted packs are committed.

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

# ~0.1" at lunar distance -- comfortably under the ~0.2" apparent floor while
# keeping the packs small. (0.186 km == 0.1" at 384400 km.)
RESID_KM = 0.186

# 2-hour grid: cubic interpolation error is then ~milliarcsecond, so the fit
# residual reflects true geometric accuracy rather than interpolation.
CACHE_STEP_DAYS = 2.0 / 24.0

# Segment/degree grid. Larger segments at higher degree pack the Moon's
# ~27-day motion compactly (the proven DE423 pack used 32-day / degree-24);
# the scan keeps the smallest pack that meets RESID_KM.
SEG_DAYS = (4.0, 8.0, 16.0, 32.0)
DEGREES = (12, 14, 16, 18, 20, 22, 24, 26, 28)

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
    # pad so cubic interpolation has neighbours at the very ends of the range
    cache.ensure(jd0_all, jd1_all, step=CACHE_STEP_DAYS, pad_days=64)

    def sample_km(jds):
        import numpy as np
        x, y, z = cache.sample_cubic(jds)
        return np.asarray(x) * KM_PER_AU, np.asarray(y) * KM_PER_AU, \
            np.asarray(z) * KM_PER_AU

    for tier, (jd0, jd1) in TIERS.items():
        print(f"--- moon tier '{tier}': scan seg_days, degree")
        best = None
        for seg in SEG_DAYS:
            for deg in DEGREES:
                # oversample (3x the coefficients) so the reported residual is
                # a real fit-quality figure, not interpolation through nodes
                data, resid = fit(sample_km, jd0, jd1, seg, deg, scale=1000.0,
                                  samples_per_seg=3 * (deg + 1), sig=10)
                size = len(json.dumps(data, separators=(",", ":")))
                ok = "OK" if resid < RESID_KM else "  "
                arcsec = resid / 384400.0 * 206265.0
                print(f"  seg={seg:5.1f} deg={deg:2d}  resid={resid:.3e} km "
                      f"({arcsec:.3f}\")  {size / 1024:7.0f} KB {ok}")
                if resid < RESID_KM and (best is None or size < best[2]):
                    best = (seg, deg, size, data, resid)
        if best is None:
            print(f"ERROR: tier {tier}: no fit met {RESID_KM} km")
            sys.exit(1)
        seg, deg, size, data, resid = best
        print(f"  chosen: seg={seg} deg={deg}  {size / 1024:.0f} KB  "
              f"resid={resid:.3e} km ({resid / 384400.0 * 206265.0:.3f}\")")
        if size > 5 * 1024 * 1024:
            print(f"  WARNING: pack is {size / 1e6:.1f} MB -- larger than "
                  "expected; check the scan grid before committing")
        data["provenance"] = {
            "source": "JPL Horizons (DE441)",
            "body": "Moon, geocentric geometric",
            "frame": "ecliptic J2000", "units": "km",
            "sampling": "cubic interpolation of a 2-hour grid",
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
