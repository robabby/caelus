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

Shipped through **0.12.0** (npm: all four packages; PyPI: `caelus-engine`,
the Python reference; GitHub releases v0.1.0–v0.12.1): full body set, 12 house
systems, tropical + 7 sidereal
ayanamsas, aspects, event search (rise/set, crossings, phases, stations,
Gauquelin), solar/lunar eclipses, fixed stars, topocentric, Vondrák 2011
precession; the `when()` query engine (declarative time queries over celestial
predicates, Python reference + TS port, suite-pinned); derived charts (returns,
secondary progressions, solar arc, composite and Davison, harmonics, antiscia,
declination aspects/parallels, out-of-bounds, dignities, sect); the turbo tier
(`Turbo`: segmented Chebyshev longitude packs fit to the engine for bulk
scans); electional primitives (`aspectBetween`, `solarPhase`, `planetaryHour`,
`voidOfCourse`, angularity) with a `scan`/`rankMoments` search layer (0.9.0);
3D spherical geometry (`angularSeparation3d`), astrocartography, and a graphic
ephemeris, each landing engine math plus an SSR-safe render in `caelus-wheel`
(`ChartSphere`, `AstroMap`, `EphemerisGraph`) (0.10.0); a chart feature space
(`chartFeatures`, `cosineSimilarity`, `configurationFit`, `searchConfigurations`)
and a geometric compiler that inverts constraints to a chart form and flags
impossible ones (`compileForm`) (0.11.0); a JD-first chart entry point that
builds a full chart directly from a Julian Day, no calendar round-trip
(`chartAt`) (0.12.0); conformance suite;
MCP server over stdio and hosted Streamable HTTP (`ephemengine.com/api/mcp`,
stateless) exposing thirteen chart tools, with golden payloads, resources
(`caelus://glossary`, `caelus://accuracy`), and the `rectification_session`
prompt, listed on the official MCP Registry as `io.github.heavyblotto/caelus-mcp`
(0.12.1); JPL-direct validation tier.

The `ephemengine.com` site ships its full shape: landing page, browser
playground, validation and provenance tables, build notes, a methods page
(how the engine is built and how each result is checked), a docs hub with
guides, a generated TypeScript API reference, a changelog page, persistent
header and footer, and SEO (sitemap, OpenGraph).

## Planned

Distribution is complete: the four npm packages, the `caelus-engine` PyPI
package, and the MCP server (stdio plus the hosted Streamable HTTP endpoint,
listed on the official MCP Registry) are all live and linked. The next tranche
extends technique coverage and reach. Each phase ships value independently and
follows the reference-first rule: the capability lands in the Python reference
with golden fixtures, then ports to TypeScript pinned to them, then surfaces in
the MCP server and the site. All of it stays interpretation-free; meaning is
out of scope for the engine. Tracked work hangs off GitHub Issues.

### Phase 0 — MCP tool harvest (done)

Surfaced engine capabilities that were already built and suite-pinned but not
yet exposed over MCP, as four tools: `returns` (solar/lunar), `progressions`
(secondary + solar arc), `composite` (midpoint + Davison), and `dignities`
(essential dignity + sect). No engine change; each gained `verify_tools`
engine-oracle checks and frozen `golden-mcp` payloads (the MCP layer is
invisible to the conformance suite). Pending a `caelus-mcp` minor release.

### Phase 1 — Hellenistic time-lords

Deterministic time-math on top of the validated positions, in dependency order:
lots/Arabic parts (sect-aware), annual profections, zodiacal releasing (L1–L4,
loosing-of-the-bond), firdaria; primary directions later. Pinned against
published canonical examples plus a cross-implementation check encoded as golden
fixtures. New engine exports, MCP tools, and a site docs page.

### Phase 2 — Vedic / Jyotish layer

The sidereal foundation (seven ayanamsas) already exists; this adds the
technique superstructure, in dependency order: nakshatras (+padas), Vimshottari
dasha (maha/antar/pratyantar), vargas (navamsa D9 first, then D10/D12/D30),
then further dashas and core yogas. All deterministic arithmetic over the
SE-pinned sidereal longitudes; validated against established Jyotish references
and published charts as golden fixtures, with ayanamsa/convention variants
stated explicitly. Multi-release.

### Phase 3 — Chat MCP App

An Apps SDK MCP App on the existing hosted server: a correct chart with a
rendered `caelus-wheel` SVG in-host, interpretation-free, reusing the shipped
`server.json`/Registry work. Built once on the MCP App standard, it runs across
ChatGPT, Claude, and other MCP-Apps hosts. Distribution rather than capability;
it grows richer as Phases 0–2 add tools. Guarded by the live-smoke pattern
extended to the app endpoint.
