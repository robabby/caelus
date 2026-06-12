"""astroengine.core -- clean-room ephemeris engine.

Pipeline (apparent geocentric ecliptic longitude, true equinox of date):
  UT -> TT via Delta T (Espenak-Meeus 2006 polynomials)
  VSOP87D heliocentric spherical of date for Earth + planet
  light-time + annual aberration: evaluate BOTH bodies at (t - tau), iterate
  VSOP dynamical -> FK5 frame correction (Meeus 32.3)
  nutation in longitude (IAU 1980, 63-term)
Moon: Meeus Ch.47 (ELP2000-82 abridged, 60+60 terms), mean equinox of date,
      + nutation. Sun: from Earth's heliocentric position + aberration.
Pluto: Meeus Ch.37 series (valid 1885-2099), J2000 -> precessed to date.
"""
import json, math, os
from functools import lru_cache

DATA = os.path.join(os.path.dirname(__file__), "data")
DEG = math.pi / 180.0
ARCSEC = DEG / 3600.0
J2000 = 2451545.0
LIGHT_TIME_AU = 0.0057755183  # days per AU

PLANET_NAMES = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]


def _load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


# ---------------------------------------------------------------- timescale
def julian_day(y, mo, d, h=0.0, mi=0, s=0.0):
    """Gregorian calendar date (UT) -> Julian Day."""
    frac = (h + mi / 60.0 + s / 3600.0) / 24.0
    if mo <= 2:
        y -= 1
        mo += 12
    a = y // 100
    b = 2 - a + a // 4
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (mo + 1)) + d + b - 1524.5 + frac


# Observed Delta T (IERS), 5-year steps 1955-2025. Earth's rotation sped up
# after ~2016, so polynomial extrapolations (Espenak-Meeus 2006) badly
# overshoot; we interpolate observations and extrapolate gently.
_DT_OBS = [
    (1955, 31.1), (1960, 33.2), (1965, 35.7), (1970, 40.2), (1975, 45.5),
    (1980, 50.5), (1985, 54.3), (1990, 56.9), (1995, 60.8), (2000, 63.8),
    (2005, 64.7), (2010, 66.1), (2015, 67.6), (2020, 69.4), (2025, 69.2),
]


def delta_t(jd_ut):
    """TT - UT1 in seconds. Observed values 1955-2025 (linear interpolation),
    Espenak & Meeus (2006) polynomials before, gentle extrapolation after."""
    y = 2000.0 + (jd_ut - J2000) / 365.25
    if 1955 <= y <= 2025:
        for (y0, d0), (y1, d1) in zip(_DT_OBS, _DT_OBS[1:]):
            if y0 <= y <= y1:
                return d0 + (d1 - d0) * (y - y0) / (y1 - y0)
    if y > 2025:
        # ΔT is flat-to-falling (69.4 -> 69.2 s over 2020-2025; Earth's spin
        # sped up post-2016). Continue the observed slope (-0.04 s/yr) plus
        # the long-term tidal quadratic (+32 s/cy², same coefficient as the
        # deep-time parabola below) so it rejoins the secular rise. An
        # 80-year ΔT forecast carries ~±37 s uncertainty (Huber 2006);
        # anything steeper is false precision.
        t = y - 2025
        return 69.2 - 0.04 * t + 32 * (t / 100) ** 2
    if 1961 <= y < 1986:
        t = y - 1975
        return 45.45 + 1.067 * t - t**2 / 260 - t**3 / 718
    if 1941 <= y < 1961:
        t = y - 1950
        return 29.07 + 0.407 * t - t**2 / 233 + t**3 / 2547
    if 1920 <= y < 1941:
        t = y - 1920
        return 21.20 + 0.84493 * t - 0.076100 * t**2 + 0.0020936 * t**3
    if 1900 <= y < 1920:
        t = y - 1900
        return -2.79 + 1.494119 * t - 0.0598939 * t**2 + 0.0061966 * t**3 - 0.000197 * t**4
    if 1860 <= y < 1900:
        t = y - 1860
        return (7.62 + 0.5737 * t - 0.251754 * t**2 + 0.01680668 * t**3
                - 0.0004473624 * t**4 + t**5 / 233174)
    if 1800 <= y < 1860:
        t = y - 1800
        return (13.72 - 0.332447 * t + 0.0068612 * t**2 + 0.0041116 * t**3 - 0.00037436 * t**4
                + 0.0000121272 * t**5 - 0.0000001699 * t**6 + 0.000000000875 * t**7)
    # outside fitted range: parabolic fallback
    u = (y - 1820) / 100
    return -20 + 32 * u * u


