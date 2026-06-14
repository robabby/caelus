#!/usr/bin/env python3
"""Cross-language golden for astroengine.rajayoga (lordship/drishti + raja/dhana).

Runs a fixed set of specs through the Python reference and records the results.
packages/caelus/test/rajayoga-golden.test.ts replays the same specs through the
TS port and must reproduce them. Embedded tier.

Usage: python3 export_rajayoga_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import rajayoga as R

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)


def jd(date):
    return julian_day(*date)


def build_cases():
    return [
        # graha drishti: special aspects and a non-aspect
        {"id": "drishti-mars-4", "type": "drishti", "planet": "mars", "ps": 0, "ts": 3},
        {"id": "drishti-mars-8", "type": "drishti", "planet": "mars", "ps": 0, "ts": 7},
        {"id": "drishti-jup-5", "type": "drishti", "planet": "jupiter", "ps": 0, "ts": 4},
        {"id": "drishti-sat-3", "type": "drishti", "planet": "saturn", "ps": 0, "ts": 2},
        {"id": "drishti-sun-7", "type": "drishti", "planet": "sun", "ps": 0, "ts": 6},
        {"id": "drishti-sun-no", "type": "drishti", "planet": "sun", "ps": 0, "ts": 3},
        # parivartana and association type
        {"id": "pari", "type": "parivartana", "pa": "mars", "sa": 1, "pb": "venus", "sb": 0},
        {"id": "assoc-conj", "type": "assoc", "pa": "moon", "sa": 3, "pb": "sun", "sb": 3},
        {"id": "assoc-aspect", "type": "assoc", "pa": "mars", "sa": 0, "pb": "saturn", "sb": 6},
        # yogakarakas
        {"id": "yk-taurus", "type": "yogakaraka", "asc": 1},
        {"id": "yk-aries", "type": "yogakaraka", "asc": 0},
        {"id": "yk-cancer", "type": "yogakaraka", "asc": 3},
        # raja / dhana from constructed sign maps
        {"id": "raja-conj", "type": "raja", "asc": 0,
         "signs": {"sun": 3, "moon": 3, "mars": 0, "mercury": 5, "jupiter": 8, "venus": 6, "saturn": 9}},
        {"id": "dhana-conj", "type": "dhana", "asc": 0,
         "signs": {"sun": 4, "moon": 1, "mars": 1, "mercury": 7, "jupiter": 10, "venus": 4, "saturn": 2}},
        # engine path
        {"id": "raja-tampa", "type": "raja_at", "natal": NATAL, "lat": TAMPA[0], "lon": TAMPA[1]},
        {"id": "dhana-tampa", "type": "dhana_at", "natal": NATAL, "lat": TAMPA[0], "lon": TAMPA[1]},
    ]


def compute(spec, eng):
    t = spec["type"]
    if t == "drishti":
        return {"aspects": R.aspects_sign(spec["planet"], spec["ps"], spec["ts"])}
    if t == "parivartana":
        return {"exchange": R.parivartana(spec["pa"], spec["sa"], spec["pb"], spec["sb"])}
    if t == "assoc":
        return {"via": R.association_type(spec["pa"], spec["sa"], spec["pb"], spec["sb"])}
    if t == "yogakaraka":
        return {"yogakarakas": R.yogakarakas(spec["asc"])}
    if t == "raja":
        return R.raja_yogas(spec["signs"], spec["asc"])
    if t == "dhana":
        return R.dhana_yogas(spec["signs"], spec["asc"])
    if t == "raja_at":
        return R.raja_yogas_at(eng, jd(spec["natal"]), spec["lat"], spec["lon"])
    if t == "dhana_at":
        return R.dhana_yogas_at(eng, jd(spec["natal"]), spec["lat"], spec["lon"])
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.rajayoga (embedded VSOP, full moon); "
                    "BPHS lordship/drishti, Lahiri ayanamsa", "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:16s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "rajayoga-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
