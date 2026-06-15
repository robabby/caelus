#!/usr/bin/env python3
"""Cross-language golden for astroengine.signature (structural chart signature).

Runs a fixed set of inputs through the Python reference and records the counts.
packages/caelus/test/signature-golden.test.ts replays them through the TS port
and must reproduce them exactly. The synthetic cases double as an oracle (each
body map is placed to land specific distributions and dominance / tie outcomes);
one "at" case runs the canonical natal chart end to end.

Usage: python3 export_signature_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine import signature as S

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)


def house_of(lon, cusps):
    for i in range(12):
        a, b = cusps[i], cusps[(i + 1) % 12]
        if (lon - a) % 360.0 < (b - a) % 360.0:
            return i + 1
    return 12


def body_map(c):
    cusps = c["cusps"]
    return {
        name: {"lon": b["lon"], "house": house_of(b["lon"], cusps)}
        for name, b in c["bodies"].items()
    }


def build_cases():
    return [
        # All three in Aries: fire/cardinal dominate, Aries the dominant sign;
        # Ascendant in Aries gives Mars as ruler.
        {"id": "aries_stellium", "type": "sig", "asc_sign": 0,
         "bodies": {"sun": {"lon": 5}, "moon": {"lon": 15}, "mars": {"lon": 25}}},
        # Four cardinal signs in the four angular houses: a four-way element tie
        # (resolved to fire), cardinal sweep, no dominant sign, even hemispheres.
        {"id": "angular_cross", "type": "sig",
         "bodies": {"sun": {"lon": 5, "house": 1}, "moon": {"lon": 100, "house": 4},
                    "mercury": {"lon": 200, "house": 7}, "venus": {"lon": 280, "house": 10}}},
        # Fixed-water emphasis with houses, Ascendant in Scorpio (ruler Mars).
        {"id": "fixed_water", "type": "sig", "asc_sign": 7,
         "bodies": {"sun": {"lon": 215, "house": 1}, "moon": {"lon": 225, "house": 1},
                    "mars": {"lon": 130, "house": 10}, "venus": {"lon": 320, "house": 5}}},
        {"id": "natal_tampa", "type": "at", "natal": NATAL, "lat": TAMPA[0], "lon": TAMPA[1]},
    ]


def compute(spec, eng):
    if spec["type"] == "sig":
        return S.chart_signature(spec["bodies"], spec.get("asc_sign"))
    if spec["type"] == "at":
        c = eng.chart(spec["natal"][0], spec["natal"][1], spec["natal"][2],
                      spec["natal"][3], spec["natal"][4], 0, spec["lat"], spec["lon"], "placidus")
        asc_sign = int(c["angles"]["asc"] // 30) % 12
        return S.chart_signature(body_map(c), asc_sign)
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.signature; aspectable bodies, "
                    "unweighted counts; classical chart ruler", "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:16s} dominant={out["cases"][-1]["result"]["dominant"]}')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "signature-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
