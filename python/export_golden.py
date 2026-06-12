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
from astroengine.core import DEG, delta_t, julian_day, mean_obliquity, nutation, jd_tt

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
        jd, lat, lon = row["jd_ut"], row["lat"], row["lon"]
        asc, mc, armc, eps = H.angles(jd, lat, lon)
        entry = {
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
        }
        out["houses"].append(entry)

    g = old["chart"]
    c = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus")
    out["chart"] = {
        "jd_ut": c["jd_ut"],
        "bodies": c["bodies"],
        "angles": c["angles"],
        "cusps": c["cusps"],
        "aspects": c["aspects"],
    }
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

    c = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus")
    out["chart"] = {
        "jd_ut": c["jd_ut"],
        "bodies": c["bodies"],
        "angles": c["angles"],
        "cusps": c["cusps"],
        "aspects": c["aspects"],
    }
    cp = eng.chart(1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus")
    out["chart_polar"] = {
        "house_system": cp["house_system"],
        "house_system_requested": cp["house_system_requested"],
    }
    return out


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
