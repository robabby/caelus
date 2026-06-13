#!/usr/bin/env python3
"""Cross-language golden for the when() query engine.

Runs a fixed set of query *specs* through the Python reference and records
the resulting intervals. packages/caelus/test/query-golden.test.ts replays
the SAME specs through the TS port and must reproduce the boundaries. The
specs here are the single source of truth, so the two engines can't drift.

Tier matches the engine golden (embedded VSOP + full moon) so TS and Python
evaluate identical positions.

Usage: python3 export_query_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import query as Q

NATAL_MOON = 283.284

CASES = [
    {"id": "saturn-square-natal-moon", "from": [2025, 1, 1], "to": [2028, 1, 1],
     "spec": {"kind": "aspect", "body": "saturn", "aspect": "square",
              "target": NATAL_MOON, "orb": 1.0}},
    {"id": "venus-in-taurus", "from": [2025, 1, 1], "to": [2028, 1, 1],
     "spec": {"kind": "in_sign", "body": "venus", "sign": "Taurus"}},
    {"id": "mercury-retrograde", "from": [2025, 1, 1], "to": [2026, 1, 1],
     "spec": {"kind": "retrograde", "body": "mercury"}},
    {"id": "electional-triple", "from": [2025, 1, 1], "to": [2028, 1, 1],
     "spec": {"kind": "all", "of": [
         {"kind": "aspect", "body": "saturn", "aspect": "square",
          "target": NATAL_MOON, "orb": 2.0},
         {"kind": "not_retrograde", "body": "mercury"},
         {"kind": "in_sign", "body": "venus", "sign": "Taurus"}]}},
    {"id": "venus-taurus-or-mars-leo", "from": [2025, 1, 1], "to": [2028, 1, 1],
     "spec": {"kind": "any", "of": [
         {"kind": "in_sign", "body": "venus", "sign": "Taurus"},
         {"kind": "in_sign", "body": "mars", "sign": "Leo"}]}},
    {"id": "moon-conjunct-sun", "from": [2025, 1, 1], "to": [2025, 3, 1],
     "spec": {"kind": "aspect", "body": "moon", "aspect": "conjunction",
              "target": "sun", "orb": 1.0}},
]


def build(spec):
    k = spec["kind"]
    if k == "aspect":
        return Q.aspect(spec["body"], spec["aspect"], spec["target"],
                        spec.get("orb", 1.0))
    if k == "in_sign":
        return Q.in_sign(spec["body"], spec["sign"])
    if k == "retrograde":
        return Q.retrograde(spec["body"])
    if k == "not_retrograde":
        return Q.not_retrograde(spec["body"])
    if k == "all":
        return Q.all_(*[build(s) for s in spec["of"]])
    if k == "any":
        return Q.any_(*[build(s) for s in spec["of"]])
    if k == "not":
        return Q.not_(build(spec["of"]))
    raise ValueError(f"unknown spec kind {k}")


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.query (embedded VSOP, full moon)",
           "cases": []}
    for c in CASES:
        jd0 = julian_day(*c["from"])
        jd1 = julian_day(*c["to"])
        intervals = Q.when(eng, build(c["spec"]), jd0, jd1)
        out["cases"].append({"id": c["id"], "jd0": jd0, "jd1": jd1,
                             "spec": c["spec"], "intervals": intervals})
        print(f'{c["id"]:28s} {len(intervals)} intervals')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "query-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
