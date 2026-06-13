"""astroengine.derived -- standard chart derivations built on the validated
primitives.

These are constructions on top of apparent positions (already checked against
Swiss Ephemeris), so this layer is time-mapping, arithmetic, and lookup tables,
not new ephemeris.

  Slice 1 (chart derivations): returns, secondary progressions, solar arc,
  composite, Davison.
  Slice 2 (transforms + tables): harmonics, antiscia, declination aspects,
  out-of-bounds, dignities, sect.

Conventions:
- Secondary progressions and solar arc use the mean tropical year for the
  day-for-a-year mapping; solar arc is the true progressed-Sun arc, applied
  forward to every natal point.
- Composite is the midpoint method (shorter-arc midpoint of each pair).
- Davison is a real chart at the midpoint in time and place.
- Out-of-bounds compares declination to the mean obliquity (the tropics).
- A chart is diurnal when the Sun is above the horizon.
"""
from .core import DEG, jd_tt, mean_obliquity
from .events import crossings
from .pheno import az_alt
from .chart import SIGNS

TROPICAL_YEAR = 365.24219  # mean tropical year, days


def _wrap360(x):
    return x % 360.0


def _sign_index(sign):
    return sign if isinstance(sign, int) else SIGNS.index(sign)


def midpoint_lon(a, b):
    """Shorter-arc midpoint of two longitudes (degrees)."""
    d = ((b - a + 180.0) % 360.0) - 180.0  # signed shortest a -> b
    return (a + d / 2.0) % 360.0


# ----------------------------------------------------------------- returns
def returns(engine, body, natal_jd, jd_start, jd_end, zodiac="tropical",
            max_hits=60):
    """UT JDs in [jd_start, jd_end] when `body` returns to its natal longitude.
    Outer-planet returns can show three crossings around a retrograde loop."""
    natal_lon = engine.longitude(body, natal_jd, zodiac=zodiac)
    return crossings(engine, body, natal_lon, jd_start, jd_end,
                     zodiac=zodiac, max_hits=max_hits)


def solar_return(engine, natal_jd, jd_start, jd_end, zodiac="tropical"):
    return returns(engine, "sun", natal_jd, jd_start, jd_end, zodiac=zodiac)


def lunar_return(engine, natal_jd, jd_start, jd_end, zodiac="tropical"):
    return returns(engine, "moon", natal_jd, jd_start, jd_end, zodiac=zodiac)


# ------------------------------------------------- secondary progressions
def progressed_jd(natal_jd, target_jd, year_length=TROPICAL_YEAR):
    """The JD whose real positions are the secondary-progressed positions for
    the age (target_jd - natal_jd): one day of motion per year of life."""
    return natal_jd + (target_jd - natal_jd) / year_length


def progressed_longitude(engine, body, natal_jd, target_jd,
                         year_length=TROPICAL_YEAR, zodiac="tropical"):
    return engine.longitude(body, progressed_jd(natal_jd, target_jd, year_length),
                            zodiac=zodiac)


# ----------------------------------------------------------- solar arc
def solar_arc(engine, natal_jd, target_jd, year_length=TROPICAL_YEAR,
              zodiac="tropical"):
    """Solar-arc direction angle (degrees, forward): the secondary-progressed
    Sun's motion from the natal Sun. Add it to any natal point to direct it."""
    pjd = progressed_jd(natal_jd, target_jd, year_length)
    natal_sun = engine.longitude("sun", natal_jd, zodiac=zodiac)
    prog_sun = engine.longitude("sun", pjd, zodiac=zodiac)
    return (prog_sun - natal_sun) % 360.0  # Sun only moves forward


def directed_longitude(engine, body, natal_jd, target_jd,
                       year_length=TROPICAL_YEAR, zodiac="tropical"):
    arc = solar_arc(engine, natal_jd, target_jd, year_length, zodiac)
    return (engine.longitude(body, natal_jd, zodiac=zodiac) + arc) % 360.0


# ----------------------------------------------------------- composite
def composite_longitudes(engine, jd_a, jd_b, bodies, zodiac="tropical"):
    """Midpoint-method composite: shorter-arc midpoint of each body's two
    longitudes. Angles compose the same way via midpoint_lon."""
    out = {}
    for body in bodies:
        la = engine.longitude(body, jd_a, zodiac=zodiac)
        lb = engine.longitude(body, jd_b, zodiac=zodiac)
        out[body] = midpoint_lon(la, lb)
    return out


