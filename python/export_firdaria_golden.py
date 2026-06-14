#!/usr/bin/env python3
"""Cross-language golden for astroengine.firdaria.

Runs a fixed set of firdaria specs through the Python reference and records the
results. packages/caelus/test/firdaria-golden.test.ts replays the same specs
through the TS port and must reproduce them. Embedded tier.

Usage: python3 export_firdaria_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import firdaria as F

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)


def jd(date):
    return julian_day(*date)


def build_cases():
    return [
        # the major sequence, day and night
        {"id": "seq-day", "type": "sequence", "day": True},
        {"id": "seq-night", "type": "sequence", "day": False},
        # the full timeline (majors + sub-periods) from a natal moment
        {"id": "timeline-day", "type": "timeline", "day": True, "natal": NATAL},
        {"id": "timeline-night", "type": "timeline", "day": False, "natal": NATAL},
        # active major/sub at several ages, day and night
        {"id": "active-day-5y", "type": "active", "day": True,
         "natal": NATAL, "target": [1995, 6, 10, 14, 30]},
        {"id": "active-day-35y", "type": "active", "day": True,
         "natal": NATAL, "target": [2025, 6, 10, 0, 0]},
        {"id": "active-night-12y", "type": "active", "day": False,
         "natal": NATAL, "target": [2002, 6, 10, 0, 0]},
        {"id": "active-after-75y", "type": "active", "day": True,
         "natal": NATAL, "target": [2070, 1, 1, 0, 0]},
        # engine path: sect taken from the natal chart
        {"id": "at-chart-tampa", "type": "at", "natal": NATAL,
         "target": [2025, 6, 10, 0, 0], "lat": TAMPA[0], "lon": TAMPA[1]},
    ]


def compute(spec, eng):
    t = spec["type"]
    if t == "sequence":
        return F.firdaria_sequence(spec["day"])
    if t == "timeline":
        return F.firdaria(spec["day"], jd(spec["natal"]))
    if t == "active":
        return F.firdaria_active(spec["day"], jd(spec["natal"]), jd(spec["target"]))
    if t == "at":
        return F.firdaria_at(eng, jd(spec["natal"]), jd(spec["target"]),
                             spec["lat"], spec["lon"])
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.firdaria (embedded VSOP, full moon)",
           "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:18s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "firdaria-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
