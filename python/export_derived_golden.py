#!/usr/bin/env python3
"""Cross-language golden for astroengine.derived.

Runs a fixed set of derivation specs through the Python reference and records
the results. packages/caelus/test/derived-golden.test.ts replays the same
specs through the TS port and must reproduce them. Tier matches the engine
golden (embedded VSOP + full moon).

Usage: python3 export_derived_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import derived as D

NATAL = [1990, 6, 10, 14, 30]
PARTNER = [1988, 2, 3, 9, 0]

CASES = [
    {"id": "solar-return", "type": "returns", "body": "sun",
     "natal": NATAL, "start": 300, "end": 430},
    {"id": "lunar-return", "type": "returns", "body": "moon",
     "natal": NATAL, "start": 20, "end": 35},
    {"id": "progressed-jd", "type": "progressed_jd",
     "natal": NATAL, "target": [2025, 6, 10]},
    {"id": "solar-arc", "type": "solar_arc",
     "natal": NATAL, "target": [2025, 6, 10]},
    {"id": "directed", "type": "directed", "natal": NATAL,
     "target": [2025, 6, 10], "bodies": ["moon", "venus", "mars", "saturn"]},
    {"id": "composite", "type": "composite", "a": NATAL, "b": PARTNER,
     "bodies": ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]},
    {"id": "davison", "type": "davison", "a": NATAL, "b": PARTNER,
     "lat_a": 27.95, "lon_a": -82.46, "lat_b": 51.5, "lon_b": -0.12},
    {"id": "harmonic-5", "type": "harmonic", "jd": NATAL, "n": 5,
     "bodies": ["sun", "moon", "venus", "mars"]},
    {"id": "antiscia", "type": "antiscia", "jd": NATAL,
     "bodies": ["sun", "mercury", "mars"]},
    {"id": "dec-aspects", "type": "dec_aspects", "jd": NATAL, "orb": 2.0,
     "bodies": ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]},
    {"id": "out-of-bounds", "type": "oob", "jd": NATAL,
     "bodies": ["sun", "moon", "mercury", "venus", "mars"]},
    {"id": "dignities", "type": "dignities", "jd": NATAL,
     "bodies": ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]},
    {"id": "sect", "type": "sect", "jd": NATAL, "lat": 27.95, "lon": -82.46},
]


def jd(date):
    return julian_day(*date)


def compute(spec, eng):
    t = spec["type"]
    if t == "returns":
        n = jd(spec["natal"])
        return D.returns(eng, spec["body"], n, n + spec["start"], n + spec["end"])
    if t == "progressed_jd":
        return D.progressed_jd(jd(spec["natal"]), jd(spec["target"]))
    if t == "solar_arc":
        return D.solar_arc(eng, jd(spec["natal"]), jd(spec["target"]))
    if t == "directed":
        n, tg = jd(spec["natal"]), jd(spec["target"])
        return {b: D.directed_longitude(eng, b, n, tg) for b in spec["bodies"]}
    if t == "composite":
        return D.composite_longitudes(eng, jd(spec["a"]), jd(spec["b"]), spec["bodies"])
    if t == "davison":
        return list(D.davison_params(jd(spec["a"]), jd(spec["b"]),
                    spec["lat_a"], spec["lon_a"], spec["lat_b"], spec["lon_b"]))
    if t == "harmonic":
        return D.harmonic_chart(eng, jd(spec["jd"]), spec["bodies"], spec["n"])
    if t == "antiscia":
        j = jd(spec["jd"])
        return {b: [D.antiscion(eng.longitude(b, j)),
                    D.contra_antiscion(eng.longitude(b, j))] for b in spec["bodies"]}
    if t == "dec_aspects":
        return D.declination_aspects(eng, spec["bodies"], jd(spec["jd"]),
                                     spec.get("orb", 1.0))
    if t == "oob":
        j = jd(spec["jd"])
        return {b: D.out_of_bounds_margin(eng, b, j) for b in spec["bodies"]}
    if t == "dignities":
        j = jd(spec["jd"])
        return {b: D.dignity_of(eng, b, j) for b in spec["bodies"]}
    if t == "sect":
        from astroengine.pheno import az_alt
        j, lat, lon = jd(spec["jd"]), spec["lat"], spec["lon"]
        sun = eng.position("sun", j)
        _, alt = az_alt(sun["lon"], sun["lat"], j, lat, lon)
        return {"day": D.is_day_chart(eng, j, lat, lon), "sun_alt": alt}
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.derived (embedded VSOP, full moon)",
           "cases": []}
    for c in CASES:
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:16s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "derived-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
