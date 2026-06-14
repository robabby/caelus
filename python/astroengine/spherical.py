"""astroengine.spherical -- spherical-geometry primitives for 3D chart views.

A body sits at a point on the celestial sphere, not just a zodiac longitude.
These helpers give the unit vector for an (ecliptic longitude, latitude) pair
and the true great-circle angle between two bodies. That angle is the basis for
3D aspects: the separation in space, accounting for ecliptic latitude, rather
than the 2D difference of longitudes a flat wheel uses.

Pure trig. The TS port (spherical.ts) reproduces it, pinned by the golden.
"""
import math

from .core import DEG


def unit_vector(lon_deg, lat_deg):
    """Unit vector on the sphere for an (ecliptic longitude, latitude) pair, in
    the ecliptic frame: x toward 0 Aries, z toward the north ecliptic pole."""
    lam = lon_deg * DEG
    beta = lat_deg * DEG
    cb = math.cos(beta)
    return (cb * math.cos(lam), cb * math.sin(lam), math.sin(beta))


def angular_separation_3d(lon_a, lat_a, lon_b, lat_b):
    """True great-circle angle (degrees) between two bodies from their ecliptic
    longitude and latitude. With both latitudes zero this is the unsigned
    longitude difference; latitude pulls the two apart in three dimensions."""
    ax, ay, az = unit_vector(lon_a, lat_a)
    bx, by, bz = unit_vector(lon_b, lat_b)
    dot = max(-1.0, min(1.0, ax * bx + ay * by + az * bz))
    return math.acos(dot) / DEG
