# Roadmap

The durable plan for Caelus. Status and near-term direction live here so the
project isn't steered from memory. Tracked work is in GitHub Issues; this
file is the map those issues hang off.

## What we're building

A clean-room TypeScript suite for validated astrology computation: planetary
and lunar positions, charts, houses, aspects, events, hellenistic timing
techniques, Vedic methods, and citable chart facts. The astronomical core is
written from published sources (VSOP87, ELP/DE, IAU models, JPL Horizons
fits): MIT-licensed, zero runtime dependencies, no Swiss Ephemeris code, and a
core that does no I/O so the same code runs in the browser, on edge runtimes,
and in Node/MCP.

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
stateless) exposing twenty-nine chart tools, with golden payloads, resources
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
invisible to the conformance suite). Shipped in the `caelus-mcp` 0.13.0 release.

### Phase 1 — Hellenistic time-lords (done)

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

### Phase 2 — Vedic / Jyotish layer (done)

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
starting-yogini invariants). **Ashtottari dasha — done** (the irregular
nakshatra→lord groups and across-span balance from the JHora/PVR convention;
`ashtottariDashas`/`ashtottariActive`/`ashtottariAt`, `ashtottari-golden` pin —
see the deferred-work bucket below). **Yogas — done** (the placement set: five
Pancha Mahapurusha, Gajakesari, Budha-Aditya, Chandra-Mangala; `detectYogas`/
`yogasAt`, `yogas-golden` pin + defining-rule oracle — plus the variant Kemadruma
and the lordship-based raja/dhana yogas and yogakarakas, all resolved in the
deferred-work bucket below). All of Phase 2 is now surfaced over MCP as the
0.14.0 harvest — the `nakshatras`, `dasha` (Vimshottari/Yogini/Ashtottari),
`vargas`, and `yogas` tools, with `directions` gaining the inter-planetary
(mundane) block — each with `verify_tools` engine-oracle checks and a frozen
`golden-mcp` payload. All deterministic arithmetic over the SE-pinned sidereal
longitudes; validated against established Jyotish references and published charts
as golden fixtures, with ayanamsa/convention variants stated explicitly.

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
- **Inter-planetary primary directions — done**: the Placidus semi-arc mundane
  direction between planets (`mundaneDirectionArc`/`mundaneDirections`),
  validated by reducing to the already-validated angle directions (self -> 0,
  significator-on-MC -> the to-MC arc); a software-oracle (Morinus/Solar Fire)
  cross-check remains a recommended local run.

Bucket B — genuinely variant (adopt a documented, parameterized, oracle-pinned
default):

- **Ashtottari dasha — done**: the irregular nakshatra→lord groups and the
  across-span balance reproduced from the JHora/PVR convention (`ashtottariDashas`/
  `ashtottariActive`/`ashtottariAt`), `ashtottari-golden` pin + cited checks; the
  BPHS Ardra-start remains a possible `variant`.
- **Kemadruma yoga — done**: the core rule (no graha in the 2nd/12th from, or
  with, the Moon) as `kemadruma`/`kemadrumaAt`, with the planet set parameterized
  (`includeSun`/`includeNodes`, default the five tara grahas) and cited checks;
  kemadruma-bhanga (cancellation) remains a possible later flag.
- **Lordship-based raja/dhana yogas — done**: the foundation layer (house
  lordship, graha drishti, association primitives) plus `rajaYogas`/`dhanaYogas`/
  `yogakarakas` and their `*At` wrappers; `rajayoga-golden` pin + drishti/
  yogakaraka/raja oracles, cited in `validate_jyotish`. The foundation unlocks a
  class of future yogas.

Order: (1) `validate_jyotish` tier; (2) trimsamsa + hora + kemadruma; (3)
Ashtottari; (4) lordship + drishti layer → raja/dhana yogas; (5) inter-planetary
directions. Each lands reference-first with a golden, and each convention choice
is stated and cited.

### Phase 3 — Chat MCP App (in progress)

