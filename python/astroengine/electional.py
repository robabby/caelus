"""astroengine.electional -- electional building blocks on the validated
primitives: applying/separating aspects, solar phase (combustion/cazimi),
planetary hours, void-of-course Moon, and house placement.

These are arithmetic and time-mapping on apparent positions already checked
against Swiss Ephemeris and JPL Horizons. No new ephemeris. Mirrors nothing new
in the physics: the TS port (electional.ts) reproduces every value, and the
golden fixtures pin the two together.

Conventions:
- Aspect phase is read from the longitude speeds: applying means the orb to the
  exact aspect is closing.
- Solar phase (cazimi/combust/under the beams) uses ecliptic-longitude
  elongation to the Sun, the traditional convention.
- Planetary hours split sunrise->sunset into twelve day hours and
  sunset->next-sunrise into twelve night hours, ruled by the Chaldean order
  from the day's planetary ruler.
- The Moon is void of course from its last perfecting aspect to a traditional
  planet until it leaves its current sign.
"""
import math

from .events import rise_set, _bisect
from .chart import SIGNS, ASPECTS, DEFAULT_ORBS

# Planets that take part in traditional aspects/sect, slowest to fastest.
TRADITIONAL = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"]
# Chaldean order for planetary hours (slowest to fastest).
CHALDEAN = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"]
# Weekday ruler, 0 = Sunday (Meeus day-of-week convention).
DAY_RULERS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"]

CAZIMI_DEG = 0.2833       # 17 arcminutes
COMBUST_DEG = 8.5
UNDER_BEAMS_DEG = 15.0


def _wrap180(x):
    return ((x + 180.0) % 360.0) - 180.0


def signed_elongation(lon_a, lon_b):
    """Signed shortest angle from b to a, in (-180, 180] degrees."""
    return _wrap180(lon_a - lon_b)


def separation(lon_a, lon_b):
    """Unsigned angular separation in [0, 180] degrees."""
    return abs(_wrap180(lon_a - lon_b))


# ------------------------------------------------------ applying / separating
def aspect_phase(lon_a, speed_a, lon_b, speed_b, aspect_deg):
    """'applying' | 'separating' | 'exact' for the aspect (degrees) between body
    a and body b, from their longitudes and longitude speeds (deg/day).
    Applying = the orb to the exact aspect is closing."""
    e = _wrap180(lon_a - lon_b)
    sep = abs(e)
    dsep_dt = (1.0 if e >= 0.0 else -1.0) * (speed_a - speed_b)
    orb = sep - aspect_deg
    if abs(orb) < 1e-9:
        return "exact"
    d_abs_orb_dt = (1.0 if orb >= 0.0 else -1.0) * dsep_dt
    return "applying" if d_abs_orb_dt < 0.0 else "separating"


def aspect_between(engine, body_a, body_b, jd_ut, zodiac="tropical", orbs=None):
    """The tightest major aspect between two bodies at jd, within orb, or None.
    Returns {aspect, orb, separation, phase}; orb is the signed distance from
    exact (degrees), phase is applying/separating."""
    if orbs is None:
        orbs = DEFAULT_ORBS
    pa = engine.position(body_a, jd_ut, zodiac=zodiac)
    pb = engine.position(body_b, jd_ut, zodiac=zodiac)
    sep = separation(pa["lon"], pb["lon"])
    best = None
    for name, deg in ASPECTS.items():
        orb = sep - deg
        if abs(orb) <= orbs.get(name, 0.0):
            if best is None or abs(orb) < abs(best[1]):
                best = (name, orb)
    if best is None:
        return None
    name, orb = best
    return {
        "aspect": name,
        "orb": orb,
        "separation": sep,
        "phase": aspect_phase(pa["lon"], pa["speed"], pb["lon"], pb["speed"],
                              ASPECTS[name]),
    }


# ---------------------------------------------------- solar phase (combustion)
def solar_elongation(engine, body, jd_ut, zodiac="tropical"):
    """Ecliptic-longitude separation between a body and the Sun (degrees)."""
    lb = engine.longitude(body, jd_ut, zodiac=zodiac)
    ls = engine.longitude("sun", jd_ut, zodiac=zodiac)
    return separation(lb, ls)


def solar_phase(engine, body, jd_ut, zodiac="tropical",
                cazimi=CAZIMI_DEG, combust=COMBUST_DEG, under_beams=UNDER_BEAMS_DEG):
    """'cazimi' | 'combust' | 'under_beams' | None for a body's nearness to the
    Sun by ecliptic longitude. The Sun itself returns None."""
    if body == "sun":
        return None
    sep = solar_elongation(engine, body, jd_ut, zodiac=zodiac)
    if sep <= cazimi:
        return "cazimi"
    if sep <= combust:
        return "combust"
    if sep <= under_beams:
        return "under_beams"
    return None


