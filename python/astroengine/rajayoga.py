"""astroengine.rajayoga -- the lordship-and-aspect layer for Vedic yogas, and
the raja/dhana yogas built on it.

Layers, each deterministic:
- House lordship: the traditional ruler of the sign on each whole-sign house
  from the Ascendant.
- Graha drishti (Vedic aspects): every planet aspects the 7th sign from itself;
  Mars also the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th.
- Association: two planets form a yoga when they conjoin, mutually aspect, or
  exchange signs (parivartana).
- Raja yoga: an association between a kendra lord (1/4/7/10) and a trikona lord
  (1/5/9). Dhana yoga: an association between two wealth-house lords (2/5/9/11).
  A yogakaraka is a single planet ruling both a pure kendra (4/7/10) and a pure
  trikona (5/9).

The yoga definitions follow BPHS; the convention (the drishti table, the kendra/
trikona/dhana house sets) is validated against the named source in
`validate_jyotish`, not asserted. The TS port (rajayoga.ts) reproduces every
value and the golden fixtures pin the two together.
"""
from .profections import SIGN_RULERS

# Graha drishti: the house-distances (1-based) each planet aspects.
DRISHTI = {
    "sun": [7], "moon": [7], "mercury": [7], "venus": [7],
    "mars": [4, 7, 8], "jupiter": [5, 7, 9], "saturn": [3, 7, 10],
}
KENDRAS = [1, 4, 7, 10]
TRIKONAS = [1, 5, 9]
DHANA_HOUSES = [2, 5, 9, 11]
PURE_KENDRAS = [4, 7, 10]
PURE_TRIKONAS = [5, 9]
PLANETS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"]


def sign_lord(sign):
    """The traditional ruler of a sign index (0 = Aries)."""
    return SIGN_RULERS[sign % 12]


def house_sign(asc_sign, house):
    """The sign on the given whole-sign house (1-12) from the Ascendant."""
    return (asc_sign + house - 1) % 12


def house_lord(asc_sign, house):
    """The lord of the given whole-sign house from the Ascendant."""
    return sign_lord(house_sign(asc_sign, house))


def house_from_asc(asc_sign, sign):
    """The whole-sign house (1-12) a sign falls in from the Ascendant."""
    return (sign - asc_sign) % 12 + 1


def aspects_sign(planet, planet_sign, target_sign):
    """Whether `planet` at `planet_sign` casts a graha drishti onto target_sign."""
    dist = (target_sign - planet_sign) % 12 + 1
    return dist in DRISHTI.get(planet, [7])


def parivartana(planet_a, sign_a, planet_b, sign_b):
    """Sign exchange: a sits in b's sign and b sits in a's sign."""
    return sign_lord(sign_a) == planet_b and sign_lord(sign_b) == planet_a


def association_type(planet_a, sign_a, planet_b, sign_b):
    """How two planets associate: 'conjunction' | 'exchange' | 'aspect' | None.
    Fixed priority so both ports agree."""
    if planet_a == planet_b:
        return None
    if sign_a == sign_b:
        return "conjunction"
    if parivartana(planet_a, sign_a, planet_b, sign_b):
        return "exchange"
    if aspects_sign(planet_a, sign_a, sign_b) and aspects_sign(planet_b, sign_b, sign_a):
        return "aspect"
    return None


def yogakarakas(asc_sign):
    """Planets that rule both a pure kendra (4/7/10) and a pure trikona (5/9)
    from the Ascendant -- the classic yogakarakas. Sorted."""
    out = []
    for p in PLANETS:
        ruled = {h for h in range(1, 13) if house_lord(asc_sign, h) == p}
        if ruled & set(PURE_KENDRAS) and ruled & set(PURE_TRIKONAS):
            out.append(p)
    return sorted(out)


def _lord_pair_yogas(asc_sign, signs, houses_a, houses_b):
    """Unique associated lord-pairs where one lord rules a house in houses_a and
    the other a house in houses_b. Returns sorted [{lords, via}]."""
    lords_a = sorted({house_lord(asc_sign, h) for h in houses_a})
    lords_b = sorted({house_lord(asc_sign, h) for h in houses_b})
    seen = {}
    for la in lords_a:
        for lb in lords_b:
            via = association_type(la, signs[la], lb, signs[lb])
            if via is None:
                continue
            pair = tuple(sorted([la, lb]))
            seen.setdefault(pair, via)
    return [{"lords": list(p), "via": v} for p, v in sorted(seen.items())]


def raja_yogas(signs, asc_sign):
    """Raja yogas: associations between a kendra lord and a trikona lord.
    `signs` maps each of the seven planets to its 0-based sign index."""
    return _lord_pair_yogas(asc_sign, signs, KENDRAS, TRIKONAS)


def dhana_yogas(signs, asc_sign):
    """Dhana yogas: associations between two wealth-house (2/5/9/11) lords."""
    return _lord_pair_yogas(asc_sign, signs, DHANA_HOUSES, DHANA_HOUSES)


def _signs_of(engine, natal_jd, lat, lon_east, zodiac):
    import math
    chart = engine.chart_at(natal_jd, lat, lon_east, zodiac=zodiac)
    asc_sign = math.floor(chart["angles"]["asc"] / 30.0) % 12
    signs = {p: math.floor(chart["bodies"][p]["lon"] / 30.0) % 12 for p in PLANETS}
    return signs, asc_sign


def raja_yogas_at(engine, natal_jd, lat, lon_east, zodiac="sidereal:lahiri"):
    """Raja yogas of a natal chart, with the chart's yogakarakas."""
    signs, asc_sign = _signs_of(engine, natal_jd, lat, lon_east, zodiac)
    return {"raja": raja_yogas(signs, asc_sign), "yogakarakas": yogakarakas(asc_sign)}


def dhana_yogas_at(engine, natal_jd, lat, lon_east, zodiac="sidereal:lahiri"):
    """Dhana yogas of a natal chart."""
    signs, asc_sign = _signs_of(engine, natal_jd, lat, lon_east, zodiac)
    return dhana_yogas(signs, asc_sign)
