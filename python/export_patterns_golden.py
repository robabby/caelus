#!/usr/bin/env python3
"""Cross-language golden for astroengine.patterns (aspect configurations).

Runs a fixed set of charts through the Python reference and records the
patterns found. packages/caelus/test/patterns-golden.test.ts replays the same
inputs through the TS port and must reproduce them exactly.

The synthetic cases double as an oracle: each body map is built to trigger (or
not) a specific configuration. One "at" case runs the canonical natal chart end
to end (build chart -> house-tag bodies -> detect) to exercise the wrapper.

Usage: python3 export_patterns_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine import patterns as P

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)


def house_of(lon, cusps):
    for i in range(12):
        a, b = cusps[i], cusps[(i + 1) % 12]
        if (lon - a) % 360.0 < (b - a) % 360.0:
            return i + 1
    return 12


def body_map(c):
    """Extract {name: {lon, house}} from a computed chart."""
    cusps = c["cusps"]
    return {
        name: {"lon": b["lon"], "house": house_of(b["lon"], cusps)}
        for name, b in c["bodies"].items()
    }


def build_cases():
    # Each "detect" case is a hand-built body map placed to form one pattern.
    return [
        {"id": "grand_trine", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 120}, "mars": {"lon": 240}}},
        {"id": "t_square", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 180}, "mars": {"lon": 90}}},
        {"id": "grand_cross", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 180}, "mars": {"lon": 90}, "venus": {"lon": 270}}},
        {"id": "yod", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 60}, "saturn": {"lon": 210}}},
        {"id": "kite", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 120}, "mars": {"lon": 240}, "venus": {"lon": 180}}},
        {"id": "mystic_rectangle", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 180}, "mars": {"lon": 60}, "venus": {"lon": 240}}},
        {"id": "stellium_sign", "type": "detect",
         "bodies": {"sun": {"lon": 2}, "moon": {"lon": 12}, "mercury": {"lon": 25}}},
        {"id": "stellium_house", "type": "detect",
         "bodies": {"sun": {"lon": 5, "house": 1}, "moon": {"lon": 40, "house": 1},
                    "mercury": {"lon": 200, "house": 1}}},
        {"id": "none", "type": "detect",
         "bodies": {"sun": {"lon": 0}, "moon": {"lon": 45}, "mars": {"lon": 200}}},
        {"id": "natal_tampa", "type": "at", "natal": NATAL, "lat": TAMPA[0], "lon": TAMPA[1]},
    ]


def compute(spec, eng):
    if spec["type"] == "detect":
        return P.detect_patterns(spec["bodies"])
    if spec["type"] == "at":
        c = eng.chart(spec["natal"][0], spec["natal"][1], spec["natal"][2],
                      spec["natal"][3], spec["natal"][4], 0, spec["lat"], spec["lon"], "placidus")
        return P.detect_patterns(body_map(c))
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.patterns; default orbs "
                    "(Ptolemaic DEFAULT_ORBS plus quincunx 3 deg); aspectable bodies",
           "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:18s} {len(out["cases"][-1]["result"])} pattern(s)')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "patterns-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
