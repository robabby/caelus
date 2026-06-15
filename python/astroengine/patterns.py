"""astroengine.patterns -- classical aspect configurations as first-class objects.

Pure geometry over a chart's body longitudes (and houses, for stelliums): no
interpretation. Each configuration is judged from pairwise angular separations
against an explicit, overridable orb policy (the engine's DEFAULT_ORBS for the
Ptolemaic aspects, plus a quincunx for yods). The default body set is the
aspectable bodies (planets and Chiron; nodes and Lilith are excluded, matching
find_aspects).

Reported patterns are maximal: a grand cross suppresses the two T-squares it
contains, and a kite suppresses its grand trine, so the output reads the way an
astrologer would name it. The TS port (patterns.ts) reproduces every value and
the golden fixtures pin the two together.
"""
from itertools import combinations

from .chart import NOT_ASPECTABLE, SIGNS

# Pattern aspects, including the quincunx (150 deg) that yods need and that the
# default Ptolemaic set omits.
PATTERN_ANGLES = {
    "conjunction": 0.0, "sextile": 60.0, "square": 90.0,
    "trine": 120.0, "quincunx": 150.0, "opposition": 180.0,
}
# Default orbs: the engine's DEFAULT_ORBS for the five Ptolemaic aspects, plus a
# tight quincunx. Overridable via the `orbs` argument.
PATTERN_ORBS = {
    "conjunction": 8.0, "sextile": 4.0, "square": 7.0,
    "trine": 7.0, "quincunx": 3.0, "opposition": 8.0,
}
# Stable output order, most-complex first.
_KIND_ORDER = [
    "grand_cross", "mystic_rectangle", "kite", "t_square", "grand_trine",
    "yod", "stellium_sign", "stellium_house",
]


def _separation(la, lb):
    return abs((la - lb + 180.0) % 360.0 - 180.0)


def _relation(la, lb, orbs):
    """The single aspect a pair forms (orbs do not overlap), as (name, orb), or
    None. Conjunction is tracked but forms no multi-body pattern here."""
    sep = _separation(la, lb)
    for name, angle in PATTERN_ANGLES.items():
        orb = abs(sep - angle)
        if orb <= orbs[name]:
            return (name, orb)
    return None


