"""astroengine.chart -- public API: natal charts, aspects, retrogrades."""
import math
from . import core
from .core import (Vsop, jd_tt, julian_day, planet_apparent, sun_apparent,
                   moon_apparent, pluto_apparent, mean_node, true_node, DEG)
from . import houses as H

BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
          "uranus", "neptune", "pluto", "chiron", "mean_node", "true_node"]

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
         "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

ASPECTS = {"conjunction": 0, "sextile": 60, "square": 90, "trine": 120, "opposition": 180}
DEFAULT_ORBS = {"conjunction": 8, "sextile": 4, "square": 7, "trine": 7, "opposition": 8}


class Engine:
    def __init__(self, level="full"):
        self.vsop = Vsop(level)

    def longitude(self, body, jd_ut):
        """Apparent geocentric ecliptic longitude (deg), true equinox of date."""
        jde = jd_tt(jd_ut)
        if body == "sun":
            lon, _, _ = sun_apparent(self.vsop, jde)
        elif body == "moon":
            if core.moon_in_precise_range(jde):
                lon, _, _ = core.moon_apparent_precise(jde)
            else:
                lon, _, _ = moon_apparent(jde)
        elif body == "pluto":
            lon, _, _ = pluto_apparent(self.vsop, jde)
        elif body == "chiron":
            lon, _, _ = core.chiron_apparent(self.vsop, jde)
        elif body == "mean_node":
            lon = mean_node(jde)
        elif body == "true_node":
            if core.moon_in_precise_range(jde):
                lon = core.true_node_precise(jde)
            else:
                lon = true_node(jde)
        else:
            lon, _, _ = planet_apparent(self.vsop, body, jde)
        return lon / DEG

    def position(self, body, jd_ut):
        """Longitude (deg) + speed (deg/day) + retrograde flag."""
        h = 0.25  # days; central difference
        lon = self.longitude(body, jd_ut)
        l0 = self.longitude(body, jd_ut - h)
        l1 = self.longitude(body, jd_ut + h)
        speed = ((l1 - l0 + 540) % 360 - 180) / (2 * h)
        return {"lon": lon, "speed": speed, "retrograde": speed < 0,
                "sign": SIGNS[int(lon // 30)], "sign_deg": lon % 30}

    def chart(self, y, mo, d, h, mi, s, lat, lon_east, house_system="placidus"):
        """Full natal chart. Time is UT. East longitude positive."""
        jd_ut = julian_day(y, mo, d, h, mi, s)
        bodies = {b: self.position(b, jd_ut) for b in BODIES}
        asc, mc, armc, eps = H.angles(jd_ut, lat, lon_east)
        phi = lat * DEG
        used = house_system
        if house_system == "placidus":
            if abs(lat) < 66.0:
                cusps = H.houses_placidus(armc, phi, eps)
            else:
                used = "whole_sign"  # Placidus undefined above polar circles
                cusps = H.houses_whole_sign(asc)
        elif house_system == "porphyry":
            cusps = H.houses_porphyry(asc, mc)
        elif house_system == "equal":
            cusps = H.houses_equal(asc)
        else:
            cusps = H.houses_whole_sign(asc)
        return {
            "jd_ut": jd_ut,
            "house_system": used,
            "house_system_requested": house_system,
            "bodies": bodies,
            "angles": {"asc": asc / DEG, "mc": mc / DEG},
            "cusps": [c / DEG for c in cusps],
            "aspects": find_aspects(bodies),
        }


def find_aspects(bodies, orbs=DEFAULT_ORBS):
    out = []
    names = [b for b in bodies if not b.endswith("_node")]
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            sep = abs((bodies[a]["lon"] - bodies[b]["lon"] + 180) % 360 - 180)
            for asp, angle in ASPECTS.items():
                orb = abs(sep - angle)
                if orb <= orbs[asp]:
                    out.append({"a": a, "b": b, "aspect": asp, "orb": round(orb, 2)})
    return out


def fmt_lon(deg):
    sign = SIGNS[int(deg // 30)]
    d = deg % 30
    m = (d % 1) * 60
    return f"{int(d):2d}\u00b0{int(m):02d}' {sign}"
