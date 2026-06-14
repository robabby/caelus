#!/usr/bin/env python3
"""Cross-language golden for astroengine.spherical.

packages/caelus/test/spherical-golden.test.ts replays these specs through the
TS port and must reproduce them. Embedded tier, to match the TS engine.

Usage: python3 export_spherical_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import spherical as S


def jd(date):
    return julian_day(*date)


CASES = [
    # great-circle separation: pure inputs
    {"id": "sep-equal-lon", "type": "sep", "a": [0.0, 0.0], "b": [60.0, 0.0]},
    {"id": "sep-with-lat", "type": "sep", "a": [0.0, 5.0], "b": [60.0, -5.0]},
    {"id": "sep-poles", "type": "sep", "a": [0.0, 90.0], "b": [0.0, -90.0]},
    {"id": "sep-coincident", "type": "sep", "a": [10.0, 3.0], "b": [10.0, 3.0]},
    {"id": "sep-opposition", "type": "sep", "a": [0.0, 0.0], "b": [180.0, 0.0]},
    {"id": "sep-high-lat", "type": "sep", "a": [350.0, 17.0], "b": [10.0, -17.0]},
    # unit vectors
    {"id": "unit-aries", "type": "unit", "lon": 0.0, "lat": 0.0},
    {"id": "unit-cancer-lat", "type": "unit", "lon": 90.0, "lat": 12.0},
    # 3D separation of real bodies (latitude makes it differ from the 2D diff)
    {"id": "bodies-moon-sun", "type": "sep_bodies", "a": "moon", "b": "sun",
     "jd": [2000, 1, 1, 12, 0]},
    {"id": "bodies-moon-mars", "type": "sep_bodies", "a": "moon", "b": "mars",
     "jd": [2000, 1, 1, 12, 0]},
    {"id": "bodies-mercury-venus", "type": "sep_bodies", "a": "mercury",
     "b": "venus", "jd": [2024, 3, 20, 3, 0]},
    {"id": "bodies-pluto-sun", "type": "sep_bodies", "a": "pluto", "b": "sun",
     "jd": [2010, 7, 15, 18, 30]},
]


def compute(spec, eng):
    t = spec["type"]
    if t == "sep":
        return S.angular_separation_3d(spec["a"][0], spec["a"][1],
                                       spec["b"][0], spec["b"][1])
    if t == "unit":
        return list(S.unit_vector(spec["lon"], spec["lat"]))
    if t == "sep_bodies":
        j = jd(spec["jd"])
        pa = eng.position(spec["a"], j)
        pb = eng.position(spec["b"], j)
        return S.angular_separation_3d(pa["lon"], pa["lat"], pb["lon"], pb["lat"])
    raise ValueError(t)


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.spherical (embedded VSOP, full moon)",
           "cases": []}
    for c in CASES:
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:22s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "spherical-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
