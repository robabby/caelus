"""astroengine.eclipses -- solar and lunar eclipse search.

Lunar: direct shadow geometry at the anti-solar point with Danjon's
enlargement (lunar parallax x 86/85 on the flattened Earth) — the rule
Swiss Ephemeris uses, recovered empirically: magnitudes match to 0.001,
contact times to ~9 s (the Moon-model bound), types exactly.

Solar (global): shadow-axis geometry. gamma = closest approach of the
Sun-Moon axis to the geocenter in Earth radii; the umbral cone's reach at
the surface separates total from annular, a sign change along the track
marks hybrids. Types match Swiss Ephemeris exactly over 1950-2050; times
of maximum to ~9 s.

Solar (where): the shadow axis intersected with the IAU 1976 Earth
ellipsoid gives the sub-shadow geographic point -- the centre line of
totality/annularity at an instant; sampled across the eclipse it draws the
ground track. Solar (local): topocentric Sun/Moon disks at an observer give
the contact times, magnitude, and obscuration as seen from that point.
"""
import math
from . import houses as H
from . import pheno as PH
from .core import (ARCSEC, DEG, jd_tt, true_obliquity, equatorial,
                   topocentric_ecl)

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


# ---------------------------------------------------------------- where + local

EARTH_FLAT = 0.99664719  # 1 - f, IAU 1976 figure (b/a)
EARTH_FLAT2 = EARTH_FLAT * EARTH_FLAT  # (b/a)^2 = 1 - e^2


def _sun_moon_eq(engine, jde):
    """Geocentric equatorial Cartesian (km) of the Sun and Moon."""
    eps = true_obliquity(jde)

    def vec(body):
        lon, lat, dist = engine._ecliptic(body, jde)
        ra, dec = equatorial(lon, lat, eps)
        r = dist * KM_PER_AU
        return [r * math.cos(dec) * math.cos(ra),
                r * math.cos(dec) * math.sin(ra),
                r * math.sin(dec)]
    return vec("sun"), vec("moon")


def solar_eclipse_where(engine, jd):
    """Sub-shadow geographic point (geodetic lat deg, east lon deg in
    (-180, 180]) where the eclipse axis meets the IAU 1976 ellipsoid at jd
    (UT) -- the centre line at that instant. None when the axis misses the
    Earth (only a partial eclipse exists anywhere then)."""
    jde = jd_tt(jd)
    S, M = _sun_moon_eq(engine, jde)
    SM = [M[i] - S[i] for i in range(3)]
    smn = math.sqrt(sum(c * c for c in SM))
    d = [c / smn for c in SM]  # travels Sun -> Moon -> Earth
    # Scale z by 1/flat to map the ellipsoid to a sphere of radius R_EARTH.
    mz = [M[0], M[1], M[2] / EARTH_FLAT]
    dz = [d[0], d[1], d[2] / EARTH_FLAT]
    a = sum(c * c for c in dz)
    b = 2 * sum(mz[i] * dz[i] for i in range(3))
    c = sum(v * v for v in mz) - R_EARTH ** 2
    disc = b * b - 4 * a * c
    if disc < 0:
        return None
    s = (-b - math.sqrt(disc)) / (2 * a)  # near side, facing the Moon
    P = [M[i] + s * d[i] for i in range(3)]
    rho = math.hypot(P[0], P[1])
    lat = math.atan2(P[2], EARTH_FLAT2 * rho)  # geocentric -> geodetic
    ra = math.atan2(P[1], P[0])
    lon_east = (ra - H.gast(jd) + math.pi) % (2 * math.pi) - math.pi
    return lat / DEG, lon_east / DEG


