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
`ephemengine.com` site (landing, playground, docs, validation, provenance).

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

Shipped through **0.8.0** (npm: all four packages; PyPI: `caelus-engine`,
the Python reference; GitHub releases v0.1.0–v0.8.0): full body set, 12 house
systems, tropical + 8 sidereal
ayanamsas, aspects, event search (rise/set, crossings, phases, stations,
Gauquelin), solar/lunar eclipses, fixed stars, topocentric, Vondrák 2011
precession; the `when()` query engine (declarative time queries over celestial
predicates, Python reference + TS port, suite-pinned); derived charts (returns,
secondary progressions, solar arc, composite and Davison, harmonics, antiscia,
declination aspects/parallels, out-of-bounds, dignities, sect); the turbo tier
(`Turbo`: segmented Chebyshev longitude packs fit to the engine for bulk
scans); conformance suite; MCP server (stdio) with golden payloads, resources
(`caelus://glossary`, `caelus://accuracy`), and the `rectification_session`
prompt; JPL-direct validation tier.

The `ephemengine.com` site ships its full shape: landing page, browser
playground, validation and provenance tables, build notes, a methods page
(how the engine is built and how each result is checked), a docs hub with
guides, a generated TypeScript API reference, a changelog page, persistent
header and footer, and SEO (sitemap, OpenGraph).

## Planned

### Distribution & packaging
- **MCP Streamable HTTP**: mount the server at `ephemengine.com/api/mcp`
  (stdio already ships).
- **Site links**: add MCP Streamable HTTP to the nav and footer when it ships
  (npm, PyPI, and `caelus-starter` are already linked in the footer).