# ----------------------------------------------------------- davison
def davison_params(jd_a, jd_b, lat_a, lon_east_a, lat_b, lon_east_b):
    """Time and place for a Davison chart: temporal midpoint and geographic
    midpoint (mean latitude, shorter-arc mean longitude). Returns
    (jd, lat, lon_east)."""
    mid_jd = 0.5 * (jd_a + jd_b)
    mid_lat = 0.5 * (lat_a + lat_b)
    mid_lon = midpoint_lon(lon_east_a % 360.0, lon_east_b % 360.0)
    if mid_lon > 180.0:
        mid_lon -= 360.0
    return mid_jd, mid_lat, mid_lon


# ----------------------------------------------------------- harmonics
def harmonic_longitude(lon, n):
    """The nth-harmonic longitude of a point: lon * n, wrapped to 360."""
    return (lon * n) % 360.0


def harmonic_chart(engine, jd, bodies, n, zodiac="tropical"):
    return {b: harmonic_longitude(engine.longitude(b, jd, zodiac=zodiac), n)
            for b in bodies}


# ----------------------------------------------------------- antiscia
def antiscion(lon):
    """Reflection across the solstice (Cancer-Capricorn) axis."""
    return (180.0 - lon) % 360.0


def contra_antiscion(lon):
    """Reflection across the equinox (Aries-Libra) axis."""
    return (-lon) % 360.0


# ------------------------------------------------- declination aspects
def declination_aspect(dec_a, dec_b, orb=1.0):
    """Classify two declinations: 'parallel' (same value), 'contraparallel'
    (equal and opposite), or None."""
    if abs(dec_a - dec_b) <= orb:
        return "parallel"
    if abs(dec_a + dec_b) <= orb:
        return "contraparallel"
    return None


def declination_aspects(engine, bodies, jd, orb=1.0):
    """Parallel / contraparallel pairs among `bodies` at `jd`."""
    decs = {b: engine.position(b, jd)["dec"] for b in bodies}
    bl = list(bodies)
    out = []
    for i in range(len(bl)):
        for j in range(i + 1, len(bl)):
            kind = declination_aspect(decs[bl[i]], decs[bl[j]], orb)
            if kind:
                out.append({"a": bl[i], "b": bl[j], "kind": kind})
    return out


# ----------------------------------------------------------- out of bounds
def out_of_bounds_margin(engine, body, jd):
    """|declination| minus the mean obliquity, in degrees. Positive when the
    body is out of bounds (beyond the tropics)."""
    dec = engine.position(body, jd)["dec"]
    eps = mean_obliquity(jd_tt(jd)) / DEG
    return abs(dec) - eps


def out_of_bounds(engine, body, jd):
    return out_of_bounds_margin(engine, body, jd) > 0.0


# ----------------------------------------------------------- dignities
# Sign indices: 0=Aries .. 11=Pisces.
DOMICILE = {
    "sun": [4], "moon": [3], "mercury": [2, 5], "venus": [1, 6],
    "mars": [0, 7], "jupiter": [8, 11], "saturn": [9, 10],
}
EXALTATION = {
    "sun": 0, "moon": 1, "mercury": 5, "venus": 11,
    "mars": 9, "jupiter": 3, "saturn": 6,
}


def dignities(body, sign):
    """Essential dignities of `body` in `sign` (index or name): any of
    domicile, exaltation, detriment, fall. Detriment and fall are the signs
    opposite domicile and exaltation."""
    idx = _sign_index(sign)
    dom = DOMICILE.get(body, [])
    out = []
    if idx in dom:
        out.append("domicile")
    if EXALTATION.get(body) == idx:
        out.append("exaltation")
    if idx in [(d + 6) % 12 for d in dom]:
        out.append("detriment")
    if body in EXALTATION and (EXALTATION[body] + 6) % 12 == idx:
        out.append("fall")
    return out


def dignity_of(engine, body, jd, zodiac="tropical"):
    """Dignities of `body` at its position at `jd`."""
    lon = engine.longitude(body, jd, zodiac=zodiac)
    return dignities(body, int(lon // 30) % 12)


# ----------------------------------------------------------- sect
DIURNAL = {"sun", "jupiter", "saturn"}
NOCTURNAL = {"moon", "venus", "mars"}


def is_day_chart(engine, jd, lat, lon_east):
    """Diurnal when the Sun is above the horizon at the given place."""
    sun = engine.position("sun", jd)
    _, alt = az_alt(sun["lon"], sun["lat"], jd, lat, lon_east)
    return alt > 0.0


def planetary_sect(body):
    """A planet's sect: 'diurnal', 'nocturnal', or None (Mercury and points
    have no fixed sect)."""
    if body in DIURNAL:
        return "diurnal"
    if body in NOCTURNAL:
        return "nocturnal"
    return None


def in_sect(body, day_chart):
    """True when a diurnal planet is in a day chart, or a nocturnal planet in a
    night chart. None for planets without a fixed sect."""
    s = planetary_sect(body)
    if s is None:
        return None
    return (s == "diurnal") == bool(day_chart)
