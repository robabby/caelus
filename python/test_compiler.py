#!/usr/bin/env python3
"""Self-check for astroengine.compiler. Run: python3 test_compiler.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine import compiler as C

checks = 0
fails = 0


def ok(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print(f"  FAIL: {msg}")


# 1) Loss math: an exact aspect is 0, a sign placement is 0 inside the band.
ok(C.form_loss({"a": 10.0, "b": 70.0},
               [{"kind": "aspect", "a": "a", "b": "b", "angle": 60.0}]) < 1e-9,
   "an exact aspect has zero loss")
ok(C.form_loss({"v": 45.0}, [{"kind": "sign", "body": "v", "sign": 1}]) < 1e-9,
   "a body inside its sign has zero loss")
ok(abs(C.form_loss({"v": 75.0}, [{"kind": "sign", "body": "v", "sign": 1}]) - 15.0) < 1e-9,
   "a body 15 deg past its sign has loss 15")

# 2) A satisfiable form solves tightly and is not impossible.
sat = [
    {"kind": "aspect", "a": "venus", "b": "pluto", "angle": 180.0, "weight": 0.9},
    {"kind": "aspect", "a": "venus", "b": "mars", "angle": 0.0, "weight": 0.8},
    {"kind": "sign", "body": "venus", "sign": 1, "weight": 0.95},
]
r = C.compile_form(sat)
ok(not r["impossible"], "satisfiable form is not impossible")
ok(r["max_constraint_loss"] < 0.5, "satisfiable form solves tightly")
ok(30.0 <= r["longitudes"]["venus"] < 60.0, "Venus lands in Taurus")

# 3) A contradictory form is flagged impossible.
imp = [
    {"kind": "aspect", "a": "venus", "b": "mars", "angle": 0.0},
    {"kind": "aspect", "a": "venus", "b": "mars", "angle": 180.0},
]
ri = C.compile_form(imp)
ok(ri["impossible"], "contradictory form is flagged impossible")
ok(ri["max_constraint_loss"] > 30.0, "impossible form has a large residual")

# 4) Deterministic.
ok(C.compile_form(sat)["longitudes"] == C.compile_form(sat)["longitudes"],
   "compile_form is deterministic")

print(f"{checks} checks, {fails} failures")
sys.exit(1 if fails else 0)