An Apps SDK MCP App on the existing hosted server: a correct chart with a
rendered `caelus-wheel` SVG in-host, interpretation-free, reusing the shipped
`server.json`/Registry work. Built once on the MCP App standard, it runs across
ChatGPT, Claude, and other MCP-Apps hosts. Distribution rather than capability;
it grows richer as Phases 0–2 add tools. Guarded by the live-smoke pattern
extended to the app endpoint.

**UI surface — done**: `apps/web/app/embed/chart`, a chrome-free route rendering
`ChartWheel` from the `natal_chart`/`current_sky` payload (Apps-SDK
`window.openai.toolOutput`, `?c=` fallback), self-contained so it can move in
parallel with the MCP server. Next: the server-side UI-resource wiring (the
tool-result `_meta`/`ui://` reference, in the MCP layer) and the Apps-SDK
manifest / host registration. See `docs/mcp-app.md`.

### Phase 4 — Symbolic computation layer, agent-native (done)

All shipped reference-first, interpretation-free, golden-pinned, and surfaced in
the cookbook and over MCP: **named pattern detection** (`detectPatterns`,
`patterns-golden`, `aspect_patterns` tool), the **computed chart signature**
(`chartSignature`, `signature-golden`, `chart_signature` tool), and **weighted
essential-dignity scoring** (`dignityScore`/`almuten`, Lilly weights, Egyptian
terms, Dorothean triplicities, Chaldean faces, `dignity-golden`, enriching the
`dignities` tool). The agent cookbook (`/docs/cookbook`) covers the everyday
tasks. The thin transit wrappers stayed as cookbook recipes over `stations`/
`crossings` rather than new functions.

Direction set after evaluating an external vision doc (Grok, 2026-06-14) against
the actual surface. Most of that doc's "critical/missing" Phase 1–2 already
ships — house placement (`chart.bodies[b].house`), per-body `dignities`, a
forgiving house-system API (`normalizeHouseSystem`), 23 MCP tools, and the full
transit/event and synastry/composite/Davison/harmonic set — so the genuinely
additive, engine-shaped work is narrower than the doc implies. The decision
criterion is unchanged and decides every item below: **add computation that can
be validated against a named authority; never add interpretation.** Meaning,
correspondence (astrology↔tarot↔archetype), and product integrations live one
layer up, in the products (e.g. `mymagus`), not in the MIT core.

Agreed, in priority order:

- **Named aspect-pattern detection (flagship).** A `detectPatterns(chart)` that
  enumerates the classical configurations — T-square, grand trine, grand cross,
  yod, kite, mystic rectangle, and stelliums by sign and by house — as
  first-class objects (`{ kind, bodies, orb, ... }`). Distinct from the existing
  `configurationFit`/`searchConfigurations`, which are a fuzzy *similarity*
  substrate (cosine over a feature vector), not an enumerator. Pure geometry over
  the chart's aspects and longitudes: interpretation-free, reference-first,
  golden-pinned, surfaced as an MCP tool and a docs page. Orb policy explicit and
  configurable.

- **Computed chart-signature object.** A `chartSignature(chart)` consolidating
  element / modality / quadrant / angularity distributions and the dominant
  planet and sign, built from the existing `element`/`modality`/`quadrant`/
  `house`/`dignities` helpers and the pattern set above. Counts and weights only —
  no "flavor tags" or interpretive labels. The dominance *weighting* is itself a
  contested convention, so it is stated explicitly and cited, not invented;
  alternate weightings are a `variant`.

- **Essential-dignity scoring (dedicated, citation-pinned pass).** Extend the
  qualitative `dignities()` (domicile/exaltation/detriment/fall) to the full
  weighted Ptolemaic table — triplicity, term, face, weighted total, almuten,
  peregrine. Contested-convention turf (Egyptian vs Ptolemaic terms; Dorothean
  triplicity rulers), so it follows the deferred-work discipline: pin to a named
  authority (Lilly/Ptolemy), make the table selectable, golden-test against a
  cited source. Held as its own pass, not bundled.

