#!/usr/bin/env python3
"""Self-check for astroengine.turbo: the turbo pack must reproduce the engine's
longitude to the fit tolerance, and the evaluator must be well-formed.
Run: python3 test_turbo.py   (needs packages/caelus/data/turbo.json)
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.turbo import Turbo

HERE = os.path.dirname(__file__)
PACK = os.path.join(HERE, "..", "packages", "caelus", "data", "turbo.json")

eng = Engine("full")
tb = Turbo.load(PACK)

checks = 0
fails = 0


def ok(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print(f"  FAIL: {msg}")


def angdist(a, b):
    return abs(((a - b + 180) % 360) - 180)

# Tolerance per body (arcsec): planets are well under the engine's own accuracy
# vs Swiss Ephemeris; the Moon is the limiting case.
TOL = {"moon": 0.1}
random.seed(7)
for body in tb.bodies:
    tol = TOL.get(body, 0.02)
    worst = 0.0
    for _ in range(500):
        jd = random.uniform(tb.jd0 + 1, tb.jd1 - 1)
        worst = max(worst, angdist(eng.longitude(body, jd), tb.longitude(body, jd)) * 3600)
    ok(worst < tol, f"{body}: turbo vs engine worst {worst:.4f}\" exceeds {tol}\"")

# Evaluator hygiene: in range works, out of range raises.
ok(0 <= tb.longitude("sun", tb.jd0 + 100) < 360, "longitude in range")
try:
    tb.longitude("sun", tb.jd1 + 10)
    ok(False, "out-of-range jd should raise")
except ValueError:
    ok(True, "out-of-range raises")
ok(tb.has("jupiter") and not tb.has("ceres"), "has() reports coverage")

print(f"{checks} checks, {fails} failures")
sys.exit(1 if fails else 0)