def _topo_circs(engine, jd, lat_deg, lon_east_deg, alt_m):
    """Topocentric Sun/Moon angular separation and disk radii (rad)."""
    jde = jd_tt(jd)
    eps = true_obliquity(jde)
    lst = (H.gast(jd) + lon_east_deg * DEG) % (2 * math.pi)

    def topo(body):
        lon, lat, dist = engine._ecliptic(body, jde)
        return topocentric_ecl(lon, lat, dist, lst, lat_deg * DEG, alt_m, eps)
    slon, slat, sdist = topo("sun")
    mlon, mlat, mdist = topo("moon")
    cos_sep = (math.sin(slat) * math.sin(mlat)
               + math.cos(slat) * math.cos(mlat) * math.cos(slon - mlon))
    return (math.acos(max(-1.0, min(1.0, cos_sep))),
            math.asin(R_SUN / (sdist * KM_PER_AU)),
            math.asin(R_MOON / (mdist * KM_PER_AU)))


def _lens_area(d, r1, r2):
    """Area where two disks (radii r1, r2, centre distance d) overlap."""
    if d >= r1 + r2:
        return 0.0
    if d <= abs(r1 - r2):
        return math.pi * min(r1, r2) ** 2
    a1 = math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1))
    a2 = math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
    return (r1 * r1 * (a1 - math.sin(2 * a1) / 2)
            + r2 * r2 * (a2 - math.sin(2 * a2) / 2))


def _contact(g, t_max, direction):
    """Step out from t_max (g < 0) until g changes sign, then bisect."""
    step = 0.003  # ~4.3 min
    prev, fprev = t_max, g(t_max)
    for i in range(1, 121):  # search up to ~8.6 h either side
        t = t_max + direction * i * step
        f = g(t)
        if fprev * f <= 0:
            return _bisect(g, min(prev, t), max(prev, t))
        prev, fprev = t, f
    return None


def solar_eclipse_local(engine, jd, lat_deg, lon_east_deg, alt_m=0.0):
    """Local circumstances of a solar eclipse at one place: dict with type
    (total|annular|partial|none), magnitude (fraction of the Sun's diameter
    covered at maximum), obscuration (fraction of area), max_time, and
    contact times c1..c4 (UT JD; c2/c3 None outside totality/annularity).
    Topocentric, so lunar parallax is included."""
    def sep_at(t):
        return _topo_circs(engine, t, lat_deg, lon_east_deg, alt_m)[0]
    t_max = _minimize(sep_at, jd - 0.2, jd + 0.2)
    sep, s_s, s_m = _topo_circs(engine, t_max, lat_deg, lon_east_deg, alt_m)
    if sep >= s_s + s_m:
        return {"type": "none", "magnitude": 0.0, "obscuration": 0.0,
                "max_time": None, "c1": None, "c2": None,
                "c3": None, "c4": None}
    kind = ("total" if sep <= s_m - s_s
            else "annular" if sep <= s_s - s_m else "partial")

    def g_outer(t):
        sep2, ss2, sm2 = _topo_circs(engine, t, lat_deg, lon_east_deg, alt_m)
        return sep2 - (ss2 + sm2)
    c2 = c3 = None
    if kind in ("total", "annular"):
        def g_inner(t):
            sep2, ss2, sm2 = _topo_circs(engine, t, lat_deg, lon_east_deg, alt_m)
            return sep2 - abs(sm2 - ss2)
        c2 = _contact(g_inner, t_max, -1)
        c3 = _contact(g_inner, t_max, +1)
    # Magnitude = fraction of the Sun's diameter covered. Partial: one Moon
    # edge inside the Sun's disk; central (annular/total): the Moon/Sun diameter
    # ratio -- < 1 in annularity, > 1 in totality.
    mag = (s_m / s_s if sep <= abs(s_m - s_s)
           else (s_s + s_m - sep) / (2 * s_s))
    return {"type": kind,
            "magnitude": mag,
            "obscuration": _lens_area(sep, s_s, s_m) / (math.pi * s_s * s_s),
            "max_time": t_max,
            "c1": _contact(g_outer, t_max, -1), "c2": c2, "c3": c3,
            "c4": _contact(g_outer, t_max, +1)}


