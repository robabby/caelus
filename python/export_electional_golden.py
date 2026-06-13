#!/usr/bin/env python3
"""Cross-language golden for astroengine.electional.

Runs a fixed set of electional specs through the Python reference and records
the results. packages/caelus/test/electional-golden.test.ts replays the same
specs through the TS port and must reproduce them. Embedded tier, to match the
TS engine's embedded data.

Usage: python3 export_electional_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import electional as E

TAMPA = (27.95, -82.46)
LONDON = (51.5, -0.12)


def jd(date):
    return julian_day(*date)


# Real Placidus cusps to exercise house_of with, computed once below.
def _cusps(eng, date, lat, lon):
    y, mo, d, h, mi = date
    return eng.chart(y, mo, d, h, mi, 0, lat, lon, "placidus")["cusps"]


def build_cases(eng):
    cusps = _cusps(eng, [2000, 1, 1, 12, 0], *TAMPA)
    cases = [
        # applying / separating: pure, from longitudes + speeds
        {"id": "phase-conj-sep", "type": "aspect_phase",
         "lon_a": 10.0, "speed_a": 1.0, "lon_b": 0.0, "speed_b": 0.0, "aspect": 0.0},
        {"id": "phase-conj-app", "type": "aspect_phase",
         "lon_a": 355.0, "speed_a": 1.0, "lon_b": 0.0, "speed_b": 0.0, "aspect": 0.0},
        {"id": "phase-sextile", "type": "aspect_phase",
         "lon_a": 50.0, "speed_a": 0.5, "lon_b": 0.0, "speed_b": 1.0, "aspect": 60.0},
        {"id": "phase-square-app", "type": "aspect_phase",
         "lon_a": 85.0, "speed_a": 1.2, "lon_b": 0.0, "speed_b": 0.1, "aspect": 90.0},
        {"id": "phase-trine-sep", "type": "aspect_phase",
         "lon_a": 125.0, "speed_a": 1.0, "lon_b": 0.0, "speed_b": 0.0, "aspect": 120.0},
        # aspect_between: tightest aspect + phase for two bodies
        {"id": "between-moon-sun", "type": "aspect_between",
         "a": "moon", "b": "sun", "jd": [2000, 1, 1, 12, 0]},
        {"id": "between-mars-saturn", "type": "aspect_between",
         "a": "mars", "b": "saturn", "jd": [2000, 1, 1, 12, 0]},
        {"id": "between-venus-jupiter", "type": "aspect_between",
         "a": "venus", "b": "jupiter", "jd": [2024, 3, 20, 3, 0]},
        # solar phase: cazimi / combust / under-the-beams
        {"id": "solar-mercury", "type": "solar", "body": "mercury",
         "jd": [2000, 1, 1, 12, 0]},
        {"id": "solar-venus", "type": "solar", "body": "venus",
         "jd": [2000, 1, 1, 12, 0]},
        {"id": "solar-mars", "type": "solar", "body": "mars",
         "jd": [2010, 7, 15, 18, 30]},
        {"id": "solar-mercury-2", "type": "solar", "body": "mercury",
         "jd": [2024, 3, 20, 3, 0]},
        # planetary hours
        {"id": "phour-tampa", "type": "phour", "jd": [2000, 1, 1, 12, 0],
         "lat": TAMPA[0], "lon": TAMPA[1]},
        {"id": "phour-london", "type": "phour", "jd": [2024, 3, 20, 3, 0],
         "lat": LONDON[0], "lon": LONDON[1]},
        {"id": "phour-tampa-night", "type": "phour", "jd": [2010, 7, 15, 4, 0],
         "lat": TAMPA[0], "lon": TAMPA[1]},
        # void-of-course Moon
        {"id": "voc-2000", "type": "voc", "jd": [2000, 1, 1, 12, 0]},
        {"id": "voc-2024", "type": "voc", "jd": [2024, 3, 20, 3, 0]},
        # house placement: pure, from a longitude + explicit cusps
        {"id": "house-0", "type": "house", "lon": 0.0, "cusps": cusps},
        {"id": "house-95", "type": "house", "lon": 95.0, "cusps": cusps},
        {"id": "house-200", "type": "house", "lon": 200.0, "cusps": cusps},
        {"id": "house-310", "type": "house", "lon": 310.0, "cusps": cusps},
    ]
    return cases


def compute(spec, eng):
    t = spec["type"]
    if t == "aspect_phase":
        return E.aspect_phase(spec["lon_a"], spec["speed_a"],
                              spec["lon_b"], spec["speed_b"], spec["aspect"])
    if t == "aspect_between":
        return E.aspect_between(eng, spec["a"], spec["b"], jd(spec["jd"]))
    if t == "solar":
        return {"elongation": E.solar_elongation(eng, spec["body"], jd(spec["jd"])),
                "phase": E.solar_phase(eng, spec["body"], jd(spec["jd"]))}
    if t == "phour":
        return E.planetary_hour(eng, jd(spec["jd"]), spec["lat"], spec["lon"])
    if t == "voc":
        return E.void_of_course(eng, jd(spec["jd"]))
    if t == "house":
        h = E.house_of(spec["lon"], spec["cusps"])
        return {"house": h, "angularity": E.angularity(h)}
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.electional (embedded VSOP, full moon)",
           "cases": []}
    for c in build_cases(eng):
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:20s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "electional-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
