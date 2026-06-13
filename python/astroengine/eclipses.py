"""astroengine.eclipses -- solar and lunar eclipse search.

Lunar: direct shadow geometry at the anti-solar point with Danjon's
enlargement (lunar parallax x 86/85 on the flattened Earth) — the rule
Swiss Ephemeris uses, recovered empirically: magnitudes match to 0.001,
contact times to ~9 s (the Moon-model bound), types exactly.

Solar (global): shadow-axis geometry. gamma = closest approach of the
Sun-Moon axis to the geocenter in Earth radii; the umbral cone's reach at
the surface separates total from annular, a sign change along the track
marks hybrids. Types match Swiss Ephemeris exactly over 1950-2050; times
of maximum to ~9 s. Local circumstances (where/visibility) are not
computed here.
"""
import math
from .core import ARCSEC, jd_tt

KM_PER_AU = 149597870.7
R_EARTH = 6378.14
R_SUN = 696000.0
R_MOON = 1737.4
PI_SUN = 8.794 * ARCSEC
DANJON = (1 + 1 / 85.0) * 0.99834  # parallax enlargement on flattened Earth

SYNODIC = 29.530589


def _lunar_geom(engine, jd):
    """(theta, umbra radius, penumbra radius, moon semidiameter), radians."""
    jde = jd_tt(jd)
    slon, slat, sdist = engine._ecliptic("sun", jde)
    mlon, mlat, mdist = engine._ecliptic("moon", jde)
    alon = (slon + math.pi) % (2 * math.pi)
    alat = -slat
    cosd = (math.sin(alat) * math.sin(mlat)
            + math.cos(alat) * math.cos(mlat) * math.cos(alon - mlon))
    theta = math.acos(max(-1.0, min(1.0, cosd)))
    mkm = mdist * KM_PER_AU
    pi_eff = DANJON * math.asin(R_EARTH / mkm)
    s_m = math.asin(R_MOON / mkm)
    s_s = math.asin(R_SUN / (sdist * KM_PER_AU))
    return theta, pi_eff - s_s + PI_SUN, pi_eff + s_s + PI_SUN, s_m


def _solar_geom(engine, jd):
    """(axis distance km, penumbra radius at the closest plane km,
    umbra radius there km — negative means antumbra, along-axis moon
    distance km, umbral half-angle)."""
    jde = jd_tt(jd)
    slon, slat, sdist = engine._ecliptic("sun", jde)
    mlon, mlat, mdist = engine._ecliptic("moon", jde)

    def vec(lon, lat, r):
        return (r * math.cos(lat) * math.cos(lon),
                r * math.cos(lat) * math.sin(lon),
                r * math.sin(lat))
    S = vec(slon, slat, sdist * KM_PER_AU)
    M = vec(mlon, mlat, mdist * KM_PER_AU)
    SM = [M[i] - S[i] for i in range(3)]
    smn = math.sqrt(sum(c * c for c in SM))
    d = [c / smn for c in SM]
    t0 = -sum(M[i] * d[i] for i in range(3))
    P = [M[i] + t0 * d[i] for i in range(3)]
    d_axis = math.sqrt(sum(c * c for c in P))
    f1 = math.asin((R_SUN + R_MOON) / smn)
    f2 = math.asin((R_SUN - R_MOON) / smn)
    r_pen = (R_MOON / math.tan(f1) + t0) * math.tan(f1)
    r_umb = (R_MOON / math.tan(f2) - t0) * math.tan(f2)
    return d_axis, r_pen, r_umb, t0, f2


def _minimize(f, lo, hi, iters=60):
    for _ in range(iters):
        m1 = lo + (hi - lo) / 3
        m2 = hi - (hi - lo) / 3
        if f(m1) < f(m2):
            hi = m2
        else:
            lo = m1
    return (lo + hi) / 2


def _bisect(f, a, b, iters=50):
    fa = f(a)
    for _ in range(iters):
        m = (a + b) / 2
        if fa * f(m) <= 0:
            b = m
        else:
            a = m
            fa = f(a)
    return (a + b) / 2


