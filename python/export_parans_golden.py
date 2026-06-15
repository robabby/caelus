#!/usr/bin/env python3
"""Cross-language golden for astroengine.parans (co-angular bodies).

A few (date, latitude) cases through the Python reference; the TS port
(parans-golden.test.ts) must reproduce the co-angular pairs and their timing.

Usage: python3 export_parans_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine import parans as P
from astroengine.core import julian_day


STARS = ["Regulus", "Aldebaran", "Spica", "Antares", "Sirius", "Algol"]


def build_cases():
    return [
        {"id": "tampa_1990", "type": "body", "jd": julian_day(1990, 6, 10), "lat": 27.95, "tolerance_min": 30.0},
        {"id": "london_2026", "type": "body", "jd": julian_day(2026, 3, 20), "lat": 51.5, "tolerance_min": 20.0},
        {"id": "equator_2000", "type": "body", "jd": julian_day(2000, 1, 1), "lat": 0.0, "tolerance_min": 45.0},
        {"id": "stars_tampa_1990", "type": "star", "jd": julian_day(1990, 6, 10), "lat": 27.95, "stars": STARS, "tolerance_min": 30.0},
        {"id": "stars_london_2026", "type": "star", "jd": julian_day(2026, 3, 20), "lat": 51.5, "stars": STARS, "tolerance_min": 20.0},
    ]


def compute(spec, eng):
    if spec["type"] == "star":
        return P.star_parans(eng, spec["jd"], spec["lat"], spec["stars"], tolerance_min=spec["tolerance_min"])
    return P.parans(eng, spec["jd"], spec["lat"], tolerance_min=spec["tolerance_min"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.parans; classical planets and "
                    "fixed stars, lon-independent, stated tolerance", "cases": []}
    for c in build_cases():
        res = compute(c, eng)
        out["cases"].append({"id": c["id"], "spec": c, "result": res})
        print(f'{c["id"]:18s} {len(res)} paran(s)')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "parans-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
