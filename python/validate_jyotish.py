#!/usr/bin/env python3
"""Validate the engine's Vedic layer against named Jyotish conventions.

The position chain terminates at Swiss Ephemeris (validate_swiss.py) and JPL
Horizons (validate_horizons.py). This tier does the same for the *conventions*
of the Vedic techniques, which carry named variants: it replays a committed set
of reference checks (jyotish-reference.json) -- each citing the authority it
follows -- and reports agreement, writing jyotish-accuracy.json.

Reference values are sourced from named authorities (BPHS; and, where a
convention has variants, PyJHora, which follows PVR Narasimha Rao's Integrated
Approach) and committed for reproducibility, like the Horizons cache, so each
convention choice is cited rather than asserted. The script runs no external
tool, keeping the engine swisseph-free; refresh the references by running the
named source offline. It grows as the deferred techniques land.

Usage: python3 validate_jyotish.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from astroengine.chart import Engine
from astroengine import vedic, yogini, vargas, yogas, ashtottari, rajayoga

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, "jyotish-reference.json")


def check(c):
    """True when the engine reproduces the reference value for one check."""
    t = c["technique"]
    if t == "nakshatra":
        got = vedic.nakshatra(c["lon"])
        return all(got[k] == v for k, v in c["expect"].items())
    if t == "vimshottari_start":
        d = vedic.vimshottari_dashas(c["moon_lon"], 0.0)
        return d["start_lord"] == c["expect"]["start_lord"]
    if t == "yogini_start":
        return yogini.YOGINIS[yogini.starting_yogini(c["nak"])] == c["expect"]
    if t == "varga":
        return vargas.varga(c["lon"], c["n"])["sign"] == c["expect"]
    if t == "yoga_present":
        present = [y["yoga"] for y in yogas.detect_yogas(c["signs"], c["asc"])]
        return c["expect"] in present
    if t == "kemadruma":
        return yogas.kemadruma(c["signs"], include_sun=c.get("include_sun", False),
                               include_nodes=c.get("include_nodes", False))["present"] == c["expect"]
    if t == "ashtottari_lord":
        return ashtottari.ashtottari_lord(c["nak"]) == c["expect"]
    if t == "drishti":
        return rajayoga.aspects_sign(c["planet"], c["ps"], c["ts"]) == c["expect"]
    if t == "yogakaraka":
        return rajayoga.yogakarakas(c["asc"]) == c["expect"]
    if t == "raja_present":
        pairs = [tuple(y["lords"]) for y in rajayoga.raja_yogas(c["signs"], c["asc"])]
        return tuple(sorted(c["pair"])) in pairs
    raise ValueError(f"unknown technique {t}")


def main():
    Engine("embedded")  # ensure the data is loadable in this environment
    ref = json.load(open(REF))
    checks = ref["checks"]
    passed = 0
    sources = set()
    for c in checks:
        ok = check(c)
        sources.add(c["source"])
        passed += ok
        print(f'{"ok  " if ok else "FAIL"} {c["technique"]:18s} {c.get("note", "")}'
              + ("" if ok else f'  <- {c["source"]}'))
    out = {"basis": "Vedic conventions vs named authorities (BPHS, PyJHora/PVR Rao)",
           "checks": len(checks), "agree": passed, "sources": sorted(sources)}
    path = os.path.join(HERE, "..", "packages", "caelus", "jyotish-accuracy.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f'\n{passed}/{len(checks)} agree; {len(sources)} cited sources')
    print("-> packages/caelus/jyotish-accuracy.json")
    sys.exit(0 if passed == len(checks) else 1)


if __name__ == "__main__":
    main()
