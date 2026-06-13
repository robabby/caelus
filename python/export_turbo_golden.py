#!/usr/bin/env python3
"""Cross-language golden for the turbo evaluator: sample the reference pack
(packages/caelus/data/turbo.json) with the Python Turbo evaluator and record
the longitudes. packages/caelus/test/turbo-golden.test.ts loads the same pack
and must reproduce them with the TS evaluator (this tests the evaluator, not
the fit, which is Python-only).

Usage: python3 export_turbo_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.turbo import Turbo

HERE = os.path.dirname(__file__)
PACK = os.path.join(HERE, "..", "packages", "caelus", "data", "turbo.json")


def main():
    tb = Turbo.load(PACK)
    span = tb.jd1 - tb.jd0
    cases = []
    for body in tb.bodies:
        for k in range(1, 12):  # 11 epochs spread across the range
            jd = tb.jd0 + span * k / 12.0
            cases.append({"body": body, "jd": jd, "lon": tb.longitude(body, jd)})
    out = {"basis": "Python Turbo evaluator on data/turbo.json", "cases": cases}
    path = os.path.join(HERE, "..", "packages", "caelus", "test", "turbo-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