def jd_tt(jd_ut):
    return jd_ut + delta_t(jd_ut) / 86400.0


# ---------------------------------------------------------------- VSOP87D
class Vsop:
    _cache = {}

    def __init__(self, level="full"):
        self.level = level
        self.series = {}

    def _planet(self, name):
        key = (name, self.level)
        if key not in Vsop._cache:
            Vsop._cache[key] = _load(f"vsop87d_{name}.{self.level}.json")
        return Vsop._cache[key]

    def heliocentric(self, name, jde):
        """Heliocentric ecliptic spherical coords of date: (L rad, B rad, R au)."""
        t = (jde - J2000) / 365250.0  # Julian millennia
        s = self._planet(name)
        out = []
        for var in ("L", "B", "R"):
            total, tn = 0.0, 1.0
            for order_terms in s[var]:
                acc = 0.0
                for A, B, C in order_terms:
                    acc += A * math.cos(B + C * t)
                total += acc * tn
                tn *= t
            out.append(total)
        L, B, R = out
        return L % (2 * math.pi), B, R


# ---------------------------------------------------------------- nutation
_NUT = None

def nutation(jde):
    """IAU 1980 nutation: (delta_psi, delta_eps) in radians."""
    global _NUT
    if _NUT is None:
        _NUT = _load("nutation_iau1980.json")
    T = (jde - J2000) / 36525.0
    D = (297.85036 + 445267.11148 * T - 0.0019142 * T * T + T**3 / 189474) * DEG
    M = (357.52772 + 35999.050340 * T - 0.0001603 * T * T - T**3 / 300000) * DEG
    N = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + T**3 / 5620) * DEG
    F = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + T**3 / 327270) * DEG
    Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T**3 / 450000) * DEG
    dpsi = deps = 0.0
    for d, m, n, f, om, s0, s1, c0, c1 in reversed(_NUT):
        arg = d * D + m * M + n * N + f * F + om * Om
        dpsi += math.sin(arg) * (s0 + s1 * T)
        deps += math.cos(arg) * (c0 + c1 * T)
    return dpsi * 1e-4 * ARCSEC, deps * 1e-4 * ARCSEC


def mean_obliquity(jde):
    """IAU 1980 mean obliquity, radians."""
    T = (jde - J2000) / 36525.0
    sec = 84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T**3
    return sec * ARCSEC


def true_obliquity(jde):
    return mean_obliquity(jde) + nutation(jde)[1]


# ---------------------------------------------------------------- frame fix
def _fk5_correction(L, B, jde):
    """VSOP dynamical ecliptic -> FK5 (Meeus 32.3). ~0.1 arcsec effect."""
    T = (jde - J2000) / 36525.0
    Lp = L - (1.397 + 0.00031 * T) * T * DEG
    dL = -0.09033 * ARCSEC + 0.03916 * ARCSEC * (math.cos(Lp) + math.sin(Lp)) * math.tan(B)
    dB = 0.03916 * ARCSEC * (math.cos(Lp) - math.sin(Lp))
    return L + dL, B + dB


