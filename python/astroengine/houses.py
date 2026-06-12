"""astroengine.houses -- sidereal time, angles, house systems."""
import math
from .core import J2000, DEG, nutation, true_obliquity, jd_tt

TWO_PI = 2 * math.pi


def gmst(jd_ut):
    """Greenwich mean sidereal time, radians (IAU 1982 / Meeus 12.4)."""
    T = (jd_ut - J2000) / 36525.0
    deg = (280.46061837 + 360.98564736629 * (jd_ut - J2000)
           + 0.000387933 * T * T - T**3 / 38710000.0)
    return (deg % 360.0) * DEG


def gast(jd_ut):
    """Greenwich apparent sidereal time (adds equation of the equinoxes)."""
    jde = jd_tt(jd_ut)
    dpsi, _ = nutation(jde)
    eps = true_obliquity(jde)
    return (gmst(jd_ut) + dpsi * math.cos(eps)) % TWO_PI


def angles(jd_ut, lat_deg, lon_deg):
    """Ascendant, MC, ARMC, obliquity. East longitude positive."""
    jde = jd_tt(jd_ut)
    eps = true_obliquity(jde)
    armc = (gast(jd_ut) + lon_deg * DEG) % TWO_PI  # local apparent ST
    phi = lat_deg * DEG
    mc = math.atan2(math.sin(armc), math.cos(armc) * math.cos(eps)) % TWO_PI
    asc = math.atan2(
        math.cos(armc),
        -(math.sin(armc) * math.cos(eps) + math.tan(phi) * math.sin(eps)),
    ) % TWO_PI
    return asc, mc, armc, eps


def houses_whole_sign(asc):
    first = (int(asc / (30 * DEG))) * 30 * DEG
    return [(first + i * 30 * DEG) % TWO_PI for i in range(12)]


def houses_equal(asc):
    return [(asc + i * 30 * DEG) % TWO_PI for i in range(12)]


def houses_porphyry(asc, mc):
    ic = (mc + math.pi) % TWO_PI
    dsc = (asc + math.pi) % TWO_PI
    def span(a, b):
        return (b - a) % TWO_PI
    q1 = span(asc, ic) if False else span(mc, asc)  # MC->ASC quadrant
    cusps = [0.0] * 12
    cusps[0] = asc
    cusps[9] = mc
    s = span(mc, asc) / 3.0           # houses 10,11,12
    cusps[10] = (mc + s) % TWO_PI
    cusps[11] = (mc + 2 * s) % TWO_PI
    s = span(asc, ic) / 3.0           # houses 1,2,3
    cusps[1] = (asc + s) % TWO_PI
    cusps[2] = (asc + 2 * s) % TWO_PI
    cusps[3] = ic
    cusps[6] = dsc
    for i in range(3):                # opposite cusps
        cusps[4 + i] = (cusps[10 + i if 10 + i < 12 else 10 + i - 12] + math.pi) % TWO_PI
    cusps[4] = (cusps[10] + math.pi) % TWO_PI
    cusps[5] = (cusps[11] + math.pi) % TWO_PI
    cusps[7] = (cusps[1] + math.pi) % TWO_PI
    cusps[8] = (cusps[2] + math.pi) % TWO_PI
    return cusps


def _placidus_cusp(armc, phi, eps, f, above):
    """Solve a Placidus intermediate cusp by fixed-point iteration.
    f: fraction of semi-arc (1/3 or 2/3); above: True for houses 11,12 (RA
    offsets measured from ARMC), False for 2,3 (from ARMC+180)."""
    if above:
        ra0 = armc + f * math.pi / (1.5 if f == 1/3 else 3.0)  # placeholder
    # Standard iteration (e.g. Koch & many references):
    #   houses 11: H = armc + 30deg scaled... use classic scheme below.
    raise NotImplementedError


def houses_placidus(armc, phi, eps):
    """Placidus cusps via the classic iterative scheme.

    For cusp k with semi-arc fraction f and base point:
      11th: RA = ARMC + 30deg,  f = 1/3   (diurnal)
      12th: RA = ARMC + 60deg,  f = 2/3   (diurnal)
       2nd: RA = ARMC + 120deg, f = 2/3   (nocturnal)
       3rd: RA = ARMC + 150deg, f = 1/3   (nocturnal)
    Iterate: D = asin(sin eps * sin lambda); A = f * asin(tan phi tan D);
      diurnal:  RA' = base - A ... implemented in ecliptic-longitude form.
    Fails above polar circles (as Placidus does); caller should fall back."""
    cusps = [None] * 12

    def cusp(offset_deg, f):
        # Semi-arc derivation: cusp point's hour angle H = -(fraction of
        # diurnal/nocturnal semi-arc), which reduces for ALL four cusps to
        #   RA = ARMC + offset + f * AD,  AD = asin(tan(phi) tan(dec))
        # offsets 30/60/120/150 with f = 1/3, 2/3, 2/3, 1/3.
        lam = (armc + offset_deg * DEG) % TWO_PI
        for _ in range(50):
            dec = math.asin(math.sin(eps) * math.sin(lam))
            x = math.tan(phi) * math.tan(dec)
            x = max(-1.0, min(1.0, x))
            ad = math.asin(x)
            ra_i = (armc + offset_deg * DEG + f * ad) % TWO_PI
            lam_new = math.atan2(math.sin(ra_i), math.cos(ra_i) * math.cos(eps)) % TWO_PI
            if abs((lam_new - lam + math.pi) % TWO_PI - math.pi) < 1e-10:
                lam = lam_new
                break
            lam = lam_new
        return lam

    asc, mc = None, None
    mc = math.atan2(math.sin(armc), math.cos(armc) * math.cos(eps)) % TWO_PI
    asc = math.atan2(
        math.cos(armc),
        -(math.sin(armc) * math.cos(eps) + math.tan(phi) * math.sin(eps)),
    ) % TWO_PI
    cusps[0] = asc
    cusps[9] = mc
    cusps[10] = cusp(30, 1.0 / 3.0)    # 11th
    cusps[11] = cusp(60, 2.0 / 3.0)    # 12th
    cusps[1] = cusp(120, 2.0 / 3.0)     # 2nd
    cusps[2] = cusp(150, 1.0 / 3.0)     # 3rd
    cusps[3] = (mc + math.pi) % TWO_PI
    cusps[6] = (asc + math.pi) % TWO_PI
    cusps[4] = (cusps[10] + math.pi) % TWO_PI
    cusps[5] = (cusps[11] + math.pi) % TWO_PI
    cusps[7] = (cusps[1] + math.pi) % TWO_PI
    cusps[8] = (cusps[2] + math.pi) % TWO_PI
    return cusps
