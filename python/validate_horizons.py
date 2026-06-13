#!/usr/bin/env python3
"""Validate the engine directly against JPL Horizons apparent positions.

The standing validation chain terminates at Swiss Ephemeris; this script
makes the claims stand on JPL itself: it fetches geocentric APPARENT
RA/Dec (Horizons OBSERVER quantity 2, airless — light-time, aberration,
precession, and nutation applied by JPL) for the major bodies at sampled
epochs, compares engine.position()'s ra/dec, and writes
horizons-accuracy.json. Needs ssd.jpl.nasa.gov — run locally; the sample
cache (~1 MB) is committed for reproducibility.

Usage: python3 validate_horizons.py
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day, jd_tt

HERE = os.path.dirname(__file__)
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = os.path.join(HERE, "horizons_apparent_cache.json")

BODIES = {
    "sun": "10", "moon": "301", "mercury": "199", "venus": "299",
    "mars": "499", "jupiter": "599", "saturn": "699", "uranus": "799",
    "neptune": "899", "pluto": "999", "chiron": "2060", "ceres": "1;",
    "pallas": "2;", "juno": "3;", "vesta": "4;", "pholus": "5145;",
}
EPOCHS_TT = [jd_tt(julian_day(1900 + k * 8, (k * 5) % 12 + 1, 11)) for k in range(25)]


def fetch(command, jds):
    tlist = ",".join(f"'{jd:.9f}'" for jd in jds)
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "CENTER": "'500@399'",
        "QUANTITIES": "'2'", "REF_SYSTEM": "'ICRF'", "CAL_FORMAT": "'JD'",
        "ANG_FORMAT": "'DEG'", "EXTRA_PREC": "'YES'",
        "APPARENT": "'AIRLESS'", "TIME_TYPE": "'TT'", "TLIST": tlist,
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=180) as resp:
        text = resp.read().decode()
    if "$$SOE" not in text:
        raise RuntimeError(text[:1500])
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].splitlines():
        m = re.match(r"\s*(\d+\.\d+)\s+\S*\s*(\d+\.\d+)\s+(-?\d+\.\d+)", line)
        if m:
            rows.append((float(m.group(1)), float(m.group(2)), float(m.group(3))))
    return rows


def main():
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    eng = Engine("full")
    out = {"basis": "JPL Horizons apparent geocentric RA/Dec (airless), TT epochs",
           "epochs": len(EPOCHS_TT), "bodies": {}}
    for name, cmd in BODIES.items():
        if name not in cache:
            cache[name] = fetch(cmd, EPOCHS_TT)
            json.dump(cache, open(CACHE, "w"))
            time.sleep(0.2)
        worst = 0.0
        for (jd, ra_h, dec_h) in cache[name]:
            jd_ut = jd  # engine takes UT; reconstruct from TT
            # invert jd_tt approximately (dt changes slowly)
            from astroengine.core import delta_t
            jd_ut = jd - delta_t(jd) / 86400.0
            p = eng.position(name, jd_ut)
            dra = abs(((p["ra"] - ra_h + 180) % 360 - 180)) * \
                math.cos(math.radians(dec_h)) * 3600
            ddec = abs(p["dec"] - dec_h) * 3600
            worst = max(worst, math.hypot(dra, ddec))
        out["bodies"][name] = round(worst, 3)
        print(f"{name:9s} worst vs JPL {worst:8.3f}\"")
    with open(os.path.join(HERE, "..", "packages", "caelus",
                           "horizons-accuracy.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("-> packages/caelus/horizons-accuracy.json")


if __name__ == "__main__":
    main()