# ----------------------------------------------------------- planetary hours
def planetary_hour(engine, jd_ut, lat, lon_east):
    """The planetary hour containing jd_ut at a place. Returns
    {ruler, kind, hour, day_ruler, start, end} where kind is day|night, hour is
    1..24 from sunrise, and start/end bound the hour (UT JD). None at latitudes
    where the Sun does not rise or set on the day in question."""
    # The planetary day opens at the most recent sunrise at or before jd_ut.
    sr = rise_set(engine, "sun", jd_ut - 1.0, lat, lon_east, kind="rise")
    if sr is None:
        return None
    nxt = rise_set(engine, "sun", sr + 0.01, lat, lon_east, kind="rise")
    while nxt is not None and nxt <= jd_ut:
        sr = nxt
        nxt = rise_set(engine, "sun", sr + 0.01, lat, lon_east, kind="rise")
    if sr > jd_ut:
        return None
    day_start = sr
    day_end = rise_set(engine, "sun", day_start + 0.01, lat, lon_east, kind="set")
    if day_end is None:
        return None
    night_end = rise_set(engine, "sun", day_end + 0.01, lat, lon_east, kind="rise")
    if night_end is None:
        return None

    if jd_ut < day_end:
        span = (day_end - day_start) / 12.0
        idx = min(int((jd_ut - day_start) / span), 11)
        kind = "day"
        hour_number = idx
        start = day_start + idx * span
    else:
        span = (night_end - day_end) / 12.0
        idx = min(int((jd_ut - day_end) / span), 11)
        kind = "night"
        hour_number = 12 + idx
        start = day_end + idx * span

    weekday = int(math.floor(day_start + 1.5)) % 7   # 0 = Sunday
    day_ruler = DAY_RULERS[weekday]
    ruler = CHALDEAN[(CHALDEAN.index(day_ruler) + hour_number) % 7]
    return {
        "ruler": ruler,
        "kind": kind,
        "hour": hour_number + 1,
        "day_ruler": day_ruler,
        "start": start,
        "end": start + span,
    }


# --------------------------------------------------------- void-of-course Moon
def _perfections(engine, body_a, body_b, aspect_deg, jd_start, jd_end,
                 zodiac, step):
    """UT JDs in [jd_start, jd_end] where the aspect between the two bodies
    perfects, both orientations. The relative-longitude root-find mirrors
    events.crossings."""
    roots = []
    orientations = (1, -1) if aspect_deg not in (0.0, 180.0) else (1,)
    for orient in orientations:
        def f(t, orient=orient):
            la = engine.longitude(body_a, t, zodiac=zodiac)
            lb = engine.longitude(body_b, t, zodiac=zodiac)
            return ((la - lb - orient * aspect_deg + 180.0) % 360.0) - 180.0
        prev = f(jd_start)
        t = jd_start + step
        while t <= jd_end:
            cur = f(t)
            if prev * cur < 0.0 and abs(cur - prev) < 180.0:
                roots.append(_bisect(f, t - step, t))
            prev = cur
            t += step
    roots.sort()
    return roots


def void_of_course(engine, jd_ut, zodiac="tropical", max_days=14.0):
    """Void-of-course state of the Moon at jd_ut. Returns {is_void, sign,
    sign_exit, next_aspect}: the Moon is void from its last perfecting aspect to
    a traditional planet (Sun..Saturn) until it leaves the sign it occupies at
    jd_ut. sign_exit is the UT JD it changes sign; next_aspect is the UT JD it
    next perfects a major aspect before then, or None when void."""
    moon = engine.longitude("moon", jd_ut, zodiac=zodiac)
    sign = int(moon // 30) % 12
    boundary = ((sign + 1) * 30.0) % 360.0

    # Moon crosses the next sign boundary within a couple of days; scan finely.
    def edge(t):
        return ((engine.longitude("moon", t, zodiac=zodiac) - boundary + 180.0)
                % 360.0) - 180.0
    sign_exit = None
    step = 0.125
    prev = edge(jd_ut)
    t = jd_ut + step
    while t <= jd_ut + max_days:
        cur = edge(t)
        if prev * cur < 0.0 and abs(cur - prev) < 180.0:
            sign_exit = _bisect(edge, t - step, t)
            break
        prev = cur
        t += step
    if sign_exit is None:
        sign_exit = jd_ut + max_days

    next_aspect = None
    for planet in ("sun", "mercury", "venus", "mars", "jupiter", "saturn"):
        for deg in ASPECTS.values():
            for jd in _perfections(engine, "moon", planet, float(deg),
                                   jd_ut, sign_exit, zodiac, 0.125):
                if jd > jd_ut and (next_aspect is None or jd < next_aspect):
                    next_aspect = jd
    return {
        "is_void": next_aspect is None,
        "sign": SIGNS[sign],
        "sign_exit": sign_exit,
        "next_aspect": next_aspect,
    }


# -------------------------------------------------------------- house helpers
def house_of(lon, cusps):
    """1-based house number for an ecliptic longitude (degrees) given the twelve
    cusps (degrees), wrapping across 0."""
    lon = lon % 360.0
    for i in range(12):
        a = cusps[i] % 360.0
        b = cusps[(i + 1) % 12] % 360.0
        span = (b - a) % 360.0
        if span == 0.0:
            continue
        if (lon - a) % 360.0 < span:
            return i + 1
    return 12


def angularity(house):
    """'angular' | 'succedent' | 'cadent' for a 1-based house number."""
    return ["angular", "succedent", "cadent"][(house - 1) % 3]
