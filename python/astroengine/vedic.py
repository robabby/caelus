"""astroengine.vedic -- the Vedic/Jyotish layer: nakshatras and the Vimshottari
dasha, built on the already-validated sidereal longitudes.

A nakshatra is one of 27 equal lunar mansions of 13 deg 20' (360/27) in the
sidereal zodiac, each divided into four padas of 3 deg 20'. Each nakshatra has a
ruling planet, cycling Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn,
Mercury (nine lords, three times around). The Vimshottari dasha is a 120-year
sequence of planetary periods (mahadashas) in that same order, with fixed
lengths summing to 120; the starting dasha is the lord of the Moon's birth
nakshatra, and the portion already elapsed is the fraction of the nakshatra the
Moon has traversed. Each mahadasha subdivides into antardashas (and those into
pratyantardashas) of the nine lords, length proportional to the lord's years.

Nakshatra placement is exact division of the sidereal longitude the engine
already validates against Swiss Ephemeris. The dasha is deterministic time
arithmetic; the period year is a fixed length (365.25 days, the common Jyotish
convention) by default. The TS port (vedic.ts) reproduces every value and the
golden fixtures pin the two together.

Floor division uses ``math.floor(x / span)`` rather than the ``//`` operator so
it matches JavaScript's ``Math.floor`` bit for bit on the exact sign/nakshatra
boundaries (Python ``//`` applies a correction that can land a boundary value in
the lower bucket).
"""
import math

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
]

# The Vimshottari order and each lord's period in years (totalling 120).
VIMSHOTTARI_ORDER = ["ketu", "venus", "sun", "moon", "mars", "rahu",
                     "jupiter", "saturn", "mercury"]
VIMSHOTTARI_YEARS = {"ketu": 7, "venus": 20, "sun": 6, "moon": 10, "mars": 7,
                     "rahu": 18, "jupiter": 16, "saturn": 19, "mercury": 17}

NAK_SPAN = 360.0 / 27.0          # 13 deg 20'
VIMSHOTTARI_TOTAL = 120.0
DASHA_YEAR = 365.25              # days per dasha-year (common Jyotish convention)


def nakshatra(sidereal_lon):
    """The nakshatra of a sidereal longitude: index (0 = Ashwini), name, pada
    (1..4), ruling (dasha) lord, and degrees into the nakshatra."""
    lon = sidereal_lon % 360.0
    i = math.floor(lon / NAK_SPAN) % 27
    pos = lon - i * NAK_SPAN
    pada = math.floor(pos / (NAK_SPAN / 4.0)) + 1
    return {"index": i, "name": NAKSHATRAS[i], "pada": pada,
            "lord": VIMSHOTTARI_ORDER[i % 9], "pos": pos}


def nakshatra_at(engine, jd_ut, body="moon", zodiac="sidereal:lahiri"):
    """The nakshatra of a body (default the Moon) at jd, in a sidereal zodiac."""
    return nakshatra(engine.longitude(body, jd_ut, zodiac=zodiac))


def vimshottari_dashas(moon_lon, natal_jd, levels=2, year_length=DASHA_YEAR,
                       count=9):
    """The Vimshottari dasha timeline from the Moon's sidereal longitude. Returns
    {start_lord, balance_years, dashas}, where dashas is `count` mahadashas
    (the first beginning before birth, with its elapsed portion), each with
    antardashas when levels >= 2. Periods are in true Julian Days (UT)."""
    nak_i = math.floor((moon_lon % 360.0) / NAK_SPAN) % 27
    pos = (moon_lon % 360.0) - nak_i * NAK_SPAN
    start_lord = VIMSHOTTARI_ORDER[nak_i % 9]
    elapsed = pos / NAK_SPAN
    y0 = VIMSHOTTARI_YEARS[start_lord]
    li = VIMSHOTTARI_ORDER.index(start_lord)
    t = natal_jd - elapsed * y0 * year_length     # the first mahadasha's true start
    dashas = []
    for k in range(count):
        lord = VIMSHOTTARI_ORDER[(li + k) % 9]
        years = VIMSHOTTARI_YEARS[lord]
        span = years * year_length
        maha = {"level": 1, "lord": lord, "start": t, "end": t + span, "sub": []}
        if levels >= 2:
            sli = VIMSHOTTARI_ORDER.index(lord)
            st = t
            for j in range(9):
                sl = VIMSHOTTARI_ORDER[(sli + j) % 9]
                sub_span = (years * VIMSHOTTARI_YEARS[sl] / VIMSHOTTARI_TOTAL) * year_length
                maha["sub"].append({"lord": sl, "start": st, "end": st + sub_span})
                st += sub_span
        dashas.append(maha)
        t += span
    return {"start_lord": start_lord, "balance_years": (1.0 - elapsed) * y0,
            "dashas": dashas}


def _active_in(periods, target):
    """The period in a tiled list containing target, or None."""
    for p in periods:
        if p["start"] <= target < p["end"]:
            return p
    return None


def vimshottari_active(moon_lon, natal_jd, target_jd, year_length=DASHA_YEAR):
    """The mahadasha, antardasha, and pratyantardasha lords active at target_jd.
    None before the first mahadasha begins."""
    # enough mahadashas to cover any reasonable target (one full 120y cycle + 1)
    timeline = vimshottari_dashas(moon_lon, natal_jd, levels=2,
                                  year_length=year_length, count=10)["dashas"]
    maha = _active_in(timeline, target_jd)
    if maha is None:
        return None
    antar = _active_in(maha["sub"], target_jd)
    if antar is None:
        return {"maha": maha["lord"], "antar": None, "pratyantar": None}
    # pratyantardashas tile the antardasha among the nine lords from its lord
    ay = VIMSHOTTARI_YEARS[maha["lord"]] * VIMSHOTTARI_YEARS[antar["lord"]] / VIMSHOTTARI_TOTAL
    sli = VIMSHOTTARI_ORDER.index(antar["lord"])
    st = antar["start"]
    pratyantar = None
    for j in range(9):
        sl = VIMSHOTTARI_ORDER[(sli + j) % 9]
        span = (ay * VIMSHOTTARI_YEARS[sl] / VIMSHOTTARI_TOTAL) * year_length
        if st <= target_jd < st + span:
            pratyantar = sl
            break
        st += span
    return {"maha": maha["lord"], "antar": antar["lord"], "pratyantar": pratyantar}


def vimshottari_at(engine, natal_jd, target_jd, zodiac="sidereal:lahiri",
                   year_length=DASHA_YEAR):
    """Vimshottari dasha active at target_jd, from the natal Moon's nakshatra.
    Returns {moon_nakshatra, moon_pada, start_lord, maha, antar, pratyantar}."""
    moon_lon = engine.longitude("moon", natal_jd, zodiac=zodiac)
    nak = nakshatra(moon_lon)
    active = vimshottari_active(moon_lon, natal_jd, target_jd, year_length) or {}
    return {"moon_nakshatra": nak["name"], "moon_pada": nak["pada"],
            "start_lord": VIMSHOTTARI_ORDER[nak["index"] % 9], **active}