- **Agent docs + task cookbook (cheap parallel win).** A "For Agents / MCP" page
  and a "Common Tasks" cookbook ("house placement", "next Mars ingress",
  "essential dignities", "detect a T-square"). No engine change; closes a real
  documentation gap and can land immediately, independent of the items above.

- **Thin transit convenience wrappers (minor).** Named ergonomics over the
  existing primitives — `nextIngress`, `nextStation`,
  `significantTransitsForChart`, `transitsInWindow` — for agent temporal
  reasoning. Low cost, low risk.

Explicitly out of scope for the engine (recorded so they aren't re-proposed):
interpretive "flavor tags" and metadata; symbolic-correspondence / tarot /
archetypal layers; "hybrid divinatory systems"; product integrations
(`tarotbook`, `Memorativa`, mystery-school content); and the vague "living chart
/ 4D / perceptual" direction. (Configuration similarity search — "find when the
sky resembled this" — is *not* parked: the substrate is already built and
validated, so it is promoted to an MCP surface in Phase 4b below. Only freeform
rarity-mining-as-research stays out of core.)

Order and dependency: ship the cookbook docs immediately; build pattern
detection as the flagship engine addition (reference-first → golden → MCP tool →
docs); then the signature object (depends on the pattern set); hold dignity
scoring for its own citation-pinned pass; wrappers anytime. Note: pattern
detection and the signature object read `chart.bodies`, whose `ChartBodies` type
is mid-revision (sparse-body honesty: a packed body such as Chiron can be absent
for historical dates) — start them only once that change has landed, to avoid
editing `chart.ts` concurrently.

### Phase 4b — Agent-native MCP surface (done)

All shipped: **`similar_skies`** ("when did the sky look like this?", over the
existing feature space), **`electional_search`** (rank a window by wanted
body-to-body aspects, optional void-Moon penalty), **`cosmic_weather`** (the
mundane sky: active configurations, stationing planets, void Moon), and
**parans** (`parans`, co-angular bodies, reference-first + `parans-golden` + a
cookbook recipe). The MCP server is now at twenty-nine tools (the interpretation
`chart_facts` projection lands the latest); transit density remains a possible
later count.

Direction refined after a second external pass (Grok, 2026-06-14). Its strongest
insight: two powerful, already-built, suite-pinned engine capabilities have no
MCP surface, so the cheapest, most differentiating agent-native move is not new
engine math but *exposing the validated math we already have*. The boundary line
from Phase 4 still holds (computation, never interpretation; meaning and
correspondence live in the products).

- **`similar_skies` MCP tool (configuration search).** A thin wrapper over the
  existing feature space — `chartFeatures`, `cosineSimilarity`,
  `configurationFit`, `searchConfigurations` — answering "find when the sky most
  resembled this chart / configuration" over a date range. The engine math is
  built and golden-pinned; only the tool surface and docs are new. The novel
  agent capability ("when did the sky last look like this?") for near-zero cost.

- **`electional_search` MCP tool.** A thin wrapper over `scan`/`rankMoments` and
  the electional primitives (`aspectBetween`, `planetaryHour`, `voidOfCourse`,
  angularity) — "find the next good window for X" over a range. Substrate done;
  tool surface and docs new.

- **`cosmic_weather` MCP tool.** A day's active configurations plus ingresses and
  stations. A thin layer over Phase 4's pattern detection (#1), so it follows
  that item.

- **Fixed-star parans (paranatellonta).** The one genuinely new engine feature
  here: stars and planets sharing an angle (rising/culminating/setting together)
  at a place and time. Pure positional astronomy, citeable to a named authority,
  reference-first + golden — fully aligned with the core's discipline.

- **Transit density as a transparent count (minor).** Number of exact aspect
  hits / ingresses / stations in a window — a count, never a subjective
  "intensity" score (that would drift into interpretation).

Order: `similar_skies` + `electional_search` first (wrappers over validated
math); `cosmic_weather` after pattern detection (#1); parans as its own
reference-first engine feature; density count anytime. All of the MCP tools touch
`server.ts`, which is in the in-flight sparse-body type cascade, so they queue
behind that landing. The cookbook docs (Phase 4 #4) are clear of every frozen
file and lead.