# ---------------------------------------------------------------- planets
def _geo_vector(vsop, name, jde):
    """Geocentric rectangular ecliptic-of-date vector planet minus earth."""
    L0, B0, R0 = vsop.heliocentric("earth", jde)
    L, B, R = vsop.heliocentric(name, jde)
    x = R * math.cos(B) * math.cos(L) - R0 * math.cos(B0) * math.cos(L0)
    y = R * math.cos(B) * math.sin(L) - R0 * math.cos(B0) * math.sin(L0)
    z = R * math.sin(B) - R0 * math.sin(B0)
    return x, y, z


def planet_apparent(vsop, name, jde):
    """Apparent geocentric ecliptic lon/lat (true equinox of date), distance.

    Evaluating both Earth and planet at (t - tau) folds annual aberration
    into the light-time correction to first order (Meeus ch. 33)."""
    x, y, z = _geo_vector(vsop, name, jde)
    delta = math.sqrt(x * x + y * y + z * z)
    for _ in range(2):  # light-time iteration
        tau = LIGHT_TIME_AU * delta
        x, y, z = _geo_vector(vsop, name, jde - tau)
        delta = math.sqrt(x * x + y * y + z * z)
    lon = math.atan2(y, x) % (2 * math.pi)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    lon, lat = _fk5_correction(lon, lat, jde)
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, delta


def sun_apparent(vsop, jde):
    """Apparent geocentric Sun (true equinox of date)."""
    L0, B0, R0 = vsop.heliocentric("earth", jde)
    lon = (L0 + math.pi) % (2 * math.pi)
    lat = -B0
    lon, lat = _fk5_correction(lon, lat, jde)
    lon -= 20.4898 * ARCSEC / R0          # annual aberration
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, R0


# ---------------------------------------------------------------- moon
_MOON = None

def _moon_fundamental(T):
    Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
          + T**3 / 538841 - T**4 / 65194000) * DEG
    D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
         + T**3 / 545868 - T**4 / 113065000) * DEG
    M = (357.5291092 + 35999.0502909 * T - 0.0001535 * T * T + T**3 / 24490000) * DEG
    Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
          + T**3 / 69699 - T**4 / 14712000) * DEG
    F = (93.272095 + 483202.0175233 * T - 0.0036539 * T * T
         - T**3 / 3526000 + T**4 / 863310000) * DEG
    return Lp, D, M, Mp, F


def moon_geometric(jde):
    """Geocentric Moon, mean equinox of date (Meeus ch.47): lon, lat (rad), dist (km)."""
    global _MOON
    if _MOON is None:
        _MOON = _load("moon_meeus47.json")
    T = (jde - J2000) / 36525.0
    Lp, D, M, Mp, F = _moon_fundamental(T)
    A1 = (119.75 + 131.849 * T) * DEG
    A2 = (53.09 + 479264.29 * T) * DEG
    A3 = (313.45 + 481266.484 * T) * DEG
    E = 1 - 0.002516 * T - 0.0000074 * T * T
    E2 = E * E
    sl = 3958 * math.sin(A1) + 1962 * math.sin(Lp - F) + 318 * math.sin(A2)
    sr = 0.0
    sb = (-2235 * math.sin(Lp) + 382 * math.sin(A3) + 175 * math.sin(A1 - F)
          + 175 * math.sin(A1 + F) + 127 * math.sin(Lp - Mp) - 115 * math.sin(Lp + Mp))
    for d, m, mp, f, l_c, r_c in _MOON["ta"]:
        arg = d * D + m * M + mp * Mp + f * F
        e = E if abs(m) == 1 else (E2 if abs(m) == 2 else 1.0)
        sl += l_c * math.sin(arg) * e
        sr += r_c * math.cos(arg) * e
    for d, m, mp, f, b_c in _MOON["tb"]:
        arg = d * D + m * M + mp * Mp + f * F
        e = E if abs(m) == 1 else (E2 if abs(m) == 2 else 1.0)
        sb += b_c * math.sin(arg) * e
    lon = (Lp + sl * 1e-6 * DEG) % (2 * math.pi)
    lat = sb * 1e-6 * DEG
    dist = 385000.56 + sr * 1e-3
    return lon, lat, dist


