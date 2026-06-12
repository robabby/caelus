"""astroengine.events -- rise/set/meridian transits, zodiac crossings,
lunar phases, stations.

Rise/set condition (matches Swiss Ephemeris defaults, calibrated against
swe_rise_trans at standard pressure/temperature): the topocentric true
altitude of the disc center equals -(R0 + topocentric semidiameter), with
R0 = 34.076 arcmin scaled by (pressure/1010)(283/(273+temp)). All searches
are bracketed sign changes refined by bisection; speeds come from the same
apparent-position pipeline as the chart API, so retrograde loops and
multiple crossings are found, not assumed away.
"""
import math
from .core import (DEG, jd_tt, equatorial, true_obliquity, topocentric_ecl)
from .houses import gast
from .pheno import DIAMETER_KM

TWO_PI = 2 * math.pi
KM_PER_AU = 149597870.7
R0_ARCMIN = 34.076  # horizon refraction at 1010 hPa / 10 C (empirical vs SE)


def _topo_alt_ha(engine, body, jd_ut, lat_deg, lon_deg, alt_m):
    """Topocentric true altitude (rad), hour angle (rad), distance (AU)."""
    jde = jd_tt(jd_ut)
    lon, lat, dist = engine._ecliptic(body, jde)
    eps = true_obliquity(jde)
    lst = (gast(jd_ut) + lon_deg * DEG) % TWO_PI
    if dist is not None:
        lon, lat, dist = topocentric_ecl(lon, lat, dist, lst,
                                         lat_deg * DEG, alt_m, eps)
    ra, dec = equatorial(lon, lat, eps)
    ha = (lst - ra + math.pi) % TWO_PI - math.pi
    phi = lat_deg * DEG
    alt = math.asin(math.sin(phi) * math.sin(dec)
                    + math.cos(phi) * math.cos(dec) * math.cos(ha))
    return alt, ha, dist


def _bisect(f, a, b, iters=45):
    fa = f(a)
    for _ in range(iters):
        m = (a + b) / 2
        if fa * f(m) <= 0:
            b = m
        else:
            a = m
            fa = f(a)
    return (a + b) / 2


def rise_set(engine, body, jd_start, lat_deg, lon_deg, kind="rise",
             alt_m=0.0, pressure=1013.25, temp_c=15.0, search_days=2.0):
    """Next rise/set/meridian transit (UT JD) after jd_start, or None when
    the event does not occur in the window (polar day/night). kind:
    rise | set | mtransit (upper culmination) | itransit (lower)."""
    scale = (pressure / 1010.0) * (283.0 / (273.0 + temp_c))

    if kind in ("mtransit", "itransit"):
        target = 0.0 if kind == "mtransit" else math.pi

        def g(t):
            _, ha, _ = _topo_alt_ha(engine, body, t, lat_deg, lon_deg, alt_m)
            return (ha - target + math.pi) % TWO_PI - math.pi

        step = 1.0 / 48
        prev = g(jd_start)
        t = jd_start + step
        while t <= jd_start + search_days:
            cur = g(t)
            if prev * cur < 0 and abs(cur - prev) < math.pi:
                return _bisect(g, t - step, t)
            prev = cur
            t += step
        return None

    def f(t):
        alt, _, dist = _topo_alt_ha(engine, body, t, lat_deg, lon_deg, alt_m)
        sd = 0.0
        diam = DIAMETER_KM.get(body)
        if diam is not None and dist is not None:
            sd = math.asin(diam / (2 * dist * KM_PER_AU))
        h0 = -(R0_ARCMIN / 60.0 * scale * DEG + sd)
        return alt - h0

    step = 1.0 / 48  # 30 min: well under the fastest crossing scale
    prev = f(jd_start)
    t = jd_start + step
    while t <= jd_start + search_days:
        cur = f(t)
        if (kind == "rise" and prev < 0 <= cur) or (kind == "set" and prev > 0 >= cur):
            return _bisect(f, t - step, t)
        prev = cur
        t += step
    return None


def crossings(engine, body, target_lon, jd_start, jd_end, zodiac="tropical",
              max_hits=60):
    """UT JDs where the body's apparent longitude crosses target_lon
    (degrees) in [jd_start, jd_end]. Retrograde bodies can cross a degree
    three times; every crossing is returned in time order."""
    def f(t):
        return (engine.longitude(body, t, zodiac=zodiac) - target_lon + 180) % 360 - 180

    fast = body in ("moon", "mean_node", "true_node", "mean_lilith")
    step = 0.25 if fast else 1.0
    out = []
    prev = f(jd_start)
    t = jd_start + step
    while t <= jd_end and len(out) < max_hits:
        cur = f(t)
        if prev * cur < 0 and abs(cur - prev) < 180:
            out.append(_bisect(f, t - step, t))
        prev = cur
        t += step
    return out


def lunar_phases(engine, jd_start, jd_end, max_hits=60):
    """New/first-quarter/full/last-quarter times in [jd_start, jd_end]:
    list of (jd_ut, phase) with phase in {new, first_quarter, full,
    last_quarter} (sun-moon elongation = 0/90/180/270)."""
    def elong(t):
        return (engine.longitude("moon", t) - engine.longitude("sun", t)) % 360

    names = {0: "new", 90: "first_quarter", 180: "full", 270: "last_quarter"}
    out = []
    step = 0.25
    for angle, name in names.items():
        def f(t, a=angle):
            return (elong(t) - a + 180) % 360 - 180
        prev = f(jd_start)
        t = jd_start + step
        while t <= jd_end and len(out) < max_hits:
            cur = f(t)
            if prev * cur < 0 and abs(cur - prev) < 180:
                out.append((_bisect(f, t - step, t), name))
            prev = cur
            t += step
    out.sort()
    return out


def stations(engine, body, jd_start, jd_end, max_hits=30):
    """Times the body stations (speed crosses zero): list of
    (jd_ut, "retrograde"|"direct"). Sun and Moon never station."""
    h = 0.25

    def speed(t):
        l0 = engine.longitude(body, t - h)
        l1 = engine.longitude(body, t + h)
        return ((l1 - l0 + 540) % 360 - 180) / (2 * h)

    step = 2.0
    out = []
    prev = speed(jd_start)
    t = jd_start + step
    while t <= jd_end and len(out) < max_hits:
        cur = speed(t)
        if prev * cur < 0:
            tj = _bisect(speed, t - step, t)
            out.append((tj, "retrograde" if prev > 0 else "direct"))
        prev = cur
        t += step
    return out
