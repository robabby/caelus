#!/usr/bin/env python3
"""Cross-language golden for astroengine.dignity_score (weighted dignities).

A fixed set of (planet, longitude, sect) scores, almuten queries, and one "at"
case scoring the seven classical planets at their natal positions. The TS port
(dignity_score.test.ts) must reproduce every value. The hand-built cases double
as an oracle: each is placed to exercise a specific dignity, debility, term/face
boundary, or almuten contest.

Usage: python3 export_dignity_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine import dignity_score as D

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)


def build_cases():
    score = lambda i, p, lon, sect: {"id": i, "type": "score", "planet": p, "lon": lon, "sect": sect}
    alm = lambda i, lon, sect: {"id": i, "type": "almuten", "lon": lon, "sect": sect}
    return [
        score("sun_15leo_day", "sun", 135.0, "day"),       # rulership + fire-day triplicity
        score("mars_5aries_day", "mars", 5.0, "day"),       # rulership + Mars face
        score("saturn_5aries_day", "saturn", 5.0, "day"),   # fall + peregrine
        score("venus_2taurus_day", "venus", 32.0, "day"),   # rulership + Venus term
        score("jupiter_4pisces_night", "jupiter", 334.0, "night"),  # rulership + exaltation
        score("mercury_25gem_night", "mercury", 85.0, "night"),     # rulership + night-air triplicity
        score("moon_10cancer_night", "moon", 100.0, "night"),       # rulership + night-water triplicity
        score("sun_15aqu_day", "sun", 315.0, "day"),        # detriment (opposite Leo)
        alm("alm_5aries_day", 5.0, "day"),                  # Sun (exalt + triplicity) wins
        alm("alm_15leo_day", 135.0, "day"),                 # Sun (rulership + triplicity)
        alm("alm_20libra_night", 200.0, "night"),
        {"id": "natal_tampa", "type": "at", "natal": NATAL, "lat": TAMPA[0], "lon": TAMPA[1], "sect": "day"},
    ]


def compute(spec, eng):
    if spec["type"] == "score":
        return D.dignity_score(spec["planet"], spec["lon"], spec["sect"])
    if spec["type"] == "almuten":
        return D.almuten(spec["lon"], spec["sect"])
    if spec["type"] == "at":
        c = eng.chart(spec["natal"][0], spec["natal"][1], spec["natal"][2],
                      spec["natal"][3], spec["natal"][4], 0, spec["lat"], spec["lon"], "placidus")
        return {p: D.dignity_score(p, c["bodies"][p]["lon"], spec["sect"]) for p in D.PLANETS}
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.dignity_score; Lilly weights, "
                    "Egyptian terms, Dorothean triplicities, Chaldean faces", "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:22s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "dignity-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
