"""astroengine.vargas -- Vedic divisional charts (vargas).

A varga D-n divides each 30-degree sign into n equal parts and maps each part to
a sign by a classical (Parashari) rule. This module covers the unambiguous,
textbook set: D1 (rasi), D3 (drekkana), D9 (navamsa), D10 (dasamsa), and D12
(dwadasamsa). The contested hora (D2) and the unequal trimsamsa (D30) are left
to a later step where their conventions can be pinned.

Rules (rasi and division both 0-based; an "odd sign" is the 1st, 3rd, ... =
even rasi index):
- D1:  the sign itself.
- D3:  (rasi + 4 * div) % 12        (1st part = sign, 2nd = 5th, 3rd = 9th).
- D9:  ([0, 9, 6, 3][rasi % 4] + div) % 12   (start by element: fire -> Aries,
       earth -> Capricorn, air -> Libra, water -> Cancer).
- D10: odd sign (rasi + div) % 12; even sign (rasi + 8 + div) % 12
       (odd from the sign, even from the 9th).
- D12: (rasi + div) % 12            (always from the sign itself).

Computed from rasi = floor(lon / 30) and div = floor(within / (30 / n)) rather
than a single continuous division, which keeps sign boundaries robust;
``math.floor`` matches JavaScript's ``Math.floor`` bit for bit. Built on the
sidereal longitudes the engine validates against Swiss Ephemeris. The TS port
(vargas.ts) reproduces every value and the golden fixtures pin the two together.
"""
import math

from .chart import SIGNS

# Element start sign for the navamsa (fire, earth, air, water by rasi % 4).
_NAVAMSA_START = [0, 9, 6, 3]
# Supported divisions.
VARGA_DIVISIONS = [1, 3, 9, 10, 12]


def _varga_sign(rasi, div, n):
    if n == 1:
        return rasi
    if n == 3:
        return (rasi + 4 * div) % 12
    if n == 9:
        return (_NAVAMSA_START[rasi % 4] + div) % 12
    if n == 10:
        return (rasi + div) % 12 if rasi % 2 == 0 else (rasi + 8 + div) % 12
    if n == 12:
        return (rasi + div) % 12
    raise ValueError(f"unsupported varga D{n}")


def varga(sidereal_lon, n):
    """The varga D-n placement of a sidereal longitude: the rasi (D1 sign), the
    division (1..n), and the resulting varga sign."""
    lon = sidereal_lon % 360.0
    rasi = math.floor(lon / 30.0) % 12
    within = lon - rasi * 30.0
    div = math.floor(within / (30.0 / n))
    if div >= n:                       # guard a boundary rounding to n
        div = n - 1
    s = _varga_sign(rasi, div, n)
    return {"varga": n, "rasi": SIGNS[rasi], "rasi_index": rasi,
            "sign": SIGNS[s], "sign_index": s, "division": div + 1}


def varga_at(engine, jd_ut, n, body="moon", zodiac="sidereal:lahiri"):
    """The varga D-n of a body (default the Moon) at jd, in a sidereal zodiac."""
    return varga(engine.longitude(body, jd_ut, zodiac=zodiac), n)


def varga_chart(engine, jd_ut, n, bodies=None, zodiac="sidereal:lahiri"):
    """The full divisional chart D-n at jd: the varga sign of each body."""
    if bodies is None:
        from .chart import BODIES
        bodies = BODIES
    return {b: varga(engine.longitude(b, jd_ut, zodiac=zodiac), n) for b in bodies}
