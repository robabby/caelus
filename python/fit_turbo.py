#!/usr/bin/env python3
"""Mint a turbo pack: a fast Chebyshev representation of the engine's apparent
longitude, fit to the engine itself (no external source, no network).

Segment lengths resolve the ~13.7-day nutation term shared by every body, so
the planets reproduce the engine to <0.01" and the Moon to ~0.03" at degree 12.

A turbo pack is a "mint it for your range" artifact: pick the bodies, range,
and segment lengths you need. This writes a small reference pack (used by the
tests and as a worked example) to packages/caelus/data/turbo.json.

Usage: python3 fit_turbo.py            # reference pack (2000-2005)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import turbo as T

# Segment length (days) per body. Slow planets still need ~24-day segments to
# resolve the semi-monthly nutation; the Moon needs ~4-day for its own motion.
SEG_DAYS = {
    "sun": 24, "mercury": 14, "venus": 20, "mars": 24, "jupiter": 24,
    "saturn": 24, "uranus": 24, "neptune": 24, "pluto": 24, "moon": 4,
}
DEGREE = 12
RANGE = (julian_day(2000, 1, 1), julian_day(2005, 1, 1))


def main():
    eng = Engine("full")
    jd0, jd1 = RANGE
    pack = T.fit(eng, list(SEG_DAYS), jd0, jd1, SEG_DAYS, degree=DEGREE)
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "data", "turbo.json")
    with open(path, "w") as f:
        json.dump(pack, f, separators=(",", ":"))
    size = os.path.getsize(path)
    nseg = sum(len(b["segments"]) for b in pack["bodies"].values())
    print(f"wrote {path} ({size // 1024} KB, {len(pack['bodies'])} bodies, "
          f"{nseg} segments, degree {DEGREE})")


if __name__ == "__main__":
    main()
