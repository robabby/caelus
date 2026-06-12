"""astroengine.chart -- public API: natal charts, aspects, retrogrades."""
import math
from . import core
from .core import (Vsop, jd_tt, julian_day, planet_apparent, sun_apparent,
                   moon_apparent, pluto_apparent, mean_node, true_node,
                   equatorial, ayanamsa, mean_lilith, topocentric_ecl,
                   true_obliquity, nutation, DEG)
from . import houses as H

BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
          "uranus", "neptune", "pluto", "chiron", "mean_node", "true_node"]

# Computable on request (not in the default chart set).
EXTRA_BODIES = ["mean_lilith", "true_lilith"]

# Points: excluded from aspect search by default.
NOT_ASPECTABLE = {"mean_node", "true_node", "mean_lilith", "true_lilith"}

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
         "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

ASPECTS = {"conjunction": 0, "sextile": 60, "square": 90, "trine": 120, "opposition": 180}
DEFAULT_ORBS = {"conjunction": 8, "sextile": 4, "square": 7, "trine": 7, "opposition": 8}

KM_PER_AU = 149597870.7

HOUSE_FNS = {
    "porphyry": None, "equal": None, "whole_sign": None, "placidus": None,  # legacy paths
    "koch": H.houses_koch,
    "regiomontanus": H.houses_regiomontanus,
    "campanus": H.houses_campanus,
    "alcabitius": H.houses_alcabitius,
    "morinus": H.houses_morinus,
    "meridian": H.houses_meridian,
    "polich_page": H.houses_polich_page,
    "vehlow": H.houses_vehlow,
}
HOUSE_SYSTEMS = list(HOUSE_FNS.keys())


def _parse_zodiac(zodiac):
    """'tropical' or 'sidereal:<ayanamsa>' -> ayanamsa mode or None."""
    if zodiac == "tropical":
        return None
    if zodiac.startswith("sidereal:"):
        mode = zodiac[len("sidereal:"):]
        if mode in core.AYANAMSA_J2000:
            return mode
    raise ValueError(f"unknown zodiac {zodiac!r}")


