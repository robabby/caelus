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
from .houses import gast
from .core import DEG

ANGLES = ["rise", "mtransit", "set", "itransit"]
DEFAULT_PARAN_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]
TWO_PI = 2.0 * math.pi
# Local sidereal time advances one turn per sidereal day.
_SID_RATE = 360.98564736629 * DEG
# Standard rise/set: a point on the geometric horizon lifted by ~34' of
# refraction, matching the engine's rise_set convention.
_RISE_ALT = -0.5667 * DEG


def _time_at_lst(engine, jd, target):
    """The UT instant in ``[jd, jd+1)`` when apparent sidereal time = ``target``
    (radians). ``gast`` is monotonic and near-linear, so a linear seed plus a
    Newton step or two pins it."""
    dlst = (target - gast(jd)) % TWO_PI
    t = jd + dlst / _SID_RATE
    for _ in range(2):
        err = (gast(t) - target + math.pi) % TWO_PI - math.pi
        t -= err / _SID_RATE
    return t


def star_angle_times(engine, star, jd, lat):
    """The four angle crossings of a fixed ``star`` over the day from ``jd`` at
    latitude ``lat``: upper/lower meridian transits always occur; rise and set
    are absent when the star is circumpolar or never rises."""
    fs = engine.fixed_star(star, jd)
    alpha = (fs["ra"] * DEG) % TWO_PI
    delta = fs["dec"] * DEG
    phi = lat * DEG
    out = {
        "mtransit": _time_at_lst(engine, jd, alpha),
        "itransit": _time_at_lst(engine, jd, (alpha + math.pi) % TWO_PI),
    }
    denom = math.cos(phi) * math.cos(delta)
    if denom != 0.0:
        cos_h0 = (math.sin(_RISE_ALT) - math.sin(phi) * math.sin(delta)) / denom
        if -1.0 <= cos_h0 <= 1.0:
            h0 = math.acos(cos_h0)
            out["rise"] = _time_at_lst(engine, jd, (alpha - h0) % TWO_PI)
            out["set"] = _time_at_lst(engine, jd, (alpha + h0) % TWO_PI)
    return out


def star_parans(engine, jd, lat, stars, bodies=None, tolerance_min=30.0):
    """Star-to-body parans over the day from ``jd`` (UT) at latitude ``lat``: a
    fixed star and a moving body simultaneously on angles within
    ``tolerance_min`` minutes. Returns ``{star, star_angle, body, body_angle,
    jd, gap_min}``, ordered by (star, body, jd)."""
    bodies = bodies if bodies is not None else DEFAULT_PARAN_BODIES

    body_events = []  # (body, angle, t)
    for b in bodies:
        for kind in ANGLES:
            t = rise_set(engine, b, jd, lat, 0.0, kind)
            if t is not None and t < jd + 1.0:
                body_events.append((b, kind, t))

    out = []
    for s in stars:
        for sa, ts in star_angle_times(engine, s, jd, lat).items():
            if not (jd <= ts < jd + 1.0):
                continue
            for (b, ba, tb) in body_events:
                gap = abs(ts - tb) * 1440.0
                if gap <= tolerance_min:
                    out.append({
                        "star": s, "star_angle": sa, "body": b, "body_angle": ba,
                        "jd": round((ts + tb) / 2.0, 6), "gap_min": round(gap, 4),
                    })

    out.sort(key=lambda p: (p["star"], p["body"], p["jd"]))
    return out


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
