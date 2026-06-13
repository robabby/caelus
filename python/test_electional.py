#!/usr/bin/env python3
"""Self-check for astroengine.electional: the primitives must be internally
consistent with the data they sit on. Run: python3 test_electional.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import electional as E

eng = Engine("full")
JD = julian_day(2000, 1, 1, 18, 0)   # 13:00 local Tampa, daytime
TAMPA = (27.95, -82.46)

checks = 0
fails = 0


def ok(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print(f"  FAIL: {msg}")


# 1) Applying/separating: a body behind and faster closes a conjunction; ahead
#    and faster opens it. Phase is independent of argument order.
ok(E.aspect_phase(355.0, 1.0, 0.0, 0.0, 0.0) == "applying",
   "a behind and faster should be applying to the conjunction")
ok(E.aspect_phase(5.0, 1.0, 0.0, 0.0, 0.0) == "separating",
   "a ahead and faster should be separating from the conjunction")
ok(E.aspect_phase(85.0, 1.2, 0.0, 0.1, 90.0)
   == E.aspect_phase(0.0, 0.1, 85.0, 1.2, 90.0),
   "aspect phase must not depend on argument order")

# 2) Separation is symmetric and bounded; signed elongation negates on swap.
ok(abs(E.separation(10.0, 350.0) - 20.0) < 1e-12, "separation wraps across 0")
ok(0.0 <= E.separation(123.0, 7.0) <= 180.0, "separation is in [0, 180]")
ok(abs(E.signed_elongation(10.0, 0.0) + E.signed_elongation(0.0, 10.0)) < 1e-12,
   "signed elongation negates when the bodies are swapped")

# 3) Solar phase: the Sun has none; Mercury is near the Sun on 2000-01-01.
ok(E.solar_phase(eng, "sun", JD) is None, "the Sun has no solar phase")
elong = E.solar_elongation(eng, "mercury", JD)
ok(0.0 <= elong <= 180.0, "solar elongation is in [0, 180]")
ok(E.solar_phase(eng, "mercury", JD) == "combust",
   f"Mercury should be combust on 2000-01-01 (elongation {elong:.2f})")
ok(E.solar_phase(eng, "mercury", JD, combust=elong - 1.0) in ("under_beams", None)
   or elong > 15.0, "tightening the combust orb past the elongation drops it")

# 4) Planetary hours: well-formed, day ruler matches the weekday, hours cycle
#    through the Chaldean order.
ph = E.planetary_hour(eng, JD, *TAMPA)
ok(ph is not None, "planetary hour should resolve at a mid latitude")
ok(1 <= ph["hour"] <= 24, "planetary hour number is in 1..24")
ok(ph["kind"] == "day" and ph["hour"] <= 12, "midday should be a day hour")
ok(ph["day_ruler"] == "saturn", "2000-01-01 is a Saturday; day ruler is Saturn")
ok(ph["start"] <= JD < ph["end"], "jd falls inside the returned hour")
nxt = E.planetary_hour(eng, ph["end"] + 1e-4, *TAMPA)
ok(E.CHALDEAN[(E.CHALDEAN.index(ph["ruler"]) + 1) % 7] == nxt["ruler"],
   "consecutive planetary hours follow the Chaldean order")

# 5) Void of course: the reported sign is the Moon's sign; ordering is sane.
voc = E.void_of_course(eng, JD)
moon = eng.longitude("moon", JD)
ok(voc["sign"] == E.SIGNS[int(moon // 30) % 12], "voc sign is the Moon's sign")
ok(voc["sign_exit"] > JD, "the sign exit is in the future")
if voc["is_void"]:
    ok(voc["next_aspect"] is None, "a void Moon has no next aspect before the exit")
else:
    ok(JD < voc["next_aspect"] <= voc["sign_exit"] + 1e-6,
       "the next aspect perfects before the Moon changes sign")

# 6) House placement: equal cusps from 0 Aries place longitudes by 30 deg bands,
#    and the angularity classes are the standard ones.
cusps = [i * 30.0 for i in range(12)]
ok(E.house_of(15.0, cusps) == 1, "15 deg is in the first 30 deg house")
ok(E.house_of(35.0, cusps) == 2, "35 deg is in the second house")
ok(E.house_of(359.0, cusps) == 12, "359 deg is in the twelfth house")
ok([E.angularity(h) for h in (1, 4, 7, 10)] == ["angular"] * 4,
   "houses 1/4/7/10 are angular")
ok(E.angularity(2) == "succedent" and E.angularity(3) == "cadent",
   "houses 2 and 3 are succedent and cadent")

print(f"{checks} checks, {fails} failures")
sys.exit(1 if fails else 0)