class Engine:
    def __init__(self, level="full"):
        self.vsop = Vsop(level)

    def _ecliptic(self, body, jde):
        """Apparent geocentric (lon rad, lat rad, dist AU or None)."""
        if body == "sun":
            return sun_apparent(self.vsop, jde)
        if body == "moon":
            if core.moon_in_precise_range(jde):
                lon, lat, km = core.moon_apparent_precise(jde)
            else:
                lon, lat, km = moon_apparent(jde)
            return lon, lat, km / KM_PER_AU
        if body == "pluto":
            return pluto_apparent(self.vsop, jde)
        if body == "chiron":
            return core.chiron_apparent(self.vsop, jde)
        if body == "mean_node":
            return mean_node(jde), 0.0, None
        if body == "true_node":
            if core.moon_in_precise_range(jde):
                return core.true_node_precise(jde), 0.0, None
            return true_node(jde), 0.0, None
        if body == "mean_lilith":
            lon, lat = mean_lilith(jde)
            return lon, lat, None
        if body == "true_lilith":
            if core.moon_in_precise_range(jde):
                lon, lat, km = core.osc_apogee_precise(jde)
            else:
                lon, lat, km = core.osc_apogee_series(jde)
            return lon, lat, km / KM_PER_AU
        return planet_apparent(self.vsop, body, jde)

    def _lon_only(self, body, jd_ut, mode, topo):
        jde = jd_tt(jd_ut)
        lon, lat, dist = self._ecliptic(body, jde)
        if topo is not None and dist is not None:
            lst = (H.gast(jd_ut) + topo[1] * DEG) % (2 * math.pi)
            lon, lat, dist = topocentric_ecl(lon, lat, dist, lst,
                                             topo[0] * DEG, topo[2],
                                             true_obliquity(jde))
        lon_deg = lon / DEG
        if mode is not None:
            lon_deg = (lon_deg - nutation(jde)[0] / DEG - ayanamsa(jde, mode)) % 360
        return lon_deg

    def longitude(self, body, jd_ut, zodiac="tropical", topocentric=False, observer=None):
        """Apparent geocentric ecliptic longitude (deg). Tropical: true
        equinox of date. Sidereal: mean equinox minus ayanamsa."""
        mode = _parse_zodiac(zodiac)
        topo = observer if topocentric else None
        return self._lon_only(body, jd_ut, mode, topo)

    def heliocentric(self, body, jd_ut):
        """Geometric heliocentric ecliptic of date (deg, deg, AU)."""
        jde = jd_tt(jd_ut)
        if body == "pluto":
            l, b, r = core.pluto_heliocentric(jde)
            l, b = core._precess_ecliptic(l, b, core.J2000, jde)
        elif body == "chiron":
            if core._CHIRON is None:
                core.chiron_apparent(self.vsop, jde)  # loads the fit
            x, y, z = core._CHIRON.xyz(jde)
            r = math.sqrt(x * x + y * y + z * z)
            l = math.atan2(y, x) % (2 * math.pi)
            b = math.atan2(z, math.hypot(x, y))
            l, b = core._precess_ecliptic(l, b, core.J2000, jde)
        elif body in core.PLANET_NAMES or body == "earth":
            l, b, r = self.vsop.heliocentric(body, jde)
        else:
            raise ValueError(f"no heliocentric position for {body!r}")
        return {"lon": l / DEG, "lat": b / DEG, "dist": r}

    def position(self, body, jd_ut, zodiac="tropical", topocentric=False, observer=None):
        """Full position: lon/speed/retrograde/sign + lat, dist (AU), ra, dec."""
        mode = _parse_zodiac(zodiac)
        topo = observer if topocentric else None
        jde = jd_tt(jd_ut)
        lon_r, lat_r, dist = self._ecliptic(body, jde)
        if topo is not None and dist is not None:
            lst = (H.gast(jd_ut) + topo[1] * DEG) % (2 * math.pi)
            lon_r, lat_r, dist = topocentric_ecl(lon_r, lat_r, dist, lst,
                                                 topo[0] * DEG, topo[2],
                                                 true_obliquity(jde))
        ra, dec = equatorial(lon_r, lat_r, true_obliquity(jde))
        lon = lon_r / DEG
        if mode is not None:
            lon = (lon - nutation(jde)[0] / DEG - ayanamsa(jde, mode)) % 360
        h = 0.25  # days; central difference
        l0 = self._lon_only(body, jd_ut - h, mode, topo)
        l1 = self._lon_only(body, jd_ut + h, mode, topo)
        speed = ((l1 - l0 + 540) % 360 - 180) / (2 * h)
        return {"lon": lon, "speed": speed, "retrograde": speed < 0,
                "sign": SIGNS[int(lon // 30)], "sign_deg": lon % 30,
                "lat": lat_r / DEG, "dist": dist,
                "ra": ra / DEG, "dec": dec / DEG}

    def chart(self, y, mo, d, h, mi, s, lat, lon_east, house_system="placidus",
              zodiac="tropical", topocentric=False, extra_bodies=None, orbs=None):
        """Full natal chart. Time is UT. East longitude positive."""
        mode = _parse_zodiac(zodiac)
        jd_ut = julian_day(y, mo, d, h, mi, s)
        observer = (lat, lon_east, 0.0) if topocentric else None
        names = BODIES + [b for b in (extra_bodies or []) if b not in BODIES]
        bodies = {b: self.position(b, jd_ut, zodiac=zodiac,
                                   topocentric=topocentric, observer=observer)
                  for b in names}
        asc, mc, armc, eps = H.angles(jd_ut, lat, lon_east)
        vtx, east = H.vertex_east_point(armc, lat * DEG, eps)
        phi = lat * DEG
        used = house_system
        try:
            if house_system == "placidus":
                if abs(lat) < 66.0:
                    cusps = H.houses_placidus(armc, phi, eps)
                else:
                    raise ValueError("placidus undefined above polar circles")
            elif house_system == "porphyry":
                cusps = H.houses_porphyry(asc, mc)
            elif house_system == "equal":
                cusps = H.houses_equal(asc)
            elif house_system == "whole_sign":
                cusps = H.houses_whole_sign(asc)
            elif house_system in HOUSE_FNS and HOUSE_FNS[house_system]:
                cusps = HOUSE_FNS[house_system](armc, phi, eps)
            else:
                raise KeyError(house_system)
        except ValueError:
            used = "whole_sign"
            cusps = H.houses_whole_sign(asc)
        jde = jd_tt(jd_ut)
        shift = 0.0
        if mode is not None:
            shift = nutation(jde)[0] / DEG + ayanamsa(jde, mode)

        def out_deg(rad):
            return (rad / DEG - shift) % 360

        if mode is not None and used == "whole_sign":
            # whole-sign cusps must stay sign-aligned in the sidereal zodiac
            sid_asc = out_deg(asc)
            first = (int(sid_asc // 30)) * 30.0
            cusps_deg = [(first + i * 30.0) % 360 for i in range(12)]
        else:
            cusps_deg = [out_deg(c) for c in cusps]
        return {
            "jd_ut": jd_ut,
            "zodiac": zodiac,
            "house_system": used,
            "house_system_requested": house_system,
            "bodies": bodies,
            "angles": {"asc": out_deg(asc), "mc": out_deg(mc),
                       "vertex": out_deg(vtx), "east_point": out_deg(east)},
            "cusps": cusps_deg,
            "aspects": find_aspects(bodies, orbs or DEFAULT_ORBS),
        }


def find_aspects(bodies, orbs=DEFAULT_ORBS):
    out = []
    names = [b for b in bodies if b not in NOT_ASPECTABLE]
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
    return f"{int(d):2d}°{int(m):02d}' {sign}"
