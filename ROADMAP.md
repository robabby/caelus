# Roadmap

The durable plan for Caelus. Status and near-term direction live here so the
project isn't steered from memory. Tracked work is in GitHub Issues; this
file is the map those issues hang off.

## What we're building

A clean-room astrological ephemeris engine: planetary/lunar positions,
houses, aspects, and astronomical events, written from published sources
(VSOP87, ELP/DE, IAU models, JPL Horizons fits): MIT-licensed, zero runtime
dependencies, no Swiss Ephemeris code, and a core that does no I/O so the
same code runs in the browser, on edge runtimes, and in Node/MCP.

The deliverables are the engine and the tools around it: `caelus` (engine),
`caelus-mcp` (MCP server), `caelus-birth`, `caelus-wheel`, and the
`ephemengine.com` site (playground, validation, provenance).

## Principles (what holds across releases)

- **Validated, not asserted.** Swiss Ephemeris is the calibration oracle and
  JPL Horizons the independent reference; a golden conformance suite pins the
  TypeScript engine to the Python reference, and CI keeps it green. Accuracy
  is stated per body (`accuracy.json`), never as a blanket figure.
- **Clean-room and license-clean.** Written from published math; MIT; no
  AGPL, no bundled ephemeris files.
- **Data as versioned artifacts.** Coefficient packs are reproducible build
  outputs of the Python pipeline, shipped as JSON with documented provenance.
- **Reference-first.** New capability lands in the Python reference with
  golden fixtures, then ports to TypeScript against those fixtures.

## Status

Shipped through **0.5.0** (npm: all four packages; GitHub releases
v0.1.0–v0.5.0): full body set, 12 house systems, tropical + 8 sidereal
ayanamsas, aspects, event search (rise/set, crossings, phases, stations,
Gauquelin), solar/lunar eclipses, fixed stars, topocentric, Vondrák 2011
precession; 3,218-check conformance suite; MCP server (stdio) with golden
payloads; JPL-direct validation tier.

**In progress (on `dev`, unreleased):** the `when()` query engine:
declarative time queries over celestial predicates (Python reference + TS
port, suite-pinned).

## Planned

### Engine breadth
- **Query engine `when()`**: finish shipping (promote, cut release).
- **Derived charts**: returns, secondary progressions, solar arc, composite
  and Davison charts, harmonics, antiscia, declination aspects (parallels),
  out-of-bounds, dignities/sect. Thin layers on existing primitives;
  reference + goldens per feature.
- **Turbo tier**: Chebyshev packs fit to the engine's own output for fast
  bulk evaluation (century-scale scans).

### Distribution & packaging
- **`caelus-starter`**: create the standalone public repo from
  `templates/starter/`.
- **PyPI**: publish the Python reference as `caelus-engine`.
- **MCP Streamable HTTP**: mount the server at `ephemengine.com/api/mcp`
  (stdio already ships).
- **MCP resources/prompts**: `caelus://glossary`, `caelus://accuracy`.

### Validation & docs
- **Methods write-up**: the empirical-recovery notes (what the engine
  reproduces and how it was checked).
- **Community health**: `CONTRIBUTING.md` (suite-is-the-contract),
  `CODE_OF_CONDUCT.md`, `SECURITY.md`.

## Out of scope for this repo

This repository is the open engine and its tooling only. Product/business
planning, monetization, and any consumer-application or knowledge-base work
are tracked privately, elsewhere; they do not belong in a public engine
repo.
