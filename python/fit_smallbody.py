#!/usr/bin/env python3
"""Fit small-body heliocentric ecliptic-J2000 positions -> Chebyshev JSON.

Generalizes fit_chiron.py to the Tier 2 bodies. Source: JPL Horizons
(public domain), geometric vectors (no light-time baked in) so the
geocentric pipeline applies it once. Needs ssd.jpl.nasa.gov reachable;
run locally if the sandbox egress policy blocks it, then commit the JSON.

Usage:
  python3 fit_smallbody.py             # all five Tier 2 bodies
  python3 fit_smallbody.py ceres pholus
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chebyshev import fit
from astroengine.core import julian_day
from horizons import HorizonsCache

# Horizons COMMAND: a trailing semicolon selects the small-body database.
BODIES = {
    "ceres": ("1;", "1 Ceres"),
    "pallas": ("2;", "2 Pallas"),
    "juno": ("3;", "3 Juno"),
    "vesta": ("4;", "4 Vesta"),
    "pholus": ("5145;", "5145 Pholus"),
}

HERE = os.path.dirname(__file__)
RANGE = (1850, 2150)
RESID_TARGET = 5e-6  # AU, same bar as the Chiron fit (~1 km at 1 AU)


def fit_body(name):
    command, label = BODIES[name]
    jd0, jd1 = julian_day(RANGE[0], 1, 1), julian_day(RANGE[1], 1, 1)
    cache = HorizonsCache(
        os.path.join(HERE, f"{name}_horizons_cache.json"), command, label,
    )
    cache.ensure(jd0, jd1, step=1.0, pad_days=5844)

    print(f"--- {label}: scan seg_days, degree -> residual AU, size")
    best = None
    for seg in (1461, 2922, 5844):  # 4, 8, 16 years
        for deg in (8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32):
            data, resid = fit(cache.sample, jd0, jd1, seg, deg, scale=1.0, sig=10)
            size = len(json.dumps(data, separators=(",", ":")))
            ok = "OK" if resid < RESID_TARGET else "  "
            print(f"  seg={seg:5d} deg={deg:2d}  resid={resid:.2e} AU  "
                  f"{size / 1024:6.1f} KB {ok}")
            if resid < RESID_TARGET and (best is None or size < best[2]):
                best = (seg, deg, size, data, resid)
    if best is None:
        print(f"ERROR: {name}: no (seg, degree) met {RESID_TARGET} AU")
        return False

    seg, deg, size, data, resid = best
    data["provenance"] = {
        "source": "JPL Horizons",
        "body": label,
        "center": "@sun",
        "frame": "heliocentric ecliptic J2000",
        "correction": "geometric (VEC_CORR=NONE)",
        "range": f"{RANGE[0]}-{RANGE[1]}",
        "seg_days": seg,
        "degree": deg,
        "fit_residual_au": resid,
    }
    for path in (
        os.path.join(HERE, "..", "packages", "caelus", "data", f"{name}_cheb.json"),
        os.path.join(HERE, "astroengine", "data", f"{name}_cheb.json"),
    ):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"  seg={seg} deg={deg}: {os.path.getsize(path) / 1024:.1f} KB -> {path}")
    return True


def main():
    names = sys.argv[1:] or list(BODIES)
    bad = [n for n in names if n not in BODIES]
    if bad:
        print(f"unknown bodies: {bad}; known: {list(BODIES)}")
        sys.exit(2)
    results = {n: fit_body(n) for n in names}
    if not all(results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