def moon_apparent(jde):
    lon, lat, dist = moon_geometric(jde)
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, dist


# ---------------------------------------------------------------- precise moon
_MOON_CHEB = None
C_KM_PER_DAY = 299792.458 * 86400.0


def _moon_cheb():
    """Lazy-load JPL-fit Chebyshev moon (full tier preferred)."""
    global _MOON_CHEB
    if _MOON_CHEB is None:
        from .chebyshev import ChebSeries
        for tier in ("full", "embedded"):
            p = os.path.join(DATA, f"moon_cheb.{tier}.json")
            if os.path.exists(p):
                _MOON_CHEB = ChebSeries.load(p)
                break
        else:
            _MOON_CHEB = False
    return _MOON_CHEB


def moon_apparent_precise(jde):
    """Apparent Moon from JPL-fit Chebyshev (ecliptic J2000 km).
    Light-time, precession to date, nutation. Raises outside fitted range."""
    cheb = _moon_cheb()
    if not cheb:
        raise FileNotFoundError("moon_cheb data not built")
    x, y, z = cheb.xyz(jde)
    dist = math.sqrt(x * x + y * y + z * z)
    tau = dist / C_KM_PER_DAY  # ~1.3 light-seconds
    x, y, z = cheb.xyz(jde - tau)
    lon = math.atan2(y, x) % (2 * math.pi)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    lon, lat = _precess_ecliptic(lon, lat, J2000, jde)
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, dist


def _ecl_j2000_to_ecl_date(v, jde):
    """Rotate a vector from ecliptic-J2000 to ecliptic-of-date frame:
    ecl J2000 -> eq J2000 -> precess (IAU 1976: zeta, z, theta) -> ecl of date."""
    x, y, z = v
    e0 = 84381.448 * ARCSEC  # mean obliquity J2000
    # ecliptic -> equatorial (rotate about x by -e0)
    y, z = y * math.cos(e0) - z * math.sin(e0), y * math.sin(e0) + z * math.cos(e0)
    T = (jde - J2000) / 36525.0
    zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T**3) * ARCSEC
    zz = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T**3) * ARCSEC
    th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T**3) * ARCSEC

    def rz(a, x, y, z):
        c, s = math.cos(a), math.sin(a)
        return c * x + s * y, -s * x + c * y, z

    def ry(a, x, y, z):
        c, s = math.cos(a), math.sin(a)
        return c * x - s * z, y, s * x + c * z

    x, y, z = rz(-zeta, x, y, z)
    x, y, z = ry(th, x, y, z)
    x, y, z = rz(-zz, x, y, z)
    # equatorial of date -> ecliptic of date (mean obliquity)
    e = mean_obliquity(jde)
    y, z = y * math.cos(e) + z * math.sin(e), -y * math.sin(e) + z * math.cos(e)
    return x, y, z


def true_node_precise(jde):
    """Osculating node from JPL-fit moon state (analytic Chebyshev derivative).
    Angular momentum is rotated into the ecliptic-of-date frame first: the
    ecliptic pole moves ~47"/century, and the Moon's shallow 5.1-degree
    inclination amplifies any frame error by ~11x in node longitude."""
    cheb = _moon_cheb()
    if not cheb:
        raise FileNotFoundError("moon_cheb data not built")
    (x, y, z), (vx, vy, vz) = cheb.xyz_vel(jde)
    h = (y * vz - z * vy, z * vx - x * vz, x * vy - y * vx)
    hx, hy, hz = _ecl_j2000_to_ecl_date(h, jde)
    node = math.atan2(hx, -hy) % (2 * math.pi)
    return (node + nutation(jde)[0]) % (2 * math.pi)


def moon_in_precise_range(jde):
    cheb = _moon_cheb()
    return bool(cheb) and cheb.jd0 <= jde - 0.1 and jde + 0.1 <= cheb.jd1