R_MEAN = 6371.0  # mean Earth radius (km) for short surface offsets


def _dest_point(lat, lon, bearing_deg, dist_km):
    """Geodetic destination point dist_km from (lat, lon) along bearing_deg."""
    d = dist_km / R_MEAN
    br = bearing_deg * DEG
    p1 = lat * DEG
    l1 = lon * DEG
    p2 = math.asin(math.sin(p1) * math.cos(d)
                   + math.cos(p1) * math.sin(d) * math.cos(br))
    l2 = l1 + math.atan2(math.sin(br) * math.sin(d) * math.cos(p1),
                         math.cos(d) - math.sin(p1) * math.sin(p2))
    return p2 / DEG, (l2 / DEG + 540) % 360 - 180


def _bearing(a, b):
    """Initial great-circle bearing (deg) from a to b (each (lat, lon))."""
    p1 = a[0] * DEG
    p2 = b[0] * DEG
    dl = (b[1] - a[1]) * DEG
    return math.atan2(math.sin(dl) * math.cos(p2),
                      math.cos(p1) * math.sin(p2)
                      - math.sin(p1) * math.cos(p2) * math.cos(dl)) / DEG % 360


def _great_circle_km(a, b):
    """Great-circle distance (km) between two (lat, lon) points."""
    p1 = a[0] * DEG
    p2 = b[0] * DEG
    dp = (b[0] - a[0]) * DEG
    dl = (b[1] - a[1]) * DEG
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R_MEAN * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def solar_eclipse_limits(engine, jd):
    """Ground path of a solar eclipse at jd (UT): dict with center (lat, lon),
    north and south limits of totality/annularity (each (lat, lon) or None),
    and the full path width_km. None when no central eclipse exists then.
    Marches perpendicular to the shadow's ground track to the umbra edge."""
    center = solar_eclipse_where(engine, jd)
    if center is None:
        return None
    ahead = solar_eclipse_where(engine, jd + 1 / 86400)
    track = _bearing(center, ahead) if ahead is not None else 0.0

    def edge(lat, lon):
        sep, s_s, s_m = _topo_circs(engine, jd, lat, lon, 0.0)
        return sep - abs(s_m - s_s)

    def march(brg):
        g_prev = edge(*center)  # < 0 on the central line
        s = 4.0
        while s <= 400.0:
            q = _dest_point(center[0], center[1], brg, s)
            if g_prev * edge(*q) <= 0:
                lo, hi = s - 4.0, s  # edge between lo (inside) and hi (outside)
                for _ in range(40):
                    mid = (lo + hi) / 2
                    qm = _dest_point(center[0], center[1], brg, mid)
                    if edge(*qm) <= 0:
                        lo = mid
                    else:
                        hi = mid
                return _dest_point(center[0], center[1], brg, (lo + hi) / 2)
            g_prev = edge(*q)
            s += 4.0
        return None

    a = march((track - 90) % 360)
    b = march((track + 90) % 360)
    # Label by latitude so north is always the higher-latitude edge.
    if a is None or b is None:
        north, south, width = a, b, None
    else:
        north, south = (a, b) if a[0] >= b[0] else (b, a)
        width = _great_circle_km(north, south)
    return {"center": center, "north": north, "south": south,
            "width_km": width}


def lunar_eclipse_local(engine, jd, lat_deg, lon_east_deg):
    """Local visibility of a lunar eclipse: dict with the Moon's altitude (deg,
    negative = below horizon) at jd (UT) and a visible flag. A lunar eclipse is
    simultaneous for the whole Earth, so visibility is just whether the Moon is
    up; pass a contact time to test that phase."""
    mlon, mlat, _ = engine._ecliptic("moon", jd_tt(jd))
    _, alt = PH.az_alt(mlon / DEG, mlat / DEG, jd, lat_deg, lon_east_deg)
    return {"altitude": alt, "visible": alt > 0}
