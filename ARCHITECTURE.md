# Architecture

Caelus is a clean-room astrological ephemeris engine: planetary and lunar
positions, houses, aspects, and astronomical events, written from published
sources (VSOP87, ELP/DE, IAU models) rather than ported from licensed code.
It is MIT-licensed, has zero runtime dependencies, and its core performs no
I/O. This document describes how the system is built; it is not a roadmap or
a product plan.

## Repository layout

```
packages/caelus        TypeScript engine (MIT). Zero deps, no I/O in core.
packages/caelus-mcp     Model Context Protocol server over the engine.
packages/birth          Birth time + place -> UT (timezone lookup).
packages/wheel          React SVG chart-wheel renderer.
apps/web                Next.js site (landing, playground, docs + API reference, validation, provenance, changelog).
python/                 Reference implementation + data-fitting pipeline.
```

The four packages publish independently to npm; `python/` is a development
tool and is not a runtime dependency of anything.

## The engine

The core is a set of pure functions and a thin `Engine` class. It is given
its ephemeris data explicitly (an injected `EngineData` value) and never
reads the filesystem or network, which is what lets the same code run in a
browser bundle, on an edge runtime, and in Node.

Modules (`packages/caelus/src/`):

- `core`: timescales (ΔT, UT↔TT), VSOP87D evaluation, IAU 1980 nutation,
  Vondrák 2011 long-term precession, frame rotations, the apparent-place
  pipeline (light-time, aberration, precession, nutation), and the lunar,
  Pluto, and small-body position routines.
- `chart`: the `Engine` API: apparent longitudes, the body set, aspects,
  tropical/sidereal zodiacs and ayanamsas, topocentric placement.
- `houses`: twelve house systems plus ascendant/MC and related angles.
- `events`: bracket-and-bisect search over the position functions:
  rise/set, meridian transits, zodiac crossings, lunar phases, stations,
  Gauquelin sectors.
- `query`: `when()`: declarative time queries (aspect / sign / retrograde
  predicates combined with and/or/not), solved on the `events` root-finder.
- `eclipses`: solar and lunar eclipse search.
- `stars`: fixed-star catalog and apparent places.
- `pheno`: phase, elongation, equation of time, and related phenomena.
- `node-loader` / `data-embedded`: two ways to supply `EngineData`: read
  JSON from disk (Node) or import a bundled subset (browser/edge).

## Data packs

Positions come from coefficient files, shipped as versioned JSON build
outputs with documented provenance, so engine code and data evolve
independently:

- **VSOP87D** for the eight planets, in four truncation tiers
  (`micro`, `embedded`, `high`, `full`) trading size for accuracy.
- **Nutation** (IAU 1980 series).
- **Moon**: an abridged ELP series (`moon_meeus47`) for the compact tier,
  and a DE-derived Chebyshev pack (`moon_cheb`) for the precise tier.
- **Pluto**: a dedicated Meeus series valid over its fitted span.
- **Chiron and the asteroids** (Ceres, Pallas, Juno, Vesta, Pholus):
  Chebyshev packs fit to JPL Horizons vectors.
- **Uranian points**: a Kepler-element pack.
- **Fixed stars**: a named-star catalog.

The npm package ships only the compact tiers (the embedded VSOP set and the
embedded Moon pack); the larger tiers live in the repository.

## Three runtimes, one codebase

Because the core takes injected data and does no I/O, identical code serves:

1. **Browser**: `caelus/data-embedded` bundles a compact dataset; charts
   compute client-side.
2. **Edge**: the same import runs on serverless edge runtimes with no
   filesystem and no ephemeris files to deploy.
3. **Node / MCP**: `node-loader` reads the JSON packs from disk; the MCP
   server exposes the engine over stdio or HTTP.

## Validation

Correctness is enforced by a chain of checks rather than asserted:

- **Swiss Ephemeris is the external oracle.** The Python reference
  (`python/astroengine/`) is compared against Swiss Ephemeris
  (`validate_swiss.py`) to calibrate the models.
- **JPL Horizons is the independent reference.** Small-body data is fit
  from Horizons vectors, and `validate_horizons.py` compares the engine
  directly against JPL apparent positions.
- **Named Jyotish authorities pin the Vedic conventions.** The Vedic
  techniques (nakshatras, dashas, vargas, yogas) are deterministic, but several
  have named convention variants. `validate_jyotish.py` replays a committed,
  per-check-cited reference set (`jyotish-reference.json`, sourced from BPHS and
  PyJHora/PVR Rao) so each convention choice is validated against a named
  authority, not asserted — the same discipline as the position oracles, run
  with no external tool to keep the engine swisseph-free.
- **Golden fixtures pin the TypeScript port to the Python reference.**
  `test/golden.json` (the 3,218-check conformance suite) and
  `test/query-golden.json` are generated from Python and replayed by the TS
  tests; both engines run
  the same algorithms in IEEE doubles, so any porting error shows up as a
  large deviation. The MCP layer has its own golden payloads.
- **CI runs the whole chain** (`.github/workflows/ci.yml`) on every push,
  so accuracy regressions cannot merge silently.

Per-body accuracy figures live in `packages/caelus/accuracy.json` and
`packages/caelus/horizons-accuracy.json`, not here.

## Data pipeline

The data packs and fixtures are reproducible build outputs of the Python
tooling:

- `fit_chiron.py`, `fit_smallbody.py`, `fit_uranian.py`:
  fetch reference vectors (Horizons) and fit Chebyshev / element packs.
- `chebyshev.py`: the segmented Chebyshev fit/evaluate routines.
- `export_golden.py`, `export_query_golden.py`: regenerate the golden
  fixtures from the reference engine.

These run locally and write into the `data/` and `test/` directories; the
committed artifacts are the result.
