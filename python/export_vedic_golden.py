#!/usr/bin/env python3
"""Cross-language golden for astroengine.vedic (nakshatras + Vimshottari dasha).

Runs a fixed set of Vedic specs through the Python reference and records the
results. packages/caelus/test/vedic-golden.test.ts replays the same specs
through the TS port and must reproduce them. Embedded tier.

Usage: python3 export_vedic_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine.core import julian_day
from astroengine import vedic as V

NATAL = [1990, 6, 10, 14, 30]
TAMPA = (27.95, -82.46)
MOON_LON = 45.0   # sidereal: Rohini, pada 2, lord Moon


def jd(date):
    return julian_day(*date)


def build_cases():
    return [
        # nakshatra: boundaries, padas, lord cycle
        {"id": "nak-0", "type": "nakshatra", "lon": 0.0},
        {"id": "nak-bharani", "type": "nakshatra", "lon": 13.3334},
        {"id": "nak-pada4", "type": "nakshatra", "lon": 10.5},
        {"id": "nak-mid", "type": "nakshatra", "lon": 200.0},
        {"id": "nak-end", "type": "nakshatra", "lon": 359.99},
        # nakshatra of the natal Moon (sidereal lahiri)
        {"id": "nak-moon-tampa", "type": "nakshatra_at", "natal": NATAL},
        # Vimshottari timeline from a fixed sidereal Moon
        {"id": "vim-dashas", "type": "dashas", "moon_lon": MOON_LON, "natal": NATAL},
        # active maha/antar/pratyantar at several ages
        {"id": "vim-active-5y", "type": "active", "moon_lon": MOON_LON,
         "natal": NATAL, "target": [1995, 6, 10, 0, 0]},
        {"id": "vim-active-40y", "type": "active", "moon_lon": MOON_LON,
         "natal": NATAL, "target": [2030, 1, 1, 0, 0]},
        # engine path: dasha from the natal Moon's nakshatra
        {"id": "vim-at-tampa", "type": "at", "natal": NATAL,
         "target": [2025, 6, 10, 0, 0]},
    ]


def compute(spec, eng):
    t = spec["type"]
    if t == "nakshatra":
        return V.nakshatra(spec["lon"])
    if t == "nakshatra_at":
        return V.nakshatra_at(eng, jd(spec["natal"]))
    if t == "dashas":
        return V.vimshottari_dashas(spec["moon_lon"], jd(spec["natal"]), levels=2)
    if t == "active":
        return V.vimshottari_active(spec["moon_lon"], jd(spec["natal"]), jd(spec["target"]))
    if t == "at":
        return V.vimshottari_at(eng, jd(spec["natal"]), jd(spec["target"]))
    raise ValueError(spec["type"])


def main():
    eng = Engine("embedded")
    out = {"basis": "Python reference astroengine.vedic (embedded VSOP, full moon); "
                    "Lahiri ayanamsa, 365.25-day dasha year",
           "cases": []}
    for c in build_cases():
        out["cases"].append({"id": c["id"], "spec": c, "result": compute(c, eng)})
        print(f'{c["id"]:18s} ok')
    path = os.path.join(os.path.dirname(__file__), "..", "packages", "caelus",
                        "test", "vedic-golden.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("->", path)


if __name__ == "__main__":
    main()
