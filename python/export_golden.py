#!/usr/bin/env python3
"""Regenerate packages/caelus/test/golden.json from the Python engine.

Preserves the epoch grid from the existing fixture file so only computed
values change (e.g. after re-fitting Chiron from Horizons).
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine import BODIES, Engine
from astroengine import houses as H
from astroengine import pheno as PH
from astroengine.core import (DEG, ayanamsa, delta_t, julian_day,
                              mean_obliquity, nutation, jd_tt)

# v0.3 house systems exported per fixture row (koch is nullable: it is
# undefined where the MC degree is circumpolar)
NEW_SYSTEMS = {
    "koch": H.houses_koch,
    "regiomontanus": H.houses_regiomontanus,
    "campanus": H.houses_campanus,
    "alcabitius": H.houses_alcabitius,
    "morinus": H.houses_morinus,
    "meridian": H.houses_meridian,
    "polich_page": H.houses_polich_page,
    "vehlow": H.houses_vehlow,
}


def house_row(jd, lat, lon):
    asc, mc, armc, eps = H.angles(jd, lat, lon)
    vtx, east = H.vertex_east_point(armc, lat * DEG, eps)
    entry = {
        "jd_ut": jd, "lat": lat, "lon": lon,
        "asc": asc / DEG, "mc": mc / DEG, "armc": armc / DEG, "eps": eps / DEG,
        "vertex": vtx / DEG, "east_point": east / DEG,
        "placidus": [c / DEG for c in H.houses_placidus(armc, lat * DEG, eps)]
        if abs(lat) < 66.0 else None,
        "porphyry": [c / DEG for c in H.houses_porphyry(asc, mc)],
        "equal": [c / DEG for c in H.houses_equal(asc)],
        "whole_sign": [c / DEG for c in H.houses_whole_sign(asc)],
    }
    for name, fn in NEW_SYSTEMS.items():
        try:
            entry[name] = [c / DEG for c in fn(armc, lat * DEG, eps)]
        except ValueError:
            entry[name] = None
    return entry


def v03_sections(eng, jds):
    """Sidereal, lilith, topocentric, heliocentric, ra/dec, pheno, eot."""
    sid = []
    for jd in jds[:6]:
        row = {"jd_ut": jd, "modes": {}}
        for mode in ("lahiri", "fagan_bradley"):
            row["modes"][mode] = {
                "ayanamsa": ayanamsa(jd_tt(jd), mode),
                "sun": eng.longitude("sun", jd, zodiac=f"sidereal:{mode}"),
                "moon": eng.longitude("moon", jd, zodiac=f"sidereal:{mode}"),
            }
        sid.append(row)
    extras = []
    for jd in jds[:5]:
        p = eng.position("moon", jd, topocentric=True, observer=(27.95, -82.46, 10.0))
        extras.append({
            "jd_ut": jd,
            "lilith": eng.position("mean_lilith", jd),
            "moon_topo_lon": p["lon"],
            "mars_helio": eng.heliocentric("mars", jd),
            "venus": eng.position("venus", jd),
            "pheno_mars": PH.pheno(eng, "mars", jd),
            "pheno_moon": PH.pheno(eng, "moon", jd),
            "eot_min": PH.equation_of_time(eng, jd),
        })
    return sid, extras

ROOT = os.path.join(os.path.dirname(__file__), "..")
GOLDEN_IN = os.path.join(ROOT, "packages", "caelus", "test", "golden.json")
GOLDEN_OUT = GOLDEN_IN


def regen_from_template(old):
    eng = Engine("embedded")  # moon_tier full via moon_cheb.full.json in data/

    out = {
        "meta": old["meta"],
        "delta_t": [
            {"jd": row["jd"], "dt": delta_t(row["jd"])}
            for row in old["delta_t"]
        ],
        "nutation": [],
        "longitudes": [],
        "positions": [],
        "houses": [],
        "chart": None,
    }

    for row in old["nutation"]:
        jde = row["jde"]
        dpsi, deps = nutation(jde)
        out["nutation"].append({
            "jde": jde,
            "dpsi": dpsi,
            "deps": deps,
            "eps0": mean_obliquity(jde),
        })

    for row in old["longitudes"]:
        jd = row["jd_ut"]
        out["longitudes"].append({
            "jd_ut": jd,
            "bodies": {b: eng.longitude(b, jd) for b in BODIES},
        })

    for row in old["positions"]:
        jd = row["jd_ut"]
        out["positions"].append({
            "jd_ut": jd,
            "bodies": {b: eng.position(b, jd) for b in BODIES},
        })

    for row in old["houses"]:
        out["houses"].append(house_row(row["jd_ut"], row["lat"], row["lon"]))

    jds = [row["jd_ut"] for row in old["longitudes"]]
    out["sidereal"], out["extras"] = v03_sections(eng, jds)
    out["events"] = events_section(eng)

    out["chart"] = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus")
    out["chart_sidereal"] = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46,
                                      "koch", zodiac="sidereal:lahiri")

    # polar Placidus fallback contract (golden.test.ts checks both fields)
    cp = eng.chart(1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus")
    out["chart_polar"] = {
        "house_system": cp["house_system"],
        "house_system_requested": cp["house_system_requested"],
    }
    return out


def create_fresh():
    """Build golden.json from scratch (seed=42, same counts as v0.1 fixture)."""
    random.seed(42)
    eng = Engine("embedded")
    jd0, jd1 = julian_day(1900, 1, 1), julian_day(2099, 12, 31)

    out = {
        "meta": {"vsop_level": "embedded", "moon_tier": "full"},
        "delta_t": [
            {"jd": random.uniform(jd0, jd1), "dt": 0.0}
            for _ in range(7)
        ],
        "nutation": [],
        "longitudes": [],
        "positions": [],
        "houses": [],
        "chart": None,
    }
    for row in out["delta_t"]:
        row["dt"] = delta_t(row["jd"])

    for _ in range(8):
        jde = jd_tt(random.uniform(jd0, jd1))
        dpsi, deps = nutation(jde)
        out["nutation"].append({
            "jde": jde,
            "dpsi": dpsi,
            "deps": deps,
            "eps0": mean_obliquity(jde),
        })

    for _ in range(40):
        jd = random.uniform(jd0, jd1)
        out["longitudes"].append({
            "jd_ut": jd,
            "bodies": {b: eng.longitude(b, jd) for b in BODIES},
        })

    for _ in range(6):
        jd = random.uniform(jd0, jd1)
        out["positions"].append({
            "jd_ut": jd,
            "bodies": {b: eng.position(b, jd) for b in BODIES},
        })

    locs = [(27.94, -82.46), (40.71, -74.0), (51.5, -0.12), (-33.87, 151.21),
            (35.68, 139.69), (64.1, -21.9)]
    for _ in range(12):
        jd = random.uniform(jd0, jd1)
        lat, lon = random.choice(locs)
        asc, mc, armc, eps = H.angles(jd, lat, lon)
        out["houses"].append({
            "jd_ut": jd,
            "lat": lat,
            "lon": lon,
            "asc": asc / DEG,
            "mc": mc / DEG,
            "armc": armc / DEG,
            "eps": eps / DEG,
            "placidus": [c / DEG for c in H.houses_placidus(armc, lat * DEG, eps)]
            if abs(lat) < 66.0
            else None,
            "porphyry": [c / DEG for c in H.houses_porphyry(asc, mc)],
            "equal": [c / DEG for c in H.houses_equal(asc)],
            "whole_sign": [c / DEG for c in H.houses_whole_sign(asc)],
        })

    out["chart"] = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus")

    # polar Placidus fallback contract (golden.test.ts checks both fields)
    cp = eng.chart(1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus")
    out["chart_polar"] = {
        "house_system": cp["house_system"],
        "house_system_requested": cp["house_system_requested"],
    }
    return out


def events_section(eng):
    """v0.4 fixtures: rise/set/transit, crossings, phases, stations,
    osculating lilith. Polar June sun has no set (midnight sun): the None
    is part of the contract."""
    from astroengine import events as EV
    jd0 = julian_day(1990, 6, 10)
    return {
        "jd0": jd0,
        "sun_rise_tampa": EV.rise_set(eng, "sun", jd0, 27.95, -82.46, kind="rise"),
        "moon_set_london": EV.rise_set(eng, "moon", jd0, 51.5, -0.12, kind="set"),
        "mars_mtransit_sydney": EV.rise_set(eng, "mars", jd0, -33.87, 151.21, kind="mtransit"),
        "sun_set_svalbard_june": EV.rise_set(eng, "sun", jd0, 78.2, 15.6, kind="set"),
        "sun_cross_0": EV.crossings(eng, "sun", 0.0, jd0, jd0 + 400),
        "moon_cross_123": EV.crossings(eng, "moon", 123.45, jd0, jd0 + 30),
        "phases_30d": EV.lunar_phases(eng, jd0, jd0 + 30),
        "mercury_stations_200d": EV.stations(eng, "mercury", jd0, jd0 + 200),
        "true_lilith": eng.position("true_lilith", jd0),
    }


def main():
    if os.path.exists(GOLDEN_IN):
        with open(GOLDEN_IN) as f:
            old = json.load(f)
        out = regen_from_template(old)
        mode = "template"
    else:
        out = create_fresh()
        mode = "fresh"

    with open(GOLDEN_OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {GOLDEN_OUT} ({mode})")


if __name__ == "__main__":
    main()
