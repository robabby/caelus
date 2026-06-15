"""astroengine.signature -- a chart's structural signature, as plain counts.

Element / modality distributions (from each body's sign), angularity / quadrant
/ hemisphere distributions (from its house), the dominant element, modality, and
most-occupied sign (argmax of the counts), and the classical chart ruler (the
domicile ruler of the Ascendant's sign). No interpretation, no "flavour" labels.

The only convention is which bodies are counted and that each counts once: the
default is the aspectable bodies (planets and Chiron; nodes and Lilith excluded),
each weight 1. Weighted "dominance" schemes (luminaries heavier, angles added)
are deliberately not the default. The TS port (signature.ts) reproduces every
value and the golden fixtures pin the two together.
"""
from .chart import NOT_ASPECTABLE, SIGNS

ELEMENTS = ["fire", "earth", "air", "water"]
MODALITIES = ["cardinal", "fixed", "mutable"]
ANGULARITY = ["angular", "succedent", "cadent"]
# Classical (domicile) ruler by sign index 0-11, matching the engine's dignities.
RULERS = ["mars", "venus", "mercury", "moon", "sun", "mercury",
          "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"]


def _argmax(counts, order):
    """The key with the highest count; ties broken by ``order`` (canonical)."""
    best, best_v = order[0], -1
    for k in order:
        if counts[k] > best_v:
            best_v, best = counts[k], k
    return best


def chart_signature(bodies, asc_sign=None, body_filter=None):
    """Structural counts for a chart.

    ``bodies`` maps a body id to ``{"lon": deg, "house": int|None}``.
    ``asc_sign`` (0-11) yields the classical chart ruler. ``body_filter``
    overrides the default aspectable set. House-based counts skip bodies whose
    house is unknown.
    """
    names = body_filter if body_filter is not None else [
        b for b in bodies if b not in NOT_ASPECTABLE
    ]
    names = [b for b in names if b in bodies]

    elements = {e: 0 for e in ELEMENTS}
    modalities = {m: 0 for m in MODALITIES}
    angularity = {a: 0 for a in ANGULARITY}
    quadrants = {str(q): 0 for q in (1, 2, 3, 4)}
    hemispheres = {"above": 0, "below": 0, "eastern": 0, "western": 0}
    sign_counts = {}

    for b in names:
        sign = int((bodies[b]["lon"] % 360.0) // 30) % 12
        elements[ELEMENTS[sign % 4]] += 1
        modalities[MODALITIES[sign % 3]] += 1
        sign_counts[sign] = sign_counts.get(sign, 0) + 1
        h = bodies[b].get("house")
        if h is not None:
            angularity[ANGULARITY[(h - 1) % 3]] += 1
            quadrants[str((h - 1) // 3 + 1)] += 1
            hemispheres["above" if h >= 7 else "below"] += 1
            hemispheres["eastern" if h in (10, 11, 12, 1, 2, 3) else "western"] += 1

    # Most-occupied sign, requiring at least two bodies; lowest index on a tie.
    dom_sign, best = None, 1
    for s in sorted(sign_counts):
        if sign_counts[s] > best:
            best, dom_sign = sign_counts[s], s

    return {
        "elements": elements,
        "modalities": modalities,
        "angularity": angularity,
        "quadrants": quadrants,
        "hemispheres": hemispheres,
        "dominant": {
            "element": _argmax(elements, ELEMENTS),
            "modality": _argmax(modalities, MODALITIES),
            "sign": SIGNS[dom_sign] if dom_sign is not None else None,
        },
        "ruler": RULERS[asc_sign] if asc_sign is not None else None,
        "bodies": sorted(names),
    }
