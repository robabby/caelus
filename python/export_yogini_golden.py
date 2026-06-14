#!/usr/bin/env python3
"""Cross-language golden for astroengine.yogini (Yogini dasha).

Runs a fixed set of yogini specs through the Python reference and records the
results. packages/caelus/test/yogini-golden.test.ts replays the same specs
through the TS port and must reproduce them. Embedded tier.

Usage: python3 export_yogini_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import yogini as Y

NATAL = [1990, 6, 10, 14, 30]
MOON_LON = 45.0   # sidereal: Rohini (nak index 3)


def jd(date):
    return julian_day(*date)


def build_cases():
    return [
        # starting yogini across a few nakshatra indices
        {"id": "start-0", "type": "start", "nak": 0},
        {"id": "start-3", "type": "start", "nak": 3},
        {"id": "start-12", "type": "start", "nak": 12},
        {"id": "start-26", "type": "start", "nak": 26},
        # the dasha timeline from a fixed sidereal Moon
        {"id": "dashas", "type": "dashas", "moon_lon": MOON_LON, "natal": NATAL},
        # active maha/antar at several ages
        {"id": "active-5y", "type": "active", "moon_lon": MOON_LON,
         "natal": NATAL, "target": [1995, 6, 10, 0, 0]},
        {"id": "active-40y", "type": "active", "moon_lon": MOON_LON,
         "natal": NATAL, "target": [2030, 1, 1, 0, 0]},
        # engine path
        {"id": "at-tampa", "type": "at", "natal": NATAL, "target": [2025, 6, 10, 0, 0]},
    ]


def compute(spec, eng):
    t = spec["type"]
    if t == "start":
        return {"yogini": Y.YOGINIS[Y.starting_yogini(spec["nak"])]}
    if t == "dashas":
        return Y.yogini_dashas(spec["moon_lon"], jd(spec["natal"]), levels=2)
    if t == "active":
        return Y.yogini_active(spec["moon_lon"], jd(spec["natal"]), jd(spec["target"]))
    if t == "at":
        return Y.yogini_at(eng, jd(spec["natal"]), jd(spec["target"]))
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.yogini (embedded VSOP, full moon); "
                    "Lahiri ayanamsa, 365.25-day dasha year", "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:12s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "yogini-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