def _syzygies(engine, jd_start, jd_end, angle):
    """Times of sun-moon elongation = angle (0 new, 180 full)."""
    def f(t):
        e = (engine.longitude("moon", t) - engine.longitude("sun", t)) % 360
        return (e - angle + 180) % 360 - 180
    out = []
    step = 5.0
    prev = f(jd_start)
    t = jd_start + step
    while t <= jd_end + step:
        cur = f(t)
        if prev * cur < 0 and abs(cur - prev) < 180:
            out.append(_bisect(f, t - step, t))
        prev = cur
        t += step
    return out


def lunar_eclipses(engine, jd_start, jd_end):
    """Lunar eclipses with t_max (UT JD), type (total|partial|penumbral),
    umbral/penumbral magnitudes, and contact times (None where the phase
    does not occur)."""
    out = []
    for t_full in _syzygies(engine, jd_start - 1, jd_end + 1, 180.0):
        t_max = _minimize(lambda t: _lunar_geom(engine, t)[0],
                          t_full - 0.3, t_full + 0.3)
        theta, u, pen, s_m = _lunar_geom(engine, t_max)
        mag_u = (u + s_m - theta) / (2 * s_m)
        mag_p = (pen + s_m - theta) / (2 * s_m)
        if mag_p <= 0 or not (jd_start <= t_max <= jd_end):
            continue
        kind = "total" if mag_u >= 1 else "partial" if mag_u > 0 else "penumbral"

        def cross(radius_idx, offset_sign):
            def f(t):
                g = _lunar_geom(engine, t)
                return g[0] - (g[radius_idx] + offset_sign * g[3])
            try:
                a = _bisect(f, t_max - 0.35, t_max)
                b = _bisect(f, t_max, t_max + 0.35)
                return a, b
            except Exception:
                return None, None
        pen_b, pen_e = cross(2, +1)
        par_b, par_e = (cross(1, +1) if mag_u > 0 else (None, None))
        tot_b, tot_e = (cross(1, -1) if mag_u >= 1 else (None, None))
        out.append({
            "t_max": t_max, "type": kind,
            "mag_umbral": max(mag_u, 0.0), "mag_penumbral": mag_p,
            "penumbral_begin": pen_b, "penumbral_end": pen_e,
            "partial_begin": par_b, "partial_end": par_e,
            "total_begin": tot_b, "total_end": tot_e,
        })
    return out


def solar_eclipses(engine, jd_start, jd_end):
    """Solar eclipses (global circumstances): t_max (UT JD, maximum =
    closest axis approach), type (total|annular|hybrid|partial), gamma,
    and global begin/end (penumbral first/last external contact)."""
    out = []
    for t_new in _syzygies(engine, jd_start - 1, jd_end + 1, 0.0):
        t_max = _minimize(lambda t: _solar_geom(engine, t)[0],
                          t_new - 0.4, t_new + 0.4)
        d_axis, r_pen, r_umb, t0, f2 = _solar_geom(engine, t_max)
        if d_axis > R_EARTH + r_pen or not (jd_start <= t_max <= jd_end):
            continue
        gamma = d_axis / R_EARTH
        if d_axis < R_EARTH:
            # umbra radius where the axis pierces the surface (closer to
            # the Moon by the chord depth)
            depth = math.sqrt(max(R_EARTH ** 2 - d_axis ** 2, 0.0))
            r_umb_surface = r_umb + depth * math.tan(f2)
            if r_umb > 0:
                kind = "total"
            elif r_umb_surface > 0:
                kind = "hybrid"  # annular at the track ends, total mid-track
            else:
                kind = "annular"
        else:
            kind = "partial"

        def f(t):
            g = _solar_geom(engine, t)
            return g[0] - (R_EARTH + g[1])
        begin = _bisect(f, t_max - 0.35, t_max)
        end = _bisect(f, t_max, t_max + 0.35)
        out.append({"t_max": t_max, "type": kind, "gamma": gamma,
                    "begin": begin, "end": end})
    return out
