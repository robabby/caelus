"""astroengine.stars -- fixed stars: apparent places from the HYG-derived
catalog (data/fixed_stars.json; ICRS J2000 with proper motions).

Chain: full 3D space motion (proper motion + radial velocity at the
parallax distance) -> ICRS equatorial -> ecliptic J2000 -> IAU 1976
precession to date -> annual aberration (classic elliptic form, as for
Pluto/Chiron) -> nutation. Validated against swe_fixstar fed the same
catalog rows: <=0.3 arcsec over 1900-2099.
"""
import json
import math
import os

from .core import (DEG, ARCSEC, J2000, nutation, _precess_ecliptic)

KM_PER_AU = 149597870.7
AU_PER_PC = 206264.806

_CATALOG = None


def catalog():
    global _CATALOG
    if _CATALOG is None:
        path = os.path.join(os.path.dirname(__file__), "data", "fixed_stars.json")
        with open(path) as f:
            _CATALOG = json.load(f)
    return _CATALOG


def star_apparent(vsop, s, jde):
    """Apparent ecliptic lon/lat of date (rad) for a catalog entry dict."""
    t = (jde - J2000) / 365.25
    ra = s["ra"] * DEG
    dec = s["dec"] * DEG
    r_au = AU_PER_PC / (s["plx"] * 1e-3) if s["plx"] > 0 else 1e9 * AU_PER_PC
    cd, sd, cr, sr = math.cos(dec), math.sin(dec), math.cos(ra), math.sin(ra)
    p = (cd * cr, cd * sr, sd)
    east = (-sr, cr, 0.0)
    north = (-sd * cr, -sd * sr, cd)
    pmra = s["pmra"] * 1e-3 * ARCSEC   # rad/yr (mu_alpha*)
    pmdec = s["pmdec"] * 1e-3 * ARCSEC
    rv = s["rv"] * 86400 * 365.25 / KM_PER_AU  # AU/yr
    pos = [p[i] * r_au + (east[i] * pmra * r_au + north[i] * pmdec * r_au
                          + p[i] * rv) * t for i in range(3)]
    rn = math.sqrt(sum(c * c for c in pos))
    x, y, z = (c / rn for c in pos)
    ra2 = math.atan2(y, x)
    dec2 = math.asin(z)
    e0 = 84381.448 * ARCSEC
    lat = math.asin(math.sin(dec2) * math.cos(e0)
                    - math.cos(dec2) * math.sin(e0) * math.sin(ra2))
    lon = math.atan2(math.sin(ra2) * math.cos(e0) + math.tan(dec2) * math.sin(e0),
                     math.cos(ra2)) % (2 * math.pi)
    lon, lat = _precess_ecliptic(lon, lat, J2000, jde)
    L0, _, _ = vsop.heliocentric("earth", jde)
    sun_lon = (L0 + math.pi) % (2 * math.pi)
    T = (jde - J2000) / 36525.0
    k = 20.4898 * ARCSEC
    e = 0.016708634 - 0.000042037 * T
    pi_per = (102.93735 + 1.71946 * T) * DEG
    lon += (-k * math.cos(sun_lon - lon) + e * k * math.cos(pi_per - lon)) / math.cos(lat)
    lat += -k * math.sin(lat) * (math.sin(sun_lon - lon) - e * math.sin(pi_per - lon))
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat
