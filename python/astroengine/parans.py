"""astroengine.parans -- paranatellonta (parans): co-angular bodies.

Two bodies are in paran on a given day at a given latitude when both are
simultaneously on one of the four angles: rising, culminating (upper meridian),
setting, or anti-culminating (lower meridian). This is the relationship behind
the fixed-star parans of Brady's tradition, computed here for the moving bodies.

Pure positional astronomy over the validated rise/set/transit times: for each
body the four angle crossings in the 24 hours from the given instant are found
(rise/set are absent for a circumpolar body), and every pair of different bodies
whose angle times fall within ``tolerance_min`` minutes is reported, with the
exact gap. Longitude-independent (the daily pattern only shifts in clock time),
so latitude alone is needed. The tolerance is a stated parameter, not a hidden
convention. The TS port (parans.ts) reproduces every value and the golden
fixtures pin the two together.
"""
import math

from .events import rise_set

ANGLES = ["rise", "mtransit", "set", "itransit"]
DEFAULT_PARAN_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]


def parans(engine, jd, lat, bodies=None, tolerance_min=30.0):
    """Co-angular pairs over the 24 hours from ``jd`` (UT) at latitude ``lat``.

    Returns a list of ``{a, a_angle, b, b_angle, jd, gap_min}`` for each pair of
    different bodies on angles within ``tolerance_min`` minutes, ``a`` < ``b`` by
    name, ordered by (a, b, jd).
    """
    bodies = bodies if bodies is not None else DEFAULT_PARAN_BODIES

    events = []  # (body, angle, t)
    for b in bodies:
        for kind in ANGLES:
            t = rise_set(engine, b, jd, lat, 0.0, kind)
            if t is not None and t < jd + 1.0:
                events.append((b, kind, t))

    out = []
    for i in range(len(events)):
        for j in range(i + 1, len(events)):
            ab, aa, ta = events[i]
            bb, ba, tb = events[j]
            if ab == bb:
                continue
            gap = abs(ta - tb) * 1440.0
            if gap > tolerance_min:
                continue
            if ab <= bb:
                pa, paa, pb, pba = ab, aa, bb, ba
            else:
                pa, paa, pb, pba = bb, ba, ab, aa
            out.append({
                "a": pa, "a_angle": paa, "b": pb, "b_angle": pba,
                "jd": round((ta + tb) / 2.0, 6),
                "gap_min": round(gap, 4),
            })

    out.sort(key=lambda p: (p["a"], p["b"], p["jd"]))
    return out
