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
stateless) exposing eighteen chart tools, with golden payloads, resources
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

### Phase 1 — Hellenistic time-lords (in progress)

Deterministic time-math on top of the validated positions, in dependency order:
**lots/Arabic parts (sect-aware) — done** (the seven Hermetic lots, Python
reference + `lots-golden` pin + a Fortune/Spirit symmetry invariant, and
surfaced as the `lots` MCP tool); **annual + monthly profections — done**
(`profection`/`profectionAt`, lord of the year, `profections-golden` pin + a
textbook-fact oracle); **firdaria — done** (the 75-year planetary period system,
day/night, sub-periods; `firdaria-golden` pin + total/tiling invariants);
**zodiacal releasing — done** (`zrRelease`/`zrActive`/`zrAt`, L1–L4 with loosing
of the bond, 360-day-year Valens/Schmidt convention pinned to a reference
implementation; `releasing-golden` pin + tiling, +6-jump, and
loosing-of-the-bond-threshold invariants); **primary directions to
the angles — done** (`directionArcs`/`primaryDirections`, Placidus semi-arc,
Ptolemy/Naibod keys; `directions-golden` pin + geometric invariants). Phase 1 is
complete in the engine (inter-planetary mundane directions, under the pole, are
a possible later extension). All of Phase 1 is surfaced over MCP — the `lots`,
`profections`, `firdaria`, `releasing`, and `directions` tools. Each lands as an
engine export first, then an MCP tool and a site docs page.

### Phase 2 — Vedic / Jyotish layer (in progress)

The sidereal foundation (seven ayanamsas) already exists; this adds the
technique superstructure, in dependency order: **nakshatras (+padas) — done**
and **Vimshottari dasha (maha/antar/pratyantar) — done** (`nakshatra`/
`nakshatraAt`, `vimshottariDashas`/`vimshottariActive`/`vimshottariAt`;
`vedic-golden` pin + 120-year-total and tiling invariants); **vargas — done**
(`varga`/`vargaAt`/`vargaChart` for the textbook set D1/D3/D9/D10/D12, computed
boundary-robustly from rasi+division; `vargas-golden` pin + textbook-placement
oracle — the contested hora D2 and unequal trimsamsa D30 await their conventions
being pinned); **Yogini dasha — done** (the 36-year eight-yogini cycle;
`yoginiDashas`/`yoginiActive`/`yoginiAt`, `yogini-golden` pin + total/tiling/
starting-yogini invariants). **Ashtottari dasha — deferred**: its period table
and lord order are clear, but the nakshatra-to-lord mapping has genuine textual
variants (start from Ardra vs Punarvasu, differing group sizes across texts and
implementations), so it awaits one canonical convention being pinned rather than
guessed. **Core yogas — done** (the well-defined placement set: five Pancha
Mahapurusha, Gajakesari, Budha-Aditya, Chandra-Mangala; `detectYogas`/`yogasAt`,
`yogas-golden` pin + defining-rule oracle — the variant Kemadruma and the
lordship-based raja/dhana yogas are deferred). Phase 2's core is in the engine.
All
deterministic arithmetic
over the
SE-pinned sidereal longitudes; validated against established Jyotish references
and published charts as golden fixtures, with ayanamsa/convention variants
stated explicitly. Multi-release.

### Deferred work — resolution plan

Several techniques were deliberately deferred during Phases 1–2 because the
blocker was never the math (all are deterministic) but the *convention*: more
than one named tradition exists and none could be certified canonical from
memory or contradictory web sources. The resolution is the same move the engine
already makes for positions — validate against a named oracle instead of
asserting.

**Keystone: a `validate_jyotish` tier.** Mirror `validate_swiss.py` /
`validate_horizons.py` with a tier that pins the Vedic output (vargas, dashas,
yogas) against a named reference that itself follows a published authority —
PyJHora (open source, follows PVR Narasimha Rao's *Integrated Approach*) for the
algorithm, Jagannatha Hora for worked examples. Build this first; it de-risks
every Vedic item below by turning "which convention" into "validated against a
named, reproducible, cited standard."

Bucket A — standard convention, just complex (clear wins, do early):

- **Trimsamsa (D30) — done**: the BPHS unequal-division table (odd 5/5/8/7/5 by
  Mars/Saturn/Jupiter/Mercury/Venus, even reversed) mapping to the ruler's sign;
  `varga(lon, 30)`, `vargas-golden` band oracle + cited `validate_jyotish` checks.
- **Hora (D2) — done**: the BPHS Parashari convention (odd sign first half ->
  Leo, second half -> Cancer; even reversed) as `varga(lon, 2)`, with cited
  `validate_jyotish` checks; alternate hora schemes remain a possible `variant`.
- **Inter-planetary primary directions under the pole**: Placidus semi-arc
  between planets (not just to angles); validate against a primary-directions
  oracle / published worked example.

Bucket B — genuinely variant (adopt a documented, parameterized, oracle-pinned
default):

- **Ashtottari dasha**: reproduce PyJHora's full nakshatra→lord mapping *and*
  the multi-nakshatra balance formula; ship labelled "JHora/PVR convention" with
  a `variant` hook for the BPHS Ardra-start.
- **Kemadruma yoga**: stable core rule (no planet in the 2nd/12th from, or with,
  the Moon); default to the five non-luminary, non-nodal grahas with
  `include_sun`/`include_nodes` options, and kemadruma-bhanga (cancellation) as
  an explicit flag.
- **Lordship-based raja/dhana yogas** (the large, high-leverage build): a
  foundation layer first — house lordship, **graha drishti** (all planets the
  7th; Mars 4/8, Jupiter 5/9, Saturn 3/10), and association primitives
  (conjunction / mutual aspect / parivartana) — then the named yogas pinned to
  BPHS + the oracle. The foundation unlocks a whole class of future yogas.

Order: (1) `validate_jyotish` tier; (2) trimsamsa + hora + kemadruma; (3)
Ashtottari; (4) lordship + drishti layer → raja/dhana yogas; (5) inter-planetary
directions. Each lands reference-first with a golden, and each convention choice
is stated and cited.

### Phase 3 — Chat MCP App

An Apps SDK MCP App on the existing hosted server: a correct chart with a
rendered `caelus-wheel` SVG in-host, interpretation-free, reusing the shipped
`server.json`/Registry work. Built once on the MCP App standard, it runs across
ChatGPT, Claude, and other MCP-Apps hosts. Distribution rather than capability;
it grows richer as Phases 0–2 add tools. Guarded by the live-smoke pattern
extended to the app endpoint.