# ---------------------------------------------------------------- lunar node
def mean_node(jde):
    """Mean ascending lunar node, true equinox of date."""
    T = (jde - J2000) / 36525.0
    om = (125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
          + T**3 / 467441 - T**4 / 60616000) * DEG
    return (om + nutation(jde)[0]) % (2 * math.pi)


def true_node(jde):
    """Osculating ascending node from Moon state vector (r x v)."""
    h = 0.01  # days, for numerical velocity
    def xyz(t):
        lon, lat, dist = moon_geometric(t)
        return (dist * math.cos(lat) * math.cos(lon),
                dist * math.cos(lat) * math.sin(lon),
                dist * math.sin(lat))
    x0, y0, z0 = xyz(jde - h)
    x1, y1, z1 = xyz(jde + h)
    x, y, z = xyz(jde)
    vx, vy, vz = (x1 - x0) / (2 * h), (y1 - y0) / (2 * h), (z1 - z0) / (2 * h)
    # angular momentum h = r x v; ascending node n = k x h
    hx = y * vz - z * vy
    hy = z * vx - x * vz
    # node vector in ecliptic plane: (-hy, hx)
    node = math.atan2(hx, -hy) % (2 * math.pi)
    return (node + nutation(jde)[0]) % (2 * math.pi)


# ---------------------------------------------------------------- chiron
_CHIRON = None


def chiron_apparent(vsop, jde):
    """Apparent geocentric Chiron from heliocentric Chebyshev fit (1850-2150).
    Same outer-body pipeline as Pluto: geocentric assembly in J2000,
    light-time, annual aberration, precession to date, nutation."""
    global _CHIRON
    if _CHIRON is None:
        from .chebyshev import ChebSeries
        _CHIRON = ChebSeries.load(os.path.join(DATA, "chiron_cheb.json"))

    L0, B0, R0 = vsop.heliocentric("earth", jde)
    Lj, Bj = _precess_ecliptic(L0, B0, jde, J2000)
    ex = R0 * math.cos(Bj) * math.cos(Lj)
    ey = R0 * math.cos(Bj) * math.sin(Lj)
    ez = R0 * math.sin(Bj)

    def geo(t):
        cx, cy, cz = _CHIRON.xyz(t)
        return cx - ex, cy - ey, cz - ez

    x, y, z = geo(jde)
    delta = math.sqrt(x * x + y * y + z * z)
    for _ in range(2):
        x, y, z = geo(jde - LIGHT_TIME_AU * delta)
        delta = math.sqrt(x * x + y * y + z * z)
    lon = math.atan2(y, x) % (2 * math.pi)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    # annual aberration (classic formula), as for Pluto
    T = (jde - J2000) / 36525.0
    sun_lon = (L0 + math.pi) % (2 * math.pi)
    k = 20.4898 * ARCSEC
    e = 0.016708634 - 0.000042037 * T
    pi_per = (102.93735 + 1.71946 * T) * DEG
    lon += (-k * math.cos(sun_lon - lon) + e * k * math.cos(pi_per - lon)) / math.cos(lat)
    lon, lat = _precess_ecliptic(lon, lat, J2000, jde)
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, delta


# ---------------------------------------------------------------- pluto
_PLUTO = None

