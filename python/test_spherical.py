#!/usr/bin/env python3
"""Self-check for astroengine.spherical. Run: python3 test_spherical.py"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import spherical as S

eng = Engine("full")
checks = 0
fails = 0


def ok(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print(f"  FAIL: {msg}")


# 1) On the ecliptic, the great-circle angle is the longitude difference.
ok(abs(S.angular_separation_3d(0, 0, 60, 0) - 60) < 1e-12, "lat 0 equals the longitude diff")
ok(abs(S.angular_separation_3d(0, 0, 180, 0) - 180) < 1e-12, "antipodal longitudes are 180")
ok(abs(S.angular_separation_3d(0, 90, 0, -90) - 180) < 1e-12, "the ecliptic poles are 180 apart")
ok(abs(S.angular_separation_3d(33, 7, 33, 7)) < 1e-5, "coincident points are ~0")

# 2) Symmetry.
ok(abs(S.angular_separation_3d(10, 3, 200, -8) - S.angular_separation_3d(200, -8, 10, 3)) < 1e-12,
   "separation is symmetric in its two bodies")

# 3) Unit vectors: norm 1 and the frame axes.
for lon, lat in [(0, 0), (90, 0), (0, 90), (123, 17)]:
    x, y, z = S.unit_vector(lon, lat)
    ok(abs(math.sqrt(x * x + y * y + z * z) - 1) < 1e-12, f"unit vector has norm 1 ({lon},{lat})")
ux = S.unit_vector(0, 0)
ok(abs(ux[0] - 1) < 1e-12 and abs(ux[1]) < 1e-12 and abs(ux[2]) < 1e-12, "0 Aries points along +x")
uz = S.unit_vector(0, 90)
ok(abs(uz[2] - 1) < 1e-12, "the north ecliptic pole points along +z")

# 4) Real bodies: the 3D angle stays within the sum of the two latitudes of the
#    2D longitude difference (moving each point off the ecliptic by its latitude
#    can change the great-circle distance by at most that much), and the Moon's
#    latitude visibly widens its separation from the on-ecliptic Sun here.
jd = julian_day(2000, 1, 1, 12, 0)
pm = eng.position("moon", jd)
ps = eng.position("sun", jd)
d2 = abs(((pm["lon"] - ps["lon"] + 180) % 360) - 180)
d3 = S.angular_separation_3d(pm["lon"], pm["lat"], ps["lon"], ps["lat"])
ok(0.0 <= d3 <= 180.0, "3D separation is in [0, 180]")
ok(abs(d3 - d2) <= abs(pm["lat"]) + abs(ps["lat"]) + 1e-9,
   "3D angle is within the latitude sum of the 2D longitude difference")
ok(d3 > d2, f"the Moon's latitude widens the Moon-Sun separation ({d2:.3f} -> {d3:.3f})")

print(f"{checks} checks, {fails} failures")
sys.exit(1 if fails else 0)
