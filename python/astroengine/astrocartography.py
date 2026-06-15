"""astroengine.astrocartography -- planetary angle lines across the globe.

For a single moment, each planet is exactly on one of the four angles along a
curve on the Earth's surface: the MC and IC lines are meridians (the planet
culminates / anti-culminates), and the ASC and DSC lines are the curved
rising / setting tracks. Relocating to a point on a planet's line is what
astrocartography is built on.

Geometry only, from each body's right ascension and declination and the moment's
Greenwich apparent sidereal time. The TS port (astrocartography.ts) reproduces
it, pinned by the golden.
"""
import math

from .core import DEG
from .houses import gast


def _map_lon(deg):
    """Wrap a longitude to (-180, 180], east positive."""
    d = deg % 360.0
    return d - 360.0 if d > 180.0 else d


def planet_lines(ra, dec, gast_deg, lat_min=-85.0, lat_max=85.0, lat_step=1.0):
    """Angle lines for one body at right ascension/declination (degrees) and a
    Greenwich apparent sidereal time (degrees). Returns {mc, ic, asc, dsc}: mc
    and ic are meridian longitudes; asc and dsc are lists of [lon, lat] along the
    rising and setting tracks, sampled over the latitude band where the body
    rises and sets."""
    mc = _map_lon(ra - gast_deg)
    ic = _map_lon(ra - gast_deg - 180.0)
    td = math.tan(dec * DEG)
    asc = []
    dsc = []
    n = int((lat_max - lat_min) / lat_step + 1e-9)  # floor; never exceed lat_max
    # Skip the degenerate near-tangent point where |x| -> 1 (h0 -> 0 or 180): the
    # body grazes the horizon at the meridian, acos' is singular there, and
    # cross-platform libm rounding would swing the longitude by ~mas. Trimming it
    # costs <0.003 deg of line length and makes the track deterministic.
    edge = 1.0 - 1e-9
    for i in range(n + 1):
        phi = lat_min + i * lat_step
        x = -math.tan(phi * DEG) * td
        if -edge <= x <= edge:
            h0 = math.acos(x) / DEG   # hour-angle half-width, degrees
            asc.append([_map_lon(ra - h0 - gast_deg), phi])  # eastern horizon
            dsc.append([_map_lon(ra + h0 - gast_deg), phi])  # western horizon
    return {"mc": mc, "ic": ic, "asc": asc, "dsc": dsc}


def astrocartography(engine, jd_ut, bodies, lat_min=-85.0, lat_max=85.0,
                     lat_step=1.0):
    """Angle lines for each body at jd_ut: {body: {mc, ic, asc, dsc}}."""
    g = gast(jd_ut) / DEG  # Greenwich apparent sidereal time, degrees
    out = {}
    for b in bodies:
        p = engine.position(b, jd_ut)
        out[b] = planet_lines(p["ra"], p["dec"], g, lat_min, lat_max, lat_step)
    return out
