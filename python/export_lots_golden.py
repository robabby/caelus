#!/usr/bin/env python3
"""Cross-language golden for astroengine.lots.

Runs a fixed set of lot specs through the Python reference and records the
results. packages/caelus/test/lots-golden.test.ts replays the same specs
through the TS port and must reproduce them. Embedded tier, to match the TS
engine's embedded data.

Usage: python3 export_lots_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import lots as L

TAMPA = (27.95, -82.46)
LONDON = (51.5, -0.12)


def jd(date):
    return julian_day(*date)


def build_cases():
    return [
        # pure formula: day and night reverse, plus a wrap across 0/360
        {"id": "formula-day", "type": "formula",
         "asc": 100.0, "day": True, "sun": 80.0, "moon": 200.0, "mercury": 70.0,
         "venus": 60.0, "mars": 250.0, "jupiter": 120.0, "saturn": 300.0},
        {"id": "formula-night", "type": "formula",
         "asc": 100.0, "day": False, "sun": 80.0, "moon": 200.0, "mercury": 70.0,
         "venus": 60.0, "mars": 250.0, "jupiter": 120.0, "saturn": 300.0},
        {"id": "formula-wrap", "type": "formula",
         "asc": 350.0, "day": True, "sun": 10.0, "moon": 40.0, "mercury": 300.0,
         "venus": 5.0, "mars": 359.0, "jupiter": 200.0, "saturn": 30.0},
        # full chart: a day chart (Tampa noon), a night chart (Tampa pre-dawn),
        # London, and a sidereal chart.
        {"id": "chart-tampa-day", "type": "chart", "jd": [2000, 1, 1, 12, 0],
         "lat": TAMPA[0], "lon": TAMPA[1], "zodiac": "tropical"},
        {"id": "chart-tampa-night", "type": "chart", "jd": [2010, 7, 15, 4, 0],
         "lat": TAMPA[0], "lon": TAMPA[1], "zodiac": "tropical"},
        {"id": "chart-london", "type": "chart", "jd": [2024, 3, 20, 3, 0],
         "lat": LONDON[0], "lon": LONDON[1], "zodiac": "tropical"},
        {"id": "chart-tampa-sidereal", "type": "chart", "jd": [1990, 6, 10, 14, 30],
         "lat": TAMPA[0], "lon": TAMPA[1], "zodiac": "sidereal:lahiri"},
    ]


def compute(spec, eng):
    t = spec["type"]
    if t == "formula":
        return L.hermetic_lots(spec["asc"], spec["day"], spec["sun"], spec["moon"],
                               spec["mercury"], spec["venus"], spec["mars"],
                               spec["jupiter"], spec["saturn"])
    if t == "chart":
        return L.lots(eng, jd(spec["jd"]), spec["lat"], spec["lon"],
                      spec.get("zodiac", "tropical"))
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.lots (embedded VSOP, full moon)",
           "cases": []}
    for c in build_cases():
        result = compute(c, eng)
        # self-check: Fortune and Spirit are symmetric about the Ascendant.
        if c["type"] == "chart":
            asc = eng.chart_at(jd(c["jd"]), c["lat"], c["lon"],
                               zodiac=c.get("zodiac", "tropical"))["angles"]["asc"]
            sym = (result["fortune"] + result["spirit"] - 2.0 * asc) % 360.0
            assert min(sym, 360.0 - sym) < 1e-9, f'{c["id"]}: fortune+spirit != 2*asc'
        out["cases"].append({"id": c["id"], "spec": c, "result": result})
        print(f'{c["id"]:24s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "lots-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
