"""astroengine.dignity_score -- weighted essential dignities (Ptolemaic / Lilly).

Extends the qualitative dignities() (domicile / exaltation / detriment / fall)
to the full five-fold essential-dignity scoring used by traditional astrology,
with the classical weights from William Lilly's *Christian Astrology* (1647):

    rulership +5, exaltation +4, triplicity +3, term +2, face +1;
    detriment -5, fall -4.

Tables, each pinned to a named authority and selectable where they vary:
- Triplicity: Dorothean rulers by sect (day / night / participating).
- Terms (bounds): the Egyptian bounds (Ptolemy, *Tetrabiblos* I.21). The
  Ptolemaic and Chaldean systems are recognised variants, not the default.
- Faces (decans): Chaldean order, Mars-first from 0 Aries.

Peregrine (a planet with none of the five dignities at its place) is reported as
a flag but not auto-scored, so `total` is a pure essential-dignity sum; Lilly's
-5 peregrine debility is left to the caller. The almuten of a degree is the
classical planet with the greatest positive dignity there. Sect (a day or night
chart) selects the triplicity ruler. The TS port (dignity_score.ts) reproduces
every value and the golden fixtures pin the two together.
"""
from .derived import DOMICILE, EXALTATION

PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]
WEIGHTS = {"rulership": 5, "exaltation": 4, "triplicity": 3, "term": 2, "face": 1,
           "detriment": -5, "fall": -4}

# Dorothean triplicity rulers by element index (sign % 4 -> fire/earth/air/water),
# as [day, night, participating]. (Lilly, after Dorotheus.)
TRIPLICITY = [
    ["sun", "jupiter", "saturn"],     # fire
    ["venus", "moon", "mars"],        # earth
    ["saturn", "mercury", "jupiter"], # air
    ["venus", "mars", "moon"],        # water
]

# Egyptian terms (bounds): per sign, the (ruler, upper-degree) segments,
# 0-indexed sign. Ptolemy, Tetrabiblos I.21.
TERMS_EGYPTIAN = [
    [("jupiter", 6), ("venus", 12), ("mercury", 20), ("mars", 25), ("saturn", 30)],   # Aries
    [("venus", 8), ("mercury", 14), ("jupiter", 22), ("saturn", 27), ("mars", 30)],    # Taurus
    [("mercury", 6), ("jupiter", 12), ("venus", 17), ("mars", 24), ("saturn", 30)],    # Gemini
    [("mars", 7), ("venus", 13), ("mercury", 19), ("jupiter", 26), ("saturn", 30)],    # Cancer
    [("jupiter", 6), ("venus", 11), ("saturn", 18), ("mercury", 24), ("mars", 30)],    # Leo
    [("mercury", 7), ("venus", 17), ("jupiter", 21), ("mars", 28), ("saturn", 30)],    # Virgo
    [("saturn", 6), ("mercury", 14), ("jupiter", 21), ("venus", 28), ("mars", 30)],    # Libra
    [("mars", 7), ("venus", 11), ("mercury", 19), ("jupiter", 24), ("saturn", 30)],    # Scorpio
    [("jupiter", 12), ("venus", 17), ("mercury", 21), ("saturn", 26), ("mars", 30)],   # Sagittarius
    [("mercury", 7), ("jupiter", 14), ("venus", 22), ("saturn", 26), ("mars", 30)],    # Capricorn
    [("mercury", 7), ("venus", 13), ("jupiter", 20), ("mars", 25), ("saturn", 30)],    # Aquarius
    [("venus", 12), ("jupiter", 16), ("mercury", 19), ("mars", 28), ("saturn", 30)],   # Pisces
]

# Faces (decans): Chaldean order, repeating from Mars at 0 Aries; face index
# floor(lon / 10) selects from this 7-cycle.
FACE_CYCLE = ["mars", "sun", "venus", "mercury", "moon", "saturn", "jupiter"]


def term_ruler(sign, deg_in_sign, terms=TERMS_EGYPTIAN):
    for ruler, upper in terms[sign]:
        if deg_in_sign < upper:
            return ruler
    return terms[sign][-1][0]


def face_ruler(lon):
    return FACE_CYCLE[int(lon // 10) % 7]


def dignity_score(planet, lon, sect="day", terms=TERMS_EGYPTIAN):
    """The essential-dignity breakdown of ``planet`` at ecliptic longitude
    ``lon`` (degrees), for a day or night chart (``sect``). Returns the points
    held in each of the five dignities and the two debilities, the ``total``
    (a pure dignity sum), the ``peregrine`` flag, and the ``term``/``face``
    rulers at the place. Only the seven classical planets score.
    """
    lon = lon % 360.0
    sign = int(lon // 30) % 12
    deg = lon - sign * 30.0

    held = {}
    if planet in DOMICILE and sign in DOMICILE[planet]:
        held["rulership"] = WEIGHTS["rulership"]
    if EXALTATION.get(planet) == sign:
        held["exaltation"] = WEIGHTS["exaltation"]
    trip = TRIPLICITY[sign % 4][0 if sect == "day" else 1]
    if planet == trip:
        held["triplicity"] = WEIGHTS["triplicity"]
    tr = term_ruler(sign, deg, terms)
    if planet == tr:
        held["term"] = WEIGHTS["term"]
    fr = face_ruler(lon)
    if planet == fr:
        held["face"] = WEIGHTS["face"]
    # Debilities: the sign opposite the planet's domicile / exaltation.
    if planet in DOMICILE and sign in [(d + 6) % 12 for d in DOMICILE[planet]]:
        held["detriment"] = WEIGHTS["detriment"]
    if planet in EXALTATION and (EXALTATION[planet] + 6) % 12 == sign:
        held["fall"] = WEIGHTS["fall"]

    positive = any(k in held for k in ("rulership", "exaltation", "triplicity", "term", "face"))
    return {
        "planet": planet,
        "rulership": held.get("rulership", 0),
        "exaltation": held.get("exaltation", 0),
        "triplicity": held.get("triplicity", 0),
        "term": held.get("term", 0),
        "face": held.get("face", 0),
        "detriment": held.get("detriment", 0),
        "fall": held.get("fall", 0),
        "total": sum(held.values()),
        "peregrine": not positive,
        "term_ruler": tr,
        "face_ruler": fr,
    }


def almuten(lon, sect="day", terms=TERMS_EGYPTIAN):
    """The almuten of a degree: the classical planet with the greatest positive
    essential dignity (rulership + exaltation + triplicity + term + face) at
    ``lon``. Ties are broken by the canonical planet order. Returns
    ``{"planet", "score"}``.
    """
    best, best_score = None, -1
    for p in PLANETS:
        d = dignity_score(p, lon, sect, terms)
        score = d["rulership"] + d["exaltation"] + d["triplicity"] + d["term"] + d["face"]
        if score > best_score:
            best_score, best = score, p
    return {"planet": best, "score": best_score}
