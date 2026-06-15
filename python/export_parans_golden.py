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


def build_cases():
    return [
        {"id": "tampa_1990", "jd": julian_day(1990, 6, 10), "lat": 27.95, "tolerance_min": 30.0},
        {"id": "london_2026", "jd": julian_day(2026, 3, 20), "lat": 51.5, "tolerance_min": 20.0},
        {"id": "equator_2000", "jd": julian_day(2000, 1, 1), "lat": 0.0, "tolerance_min": 45.0},
    ]


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.parans; classical planets, "
                    "lon-independent, stated tolerance", "cases": []}
    for c in build_cases():
        res = P.parans(eng, c["jd"], c["lat"], tolerance_min=c["tolerance_min"])
        out["cases"].append({"id": c["id"], "spec": c, "result": res})
        print(f'{c["id"]:14s} {len(res)} paran(s)')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "parans-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