def detect_patterns(bodies, orbs=None, body_filter=None):
    """Configurations present among ``bodies``.

    ``bodies`` maps a body id to ``{"lon": deg, "house": int|None}``. ``orbs``
    overrides PATTERN_ORBS. ``body_filter`` overrides the default aspectable set.
    Returns a list of pattern dicts in a fixed order; each has ``kind``,
    ``bodies`` (sorted), ``orb`` (worst defining aspect, 0 for stelliums), and
    ``apex``/``sign``/``house`` where they apply.
    """
    orbs = orbs or PATTERN_ORBS
    names = body_filter if body_filter is not None else [
        b for b in bodies if b not in NOT_ASPECTABLE
    ]
    names = [b for b in names if b in bodies]
    lon = {b: bodies[b]["lon"] % 360.0 for b in names}

    # Pairwise aspect relations, computed once.
    rel = {}
    for a, b in combinations(names, 2):
        r = _relation(lon[a], lon[b], orbs)
        if r is not None:
            rel[frozenset((a, b))] = r

    def asp(a, b):
        return rel.get(frozenset((a, b)))

    def is_aspect(a, b, kind):
        r = asp(a, b)
        return r is not None and r[0] == kind

    out = []

    # Grand trines and mystic rectangles / grand crosses come from 3- and
    # 4-body combinations; T-squares and yods from an opposition/sextile base
    # plus an apex.
    grand_trines = []
    for tri in combinations(names, 3):
        a, b, c = tri
        if is_aspect(a, b, "trine") and is_aspect(b, c, "trine") and is_aspect(a, c, "trine"):
            orb = max(asp(a, b)[1], asp(b, c)[1], asp(a, c)[1])
            grand_trines.append({"kind": "grand_trine", "bodies": sorted(tri), "orb": orb})

    grand_crosses = []
    mystic_rectangles = []
    kites = []
    for quad in combinations(names, 4):
        pairs = list(combinations(quad, 2))
        kinds = [asp(*p) for p in pairs]
        if any(k is None for k in kinds):
            continue
        counts = {}
        for k in kinds:
            counts[k[0]] = counts.get(k[0], 0) + 1
        worst = max(k[1] for k in kinds)
        if counts.get("opposition") == 2 and counts.get("square") == 4:
            grand_crosses.append({"kind": "grand_cross", "bodies": sorted(quad), "orb": worst})
        elif counts.get("opposition") == 2 and counts.get("trine") == 2 and counts.get("sextile") == 2:
            mystic_rectangles.append({"kind": "mystic_rectangle", "bodies": sorted(quad), "orb": worst})

    # Kite: a grand trine plus a fourth body opposite one member (and so sextile
    # the other two).
    for gt in grand_trines:
        tri = gt["bodies"]
        for d in names:
            if d in tri:
                continue
            for apex in tri:
                others = [x for x in tri if x != apex]
                if (is_aspect(d, apex, "opposition")
                        and is_aspect(d, others[0], "sextile")
                        and is_aspect(d, others[1], "sextile")):
                    orb = max(gt["orb"], asp(d, apex)[1], asp(d, others[0])[1], asp(d, others[1])[1])
                    kites.append({"kind": "kite", "bodies": sorted(tri + [d]),
                                  "apex": apex, "orb": orb})

    # T-square: an opposition whose two ends both square a common apex.
    t_squares = []
    for a, b in combinations(names, 2):
        if not is_aspect(a, b, "opposition"):
            continue
        for apex in names:
            if apex in (a, b):
                continue
            if is_aspect(apex, a, "square") and is_aspect(apex, b, "square"):
                orb = max(asp(a, b)[1], asp(apex, a)[1], asp(apex, b)[1])
                t_squares.append({"kind": "t_square", "bodies": sorted([a, b, apex]),
                                  "apex": apex, "orb": orb})

    # Yod: a sextile whose two ends both quincunx a common apex.
    yods = []
    for a, b in combinations(names, 2):
        if not is_aspect(a, b, "sextile"):
            continue
        for apex in names:
            if apex in (a, b):
                continue
            if is_aspect(apex, a, "quincunx") and is_aspect(apex, b, "quincunx"):
                orb = max(asp(a, b)[1], asp(apex, a)[1], asp(apex, b)[1])
                yods.append({"kind": "yod", "bodies": sorted([a, b, apex]),
                             "apex": apex, "orb": orb})

    # Suppress sub-patterns contained in a larger reported one.
    cross_sets = [frozenset(g["bodies"]) for g in grand_crosses]
    kite_sets = [frozenset(k["bodies"]) for k in kites]
    t_squares = [t for t in t_squares
                 if not any(frozenset(t["bodies"]) <= cs for cs in cross_sets)]
    grand_trines = [g for g in grand_trines
                    if not any(frozenset(g["bodies"]) <= ks for ks in kite_sets)]

    out += grand_crosses + mystic_rectangles + kites + t_squares + grand_trines + yods

    # Stelliums by sign and by house: three or more bodies sharing one.
    by_sign = {}
    for b in names:
        s = int(lon[b] // 30) % 12
        by_sign.setdefault(s, []).append(b)
    for s, members in by_sign.items():
        if len(members) >= 3:
            out.append({"kind": "stellium_sign", "bodies": sorted(members),
                        "sign": SIGNS[s], "orb": 0.0})

    by_house = {}
    for b in names:
        h = bodies[b].get("house")
        if h is not None:
            by_house.setdefault(h, []).append(b)
    for h, members in by_house.items():
        if len(members) >= 3:
            out.append({"kind": "stellium_house", "bodies": sorted(members),
                        "house": h, "orb": 0.0})

    out.sort(key=lambda p: (_KIND_ORDER.index(p["kind"]), p["bodies"]))
    for p in out:
        p["orb"] = round(p["orb"], 4)
    return out