def pluto_apparent(vsop, jde):
    """Meeus ch.37 Pluto (valid 1885-2099): heliocentric J2000 series,
    -> geocentric, light-time+aberration, precess J2000 -> date, nutation."""
    global _PLUTO
    if _PLUTO is None:
        _PLUTO = _load("pluto_meeus37.json")

    def helio_j2000(t_jde):
        T = (t_jde - J2000) / 36525.0
        J = (34.35 + 3034.9057 * T) * DEG
        S = (50.08 + 1222.1138 * T) * DEG
        P = (238.96 + 144.96 * T) * DEG
        l = b = r = 0.0
        for i, j, k, lA, lB, bA, bB, rA, rB in _PLUTO:
            a = i * J + j * S + k * P
            sa, ca = math.sin(a), math.cos(a)
            l += lA * sa + lB * ca
            b += bA * sa + bB * ca
            r += rA * sa + rB * ca
        l = (l + 238.958116 + 144.96 * T) * DEG  # lA etc. already deg in table
        b = (b - 3.908239) * DEG
        r += 40.7241346
        return l, b, r

    def earth_j2000(t_jde):
        # VSOP87D is of-date; rotate ecliptic-of-date -> J2000 by -precession in longitude
        L, B, R = vsop.heliocentric("earth", t_jde)
        Lj, Bj = _precess_ecliptic(L, B, t_jde, J2000)
        return Lj, Bj, R

    def geo(t_jde):
        l, b, r = helio_j2000(t_jde)
        L0, B0, R0 = earth_j2000(jde)  # Earth at observation time t
        x = r * math.cos(b) * math.cos(l) - R0 * math.cos(B0) * math.cos(L0)
        y = r * math.cos(b) * math.sin(l) - R0 * math.cos(B0) * math.sin(L0)
        z = r * math.sin(b) - R0 * math.sin(B0)
        return x, y, z

    x, y, z = geo(jde)
    delta = math.sqrt(x * x + y * y + z * z)
    for _ in range(2):
        tau = LIGHT_TIME_AU * delta
        x, y, z = geo(jde - tau)
        delta = math.sqrt(x * x + y * y + z * z)
    lon = math.atan2(y, x) % (2 * math.pi)
    lat = math.atan2(z, math.sqrt(x * x + y * y))
    # annual aberration (planet case, approx): -20.4898"/R0 * cos(sun_lon - lon)... use
    # velocity-folding instead: shift Earth too. Simpler: apply classic formula.
    L0, B0, R0 = vsop.heliocentric("earth", jde)
    sun_lon = (L0 + math.pi) % (2 * math.pi)
    k = 20.4898 * ARCSEC
    e = 0.016708634 - 0.000042037 * ((jde - J2000) / 36525.0)
    pi_per = (102.93735 + 1.71946 * ((jde - J2000) / 36525.0)) * DEG
    dlon = (-k * math.cos(sun_lon - lon) + e * k * math.cos(pi_per - lon)) / math.cos(lat)
    lon += dlon
    # precess J2000 -> mean of date, then nutation
    lon, lat = _precess_ecliptic(lon, lat, J2000, jde)
    lon = (lon + nutation(jde)[0]) % (2 * math.pi)
    return lon, lat, delta


def _precess_ecliptic(lon, lat, jde_from, jde_to):
    """Precession of ecliptic coordinates (Meeus ch.21, eq 21.7)."""
    T = (jde_from - J2000) / 36525.0
    t = (jde_to - jde_from) / 36525.0
    eta = ((47.0029 - 0.06603 * T + 0.000598 * T * T) * t
           + (-0.03302 + 0.000598 * T) * t * t + 0.000060 * t**3) * ARCSEC
    Pi = ((174.876384 * 3600 + 3289.4789 * T + 0.60622 * T * T) * ARCSEC
          - ((869.8089 + 0.50491 * T) * t - 0.03536 * t * t) * ARCSEC)
    p = ((5029.0966 + 2.22226 * T - 0.000042 * T * T) * t
         + (1.11113 - 0.000042 * T) * t * t - 0.000006 * t**3) * ARCSEC
    se, ce = math.sin(eta), math.cos(eta)
    A = ce * math.cos(lat) * math.sin(Pi - lon) - se * math.sin(lat)
    B = math.cos(lat) * math.cos(Pi - lon)
    C = ce * math.sin(lat) + se * math.cos(lat) * math.sin(Pi - lon)
    lon2 = (p + Pi - math.atan2(A, B)) % (2 * math.pi)
    lat2 = math.asin(C)
    return lon2, lat2
