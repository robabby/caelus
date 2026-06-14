#!/usr/bin/env python3
"""Cross-language golden for astroengine.vargas (divisional charts).

Runs a fixed set of varga specs through the Python reference and records the
results. packages/caelus/test/vargas-golden.test.ts replays the same specs
through the TS port and must reproduce them. Embedded tier.

Usage: python3 export_vargas_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import vargas as V

NATAL = [1990, 6, 10, 14, 30]


def jd(date):
    return julian_day(*date)


def build_cases():
    cases = []
    # pure varga placements across the five divisions and a few longitudes,
    # including sign boundaries and within-sign division points.
    for lon in [0.0, 5.0, 15.0, 25.0, 30.0, 120.0, 200.0, 28.0, 359.99]:
        for n in V.VARGA_DIVISIONS:
            cases.append({"id": f"v{n}-{lon}", "type": "varga", "lon": lon, "n": n})
    # the navamsa of the natal Moon, and the full D9 / D10 charts
    cases.append({"id": "nav-moon", "type": "varga_at", "natal": NATAL, "n": 9})
    cases.append({"id": "d9-chart", "type": "chart", "natal": NATAL, "n": 9})
    cases.append({"id": "d10-chart", "type": "chart", "natal": NATAL, "n": 10})
    return cases


def compute(spec, eng):
    t = spec["type"]
    if t == "varga":
        return V.varga(spec["lon"], spec["n"])
    if t == "varga_at":
        return V.varga_at(eng, jd(spec["natal"]), spec["n"])
    if t == "chart":
        return V.varga_chart(eng, jd(spec["natal"]), spec["n"])
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.vargas (embedded VSOP, full moon); "
                    "Lahiri ayanamsa", "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
    print(f'{len(out["cases"])} cases')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "vargas-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
