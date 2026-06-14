# Changelog

The four packages (`caelus`, `caelus-mcp`, `caelus-birth`, `caelus-wheel`)
version together on feature releases; metadata-only patches can ship per
package. Numbers quoted here are as measured at release time;
current figures live in `packages/caelus/accuracy.json` and on
[ephemengine.com/validation](https://www.ephemengine.com/validation).

## Unreleased

Working through the deferred-technique resolution plan (ROADMAP).

### Engine (`caelus`)

- Trimsamsa (D30) divisional chart: the BPHS unequal five-band rule (odd signs
  Mars 5 / Saturn 5 / Jupiter 8 / Mercury 7 / Venus 5 -> their odd signs; even
  signs reversed -> their even signs). `varga(lon, 30)` and `vargaChart(..., 30)`;
  `vargas-golden` pin plus a band oracle and a cited entry in the new Jyotish
  reference.
- Hora (D2) divisional chart: the BPHS Parashari convention (odd sign first half
  -> Leo / Sun's hora, second half -> Cancer / Moon's hora; even sign reversed).
  `varga(lon, 2)`; `vargas-golden` oracle + cited entries. Completes the deferred
  varga set; alternate hora schemes remain a possible later `variant`.

### Validation

- `validate_jyotish` tier (`python/validate_jyotish.py` + `jyotish-reference.json`):
  pins the Vedic technique *conventions* to named authorities (BPHS;
  PyJHora/PVR Rao for variant cases) by replaying a committed, per-check-cited
  reference set, the way positions are pinned to Swiss Ephemeris and JPL
  Horizons. Runs no external tool (stays swisseph-free); grows as deferred
  techniques land. Documented in ARCHITECTURE.md.

## 0.13.0 — 2026-06-14

A feature release across all four packages. The engine completes Phase 1 — the
Hellenistic time-lords (lots, profections, firdaria, zodiacal releasing) and
primary directions to the angles — and lays the Phase 2 Vedic layer (nakshatras,
the Vimshottari and Yogini dashas, the Parashari vargas, and the placement-based
yogas), each pinned by a cross-language golden. The MCP server grows from nine to
eighteen tools, surfacing returns, progressions, composite, dignities, and the
five Phase 1 time-lord and direction tools.

### Engine (`caelus`)

- Hellenistic lots (Arabic parts), sect-aware (Roadmap Phase 1): the seven
  Hermetic lots — Fortune, Spirit, Eros, Necessity, Courage, Victory, Nemesis —
  via `lots(engine, jdUt, lat, lonEast, zodiac)` plus the pure formula helpers
  `hermeticLots`, `lotFortune`, `lotSpirit`. Arithmetic on the validated
  longitudes; landed in the Python reference first and pinned by a new
  cross-language golden (`lots-golden`), which also checks that Fortune and
  Spirit are symmetric about the Ascendant — an invariant any correct port must
  satisfy, so a shared formula bug cannot pass through both.
- Annual and monthly profections (Roadmap Phase 1): `profection(ascSign,
  natalJd, targetJd)` and `profectionAt(engine, natalJd, targetJd, lat,
  lonEast, zodiac)`, plus `profectedSign`/`signRuler`. The Ascendant advances
  one whole sign per year; the profected sign's traditional ruler is the lord
  of the year. Python reference + `profections-golden` cross-language pin, with
  a textbook-fact oracle in the test.
- Firdaria (Roadmap Phase 1): the Persian/medieval planetary time-lord periods
  — nine periods totalling 75 years (seven planets in the firdaria order, then
  the two nodes), each planetary period split into seven sub-periods; day vs
  night start. `firdaria`, `firdariaSequence`, `firdariaActive`, `firdariaAt`.
  Python reference + `firdaria-golden` cross-language pin, with 75-year-total
  and sub-period-tiling invariants in the test.
- Zodiacal releasing / aphesis (Roadmap Phase 1, completing it): the Hellenistic
  time-lord technique from Valens, released from a Lot. `zrRelease` (the L1..Ln
  timeline), `zrActive` (the L1..L4 lords at a moment), and `zrAt` (releasing
  from the chart's Lot of Spirit or Fortune). Standard Valens/Schmidt
  convention: 360-day years, each level a twelfth of the one above, loosing of
  the bond jumping to the opposite sign. Algorithm pinned to a reference port
  and the published literature; `releasing-golden`
  cross-language pin plus invariants in the test (L1/L2 tiling, the +6 jump, and
  the ~17.58-year loosing-of-the-bond threshold across all twelve Lot signs).
- Vedic / Jyotish layer (Roadmap Phase 2): nakshatras and the Vimshottari dasha
  on the validated sidereal longitudes. `nakshatra`/`nakshatraAt` (the 27 lunar
  mansions, padas, and lords) and `vimshottariDashas`/`vimshottariActive`/
  `vimshottariAt` (the 120-year dasha sequence, mahadasha/antardasha/
  pratyantardasha, started from the Moon's nakshatra). Lahiri ayanamsa and a
  365.25-day dasha year by default. Python reference + `vedic-golden` pin, with
  120-year-total and antardasha-tiling invariants. Floor division uses
  `math.floor` in the reference so sign/nakshatra boundaries match JavaScript
  bit for bit (Python `//` buckets exact boundaries differently).
- Vargas / divisional charts (Roadmap Phase 2): the textbook Parashari set —
  D1 (rasi), D3 (drekkana), D9 (navamsa), D10 (dasamsa), D12 (dwadasamsa). The
  contested hora (D2) and unequal trimsamsa (D30) are deferred until their
  conventions are pinned. `varga` (placement of a longitude), `vargaAt` (of a
  body), and `vargaChart` (the full divisional chart). Computed from
  rasi + division (exact at the sign boundaries) over the validated sidereal longitudes;
  `vargas-golden` pin plus a textbook-placement oracle (navamsa
  Aries->Aries / Taurus->Capricorn, drekkana +4/+8, dasamsa odd/even).
- Yogini dasha (Roadmap Phase 2): the 36-year nakshatra-based cycle of eight
  yoginis (Mangala..Sankata, periods 1..8), started from the Moon's nakshatra by
  the add-3 rule, with proportional sub-periods. `yoginiDashas`/`yoginiActive`/
  `yoginiAt`. Python reference + `yogini-golden` pin, with 36-year-total,
  sub-period-tiling, and starting-yogini (Ashwini -> Bhramari) invariants.
- Vedic yogas / placement combinations (Roadmap Phase 2): the well-defined,
  placement-based combinations on the sidereal rasi chart — the five Pancha
  Mahapurusha yogas (Ruchaka, Bhadra, Hamsa, Malavya, Shasha: a non-luminary in
  its own sign or exaltation and in a kendra), Gajakesari (Jupiter in a kendra
  from the Moon), Budha-Aditya (Sun + Mercury in one sign), and Chandra-Mangala
  (Moon + Mars in one sign). `detectYogas` (pure, from a sign map) and `yogasAt`
  (from a chart), reusing the engine's `dignities` for own-sign/exaltation. The
  variant-laden yogas (Kemadruma, lordship-based raja/dhana) are deferred.
  `yogas-golden` pin plus a defining-rule oracle (in vs. off kendra,
  kendra-from-Moon, same-sign).
- Primary directions to the angles (Roadmap Phase 1, completing it):
  `directionArcs` (direct arcs of a body to MC/IC/Asc/Desc by the Placidus
  semi-arc, via the ascensional difference) and `primaryDirections` (the bodies'
  directions to the angles within a span, by the Ptolemy or Naibod time key).
  Computed on the validated equatorial coordinates and RAMC. `directions-golden`
  pin plus geometric invariants (IC = MC + 180, the ascensional-difference
  relationships, circumpolar Asc/Desc, the Naibod key ratio).

### MCP server (`caelus-mcp`)

- Four new tools surfacing engine capabilities that were already suite-pinned
  in `caelus` but not yet exposed over MCP (Roadmap Phase 0):
  - `returns` — solar/lunar return instants in a window plus the full return
    chart for the first, cast at a return location (defaults to the birthplace).
  - `progressions` — secondary progressions (day-for-a-year) and solar-arc
    directions to a target date; longitudes only, no birthplace needed.
  - `composite` — midpoint composite (bodies and angles) and the Davison chart.
  - `dignities` — essential dignity (domicile/exaltation/detriment/fall) and
    sect for the seven traditional planets at a moment and place.
- `lots` (Roadmap Phase 1): the seven Hermetic lots (Arabic parts) — Fortune,
  Spirit, Eros, Necessity, Courage, Victory, Nemesis — cast from the Ascendant
  and sect-aware, surfacing the engine's `lots()`.
- `profections` (Roadmap Phase 1): annual and monthly profections to a target
  date — age, the profected signs and their whole-sign houses, and the lord of
  the year — surfacing `profectionAt()`.
- `firdaria` (Roadmap Phase 1): the firdaria planetary time-lord periods — the
  full 75-year timeline (nine periods, seven sub-periods each) and the lords
  active at a target date — surfacing `firdaria()`/`firdariaActive()`.
- `releasing` (Roadmap Phase 1): zodiacal releasing (aphesis) from the Lot of
  Spirit or Fortune — the L1–L4 period timeline (with loosing of the bond) and
  the lords active at a target date — surfacing `zrRelease()`/`zrActive()`.
- `directions` (Roadmap Phase 1): primary directions of the seven traditional
  planets to the four angles by the Naibod or Ptolemy time key, sorted by age —
  surfacing `primaryDirections()`. Completes the Phase 1 surface over MCP.
- No engine change in this layer. Each tool gains engine-oracle checks in
  `verify_tools.mjs` (the `lots` checks include the Fortune/Spirit symmetry
  invariant; `firdaria` the 75-year-total and sub-period-tiling invariants;
  `releasing` the +6 loosing-of-the-bond and L2-tiling invariants; `directions`
  the IC = MC + 180 and time-key invariants) and frozen payloads in
  `golden-mcp.json`; the tool surface is now eighteen.

## 0.12.1 — 2026-06-14

A `caelus-mcp` metadata patch: registry listing only, no functional change.
The other three packages stay at 0.12.0.

### MCP server (`caelus-mcp`)

- Listed on the official MCP Registry as `io.github.heavyblotto/caelus-mcp`.
  Adds an `mcpName` field to `package.json` and a `server.json` describing the
  npm package (stdio) and the hosted Streamable HTTP endpoint, so the server is
  discoverable from the Registry and the directories that sync from it. The
  README gains a one-line `claude mcp add` install.

## 0.12.0 — 2026-06-14

A JD-first chart entry point. No breaking changes; the position conformance
suite is unchanged at 3,218 checks.

### Engine (`caelus`)

- `Engine.chartAt(jdUt, lat, lonEast, opts)`: build a full chart directly from
  a Julian Day (UT), with no calendar round-trip. `engine.chart()` now converts
  its calendar fields to a JD and delegates to `chartAt`, so the two share one
  code path and return identical results. The natural entry point for callers
  that already hold a JD — transit/event scans, `rankMoments` winners, and
  `position`/`longitude` workflows — and it sidesteps the common
  `chart(jd, …)` misuse that throws `RangeError: jd … outside fitted range`.
  Mirrored in the Python reference (`chart_at`) and guarded by a
  `chartAt == chart` equivalence assertion in the golden suite.

### Docs & reference

- `/docs/charts` presents `chartAt` as the first-class path for charting from a
  Julian Day and clarifies that `chart()` takes calendar fields, not a JD; the
  electional mini-app builds the winner's chart with `chartAt(best.jd, …)`
  instead of a manual JD-to-calendar conversion.
- API reference filled out: every recommended- and advanced-tier symbol now
  carries full doc comments — parameter descriptions, return shapes, thrown
  errors, runnable examples, and cross-references — and the `Chart`,
  `ChartOptions`, `Position`, and related interfaces document every field
  (units, ranges, null cases). The same text surfaces on editor hover.
- Easier to navigate: Engine methods (`chart`, `chartAt`, `position`,
  `longitude`, and the rest) are now individually searchable and deep-linkable
  (`/docs/api/Class.Engine#chartat`), the `/docs/api` index surfaces the Engine
  method set directly, and every generated heading is anchored.

## 0.11.0 — 2026-06-14

Two engine layers that treat a chart as something to match and to synthesize.
No breaking changes to the 0.10.x surface; the position conformance suite is
unchanged at 3,218 checks, and two new cross-language goldens pin the additions
to the Python reference.

### Engine (`caelus`)

- Chart feature space: `chartFeatures` maps the sky at an instant to a vector
  (each body's longitude as a weighted unit-circle point), `cosineSimilarity`
  and `configurationFit` measure how alike two configurations are, and
  `searchConfigurations` ranks a time range by resemblance to a target form.
  The deterministic substrate for matching, retrieving, and searching chart
  configurations. Reference-first, pinned by `test/features-golden.json`.
- Geometric compiler: `compileForm` inverts (time, place) -> chart. Given
  weighted geometric constraints (`aspect`, `sign`, `degree`), it finds the
  body longitudes that best satisfy them via deterministic coordinate descent,
  reports the residual and worst constraint, and flags a form as `impossible`
  when even the best fit is poor. `constraintLoss` and `formLoss` are the pure
  loss functions. Reference-first, pinned by `test/compiler-golden.json`.

## 0.10.0 — 2026-06-14

A visualization tranche: 3D chart spheres, astrocartography, and a graphic
ephemeris, each landing engine math plus an SSR-safe render. No breaking changes
to the 0.9.x surface; the position conformance suite is unchanged at 3,218
checks, and three new cross-language goldens pin the additions.

### Engine (`caelus`)

- Spherical geometry: `angularSeparation3d` and `unitVector`, the true
  great-circle angle between two bodies from their ecliptic longitude and
  latitude. This is the 3D aspect, wider or narrower than the 2D longitude
  difference by the bodies' latitude. Reference-first, pinned by
  `test/spherical-golden.json`.
- Astrocartography: `astrocartography` and `planetLines` give where each body
  sits on the four angles across the globe, the MC/IC meridians and the curved
  ASC/DSC rising and setting tracks, from RA/Dec and sidereal time.
  Reference-first, pinned by `test/astrocartography-golden.json`.
- `ephemeris`: a time series of one value per body (longitude, latitude,
  declination, right ascension, or speed) over a range, the data behind a
  graphic ephemeris. A collector over the already-pinned positions.

### Chart wheel (`caelus-wheel`)

- `ChartSphere`: the chart as a tilted celestial sphere, planets at their true
  ecliptic latitude with the ecliptic and equator drawn as great-circle rings.
- `AstroMap`: the astrocartography angle lines on an equirectangular world map,
  with a graticule basemap and room for your own coastlines as children.
- `EphemerisGraph`: the ephemeris series as line graphs, with longitude wraps
  split. All SSR-safe SVG with no runtime dependencies.

## 0.9.0 — 2026-06-14

Electional building blocks and long-scan ergonomics on the engine, the hosted
MCP transport, and a self-contained build. No breaking changes to the 0.8.x
surface; the position conformance suite is unchanged at 3,218 checks, and two
new cross-language goldens pin the additions to the Python reference.

### Engine (`caelus`)

- Electional primitives: applying and separating aspects, solar phase (cazimi,
  combust, under the beams), planetary hours, void-of-course Moon, and house
  placement with angularity. Reference-first, pinned bit-for-bit by
  `test/electional-golden.json` (21 specs, 53 checks).
- `scan`, `rankMoments`, and `rankMomentsAsync`: a batched scan with progress
  and a top-N moment ranker over a user-supplied score, synchronous or
  non-blocking. A TS-side layer over the validated primitives, with a
  deterministic unit suite (14 checks).

### MCP server (`caelus-mcp`)

- Hosted over MCP Streamable HTTP at `https://www.ephemengine.com/api/mcp`,
  stateless, alongside the stdio transport. `buildServer(engine?)` takes an
  injectable engine so the same tool surface backs both.
- Two electional tools (seven to nine): `planetary_hours` (the hour in effect,
  its ruler and day/night span, the day ruler, and the 24-hour Chaldean
  sequence) and `void_of_course` (the Moon's sign, sign-exit time, and next
  perfecting aspect to Sun..Saturn).
- `natal_chart` and `current_sky` now tag each body with its solar phase
  (cazimi, combust, under the beams) and each aspect as applying or separating.
  Additive and optional, so a payload still feeds `<ChartWheel>` unchanged.
- `caelus://glossary` gains an `electional` block (solar-phase thresholds,
  Chaldean and day rulers, the void-of-course and aspect-phase definitions).

### Tooling and docs

- `npm run build` now generates the API reference and the search index, so a
  clean build produces a fully crawlable site.
- A cross-package integration test covers the local time to chart to wheel
  journey end to end.
- `npm run bundle-sizes` reports per-entrypoint sizes with esbuild; the
  data-tiers page gains a bundle-tradeoffs section.
- New site pages: methods, features, and how this was built.
- Corrected the sidereal ayanamsa count in stray docs (seven, not eight).

## 0.8.0 — 2026-06-13

A turbo evaluation tier and the phase-2 MCP surface. No breaking changes to the
0.7.x surface; the position conformance suite is unchanged at 3,218 checks.

### Engine (`caelus`)

- Turbo tier (`Turbo`): a segmented Chebyshev representation of the engine's
  apparent longitude, fit to the engine itself, so a longitude costs a couple of
  dozen multiply-adds. About 580x faster than the full engine, reproducing it to
  under 0.01" for the planets and ~0.03" for the Moon. The pack is a
  mint-it-for-your-range artifact; `fit_turbo.py` mints one with a pure-Python
  fit (no numpy). The TS evaluator is bit-identical to the Python reference,
  pinned by `test/turbo-golden.json` (110 cases, worst diff 0).

### MCP server (`caelus-mcp`)

- Resources: `caelus://glossary` (aspect angles and default orbs, signs, bodies,
  the twelve house systems, essential dignities) and `caelus://accuracy` (the
  validation table vs Swiss Ephemeris and JPL Horizons).
- Prompt: `rectification_session`, a multi-turn script around
  `rectification_grid` and `find_aspect_dates`.

## 0.7.0 — 2026-06-13

A derived-charts layer: standard astrological derivations computed on the
validated primitives. No breaking changes to the 0.6.x surface; the position
conformance suite is unchanged at 3,218 checks, and a new cross-language golden
(52 checks) pins the TypeScript port to the Python reference, bit-identical.

### Engine (`caelus`)

- Returns (`returns`, `solarReturn`, `lunarReturn`): the crossing search
  against a natal longitude.
- Secondary progressions (`progressedJd`, `progressedLongitude`): the
  day-for-a-year mapping. Solar arc (`solarArc`, `directedLongitude`): the true
  progressed-Sun arc, applied forward.
- Composite (`compositeLongitudes`): shorter-arc midpoints. Davison
  (`davisonParams`): the midpoint in time and place.
- Harmonics (`harmonicLongitude`, `harmonicChart`); antiscia (`antiscion`,
  `contraAntiscion`); declination aspects (`declinationAspect`,
  `declinationAspects`); out-of-bounds (`outOfBounds`, `outOfBoundsMargin`).
- Dignities (`dignities`, `dignityOf`): domicile, exaltation, detriment, fall.
  Sect (`isDayChart`, `planetarySect`, `inSect`): day-night by Sun altitude.
- All exported from the package root and mirrored between the TS engine and the
  Python reference (`astroengine/derived.py`), pinned by `test/derived-golden.json`.

### Docs and tooling

- Community-health files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- The `caelus-starter` template moved to its own repository.

## 0.6.0 — 2026-06-13

A declarative query language: the engine answers "where is the body?", and
`when()` answers "when is the configuration true?" over a time range. No
breaking changes to the 0.5.x surface; the position conformance suite is
unchanged at 3,218 checks, and a new cross-language golden (38 boundary
checks) pins the TypeScript port to the Python reference, boundary diff 0 s.

### Engine (`caelus`)

- Query language (`when()`): a predicate is a continuous margin function,
  true exactly where margin >= 0. Logical combinations reduce to the same form (`allOf`
  = min, `anyOf` = max, `notOf` = negation), so any query is one continuous
  function solved with the same coarse-scan-then-bisect root finder as
  `events.crossings`. Predicates ship for `aspect` (orb around any of seven
  exact angles, to a body or a fixed longitude), `inSign`, and `retrograde`
  / `notRetrograde`; all accept a `zodiac` mode. `when()` returns the
  intervals where the predicate holds, auto-selecting a 0.125 d scan step
  when a fast body (Moon, nodes, Lilith) is involved and 1 d otherwise.
  Exported from the package root.
- The TypeScript port mirrors the Python reference (`astroengine/query.py`);
  the two are pinned by `test/query-golden.json` (interval boundaries agree
  to 0 s).

### Docs and tooling

- `ARCHITECTURE.md` rewritten as an actual architecture document.
- `ROADMAP.md` added: durable, public-safe project plan.
- `templates/starter` README rewritten in the project's voice.
- Removed unused DE441 Moon refit tooling (`fit_moon.py`, `horizons.py`).

## 0.5.0 — 2026-06-13

Swiss Ephemeris gap analysis Tiers 2 and 3 close (see
`docs/gap-analysis.md`): every line item from the original plan is now
shipped or explicitly documented as out of scope. No breaking changes to
the 0.4.x surface; the conformance suite grew from 3,177 to 3,218 checks.

### Engine (`caelus`)

- Fixed stars: 318-star HYG-derived catalog (ICRS J2000 + proper
  motions, full 3D space motion; CC BY-SA 4.0, attributed in the pack).
  `engine.fixedStar(name, jd, opts?)` and `starNames()`; ≤0.6″ vs
  `swe_fixstar` fed the same catalog rows.
- Star-anchored ayanamsas `galcent_0sag` and `true_citra` (the v0.3
  deferral closes): the Galactic Center / Spica sits at the fixed
  sidereal longitude by definition; sidereal Sun ≤0.19″ vs Swiss
  Ephemeris. Eight zodiac modes total.
- Gauquelin sectors (`gauquelinSector`): rise/set of disc center with
  refraction (SE method 3), exact to the rise/set bound. `riseSet`
  gains a `discCenter` option.
- Solar and lunar eclipse search (`solarEclipses`/`lunarEclipses`),
  global circumstances: type, gamma, magnitudes, contacts. Types match
  Swiss Ephemeris exactly over 1990–2030 (92 lunar + 89 solar, none
  missed, none phantom); maxima ≤9 s; lunar magnitudes ≤0.0013 via
  Danjon's parallax enlargement (86/85 on the flattened Earth —
  recovered empirically). Ground paths / local circumstances are the one
  documented remainder.

### MCP server (`caelus-mcp`)

- `sky_events` gains `solar_eclipse` and `lunar_eclipse` kinds — the
  reserved Tier 3 extension.
- The zodiac parameter grows to eight modes (star-anchored ayanamsas).

## 0.4.0 — 2026-06-13

Swiss Ephemeris gap analysis Tier 2, minus fixed stars (see
`docs/gap-analysis.md`), plus deployment-boundary fixes from an external
review. No breaking changes to the 0.3.x surface; the conformance suite
grew from 3,087 to 3,177 checks; the engine computes 28 bodies.

### Engine (`caelus`)

- Event search (`events` module): rise/set/meridian transits (≤0.5 s vs
  `swe_rise_trans`, polar no-event cases agree), zodiac degree crossings
  (≤4 s), lunar phases (≤4 s), retrograde stations (~1 minute —
  ill-conditioned by nature).
- New bodies, on request via `ChartOptions.bodies` or `position()`:
  `true_lilith` (osculating apogee; hypersensitive to the lunar theory —
  see `accuracy.json` for the SE-oracle caveat), the big-four asteroids +
  Pholus (`ceres`, `pallas`, `juno`, `vesta`, `pholus`; JPL Horizons
  Chebyshev fits 1850–2150, ≤1″ geocentric, Node/lazy data tier), and the
  eight Hamburg-school Uranian bodies (`cupido`…`poseidon`; constant-
  element Kepler pack calibrated to Swiss Ephemeris 2.10, ≤2.3″).
- `loadNodeData` falls back per planet to the embedded VSOP tier against
  the published tarball instead of throwing.

### MCP server (`caelus-mcp`)

- `sky_events` — the seventh outcome-level tool: event search in a date
  range (≤370 days) for rise/set/meridian transits, lunar phases,
  stations, and zodiac crossings. Eclipses will extend it, not add a tool.

### Corrections and deployment

- True-node accuracy claim corrected on every surface: ≤1′ vs SE's
  built-in ephemeris (≤1″ only vs full JPL DE431); now pinned by the
  claims linter.
- Live-deploy smoke test (`live-smoke` workflow) guards the production
  API on every push to main, daily, and on dispatch.

## 0.3.0 — 2026-06-12

Swiss Ephemeris gap analysis Tier 1 (see `docs/gap-analysis.md`). No
breaking changes to the 0.2.x surface; the conformance suite grew from
1,438 to 3,087 checks, and every new feature is measured against Swiss
Ephemeris 2.10 by the new `python/validate_swiss.py` harness.

### Engine (`caelus`)

- Sidereal zodiac: `zodiac: "sidereal:<ayanamsa>"` with five fixed-epoch
  ayanamsas (`lahiri`, `fagan_bradley`, `krishnamurti`, `raman`,
  `yukteshwar`). Sidereal longitudes agree with Swiss Ephemeris to 0.08″
  (≤0.30″ at the range edges, from the precession-model difference).
- Eight new house systems, all exact against `swe_houses_armc` over 200
  polar-inclusive cases each: Koch, Regiomontanus, Campanus, Alcabitius,
  Morinus, Meridian, Polich-Page, Vehlow. Twelve systems total.
- `Position` gains `lat` (ecliptic latitude), `dist` (AU for every body,
  Moon included), `ra`, `dec` (true equinox of date).
- Topocentric positions (`topocentric: true` + `observer`), geometric
  `heliocentric()` query, mean Lilith available on request (≤1.3″),
  vertex and east point on `Chart.angles`.
- `pheno()`: phase angle, illuminated fraction, elongation, apparent
  diameter, and apparent magnitude (Mallama & Hilton 2018, with the
  Saturn ring term and Neptune's secular ramp; Moon via Allen's phase
  law, valid to phase angle ~140°). Plus `equationOfTime()`, `azAlt()`,
  and Saemundsson/Bennett refraction.
- Options-object API per `docs/api-v0.3.md`: `position(body, jdUt, opts)`
  and `chart(…, opts)`; `chart()`'s ninth argument still accepts the
  0.2.x house-system string. `BodyId` accepts any string id;
  `engine.bodies()` reports what the loaded data can compute.
- Bug fix: the ascendant at polar latitudes (|lat| > ~66°) could be the
  setting intersection, 180° off. The ASC now always lies in
  (MC, MC+180°), matching Swiss Ephemeris. This changes whole-sign
  fallback charts above the polar circles.

### MCP server (`caelus-mcp`)

- `zodiac` parameter on `natal_chart`, `current_sky`, `transits`,
  `synastry`, and `find_aspect_dates`; `house_system` widened to the
  twelve systems. Defaults leave existing payloads byte-identical.
- Payloads carry a `zodiac` key only when sidereal.

## 0.2.1 — 2026-06-12

- README-only patch so the npm package pages render the docs.

## 0.2.0 — 2026-06-12

- Structured aspect objects across the MCP surface
  (`{"a","b","aspect","orb"}`, transits add `t`/`n` and `applying`);
  chart payloads feed `caelus-wheel`'s `<ChartWheel>` with no adapter.
- The MCP handshake reports the real package version.

## 0.1.1 — 2026-06-12

- Fix `caelus-mcp` silently exiting when launched via `npx`.

## 0.1.0 — 2026-06-12

First release of all four packages, published with npm provenance.

- `caelus`: MIT, written from published sources (VSOP87D, Meeus, IAU 1980,
  JPL DE423/Horizons fits) — no Swiss Ephemeris code, no AGPL, no
  ephemeris files. Sun–Pluto, Chiron, both lunar nodes; speeds and
  retrogrades; ASC/MC; Placidus/Porphyry/Equal/Whole Sign houses with an
  explicit polar fallback; major aspects. Apparent geocentric positions,
  1800–2149. Per-body accuracy vs Swiss Ephemeris 2.10 (1900–2099):
  Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″ (precise tier),
  Pluto ≤2.5″, Chiron ≤1″, mean node ≤1″; true node ≤ 1′ vs SE's
  built-in ephemeris (corrected 2026-06-12 — originally misstated as
  ≤1″; the ≤1″ figure holds only vs full JPL DE431). TypeScript port pinned to the
  Python reference by 1,438 golden checks (worst deviation 0.82
  nano-arcseconds at release).
- `caelus-mcp`: six outcome-level tools over stdio (`natal_chart`,
  `current_sky`, `transits`, `synastry`, `find_aspect_dates`,
  `rectification_grid`); ~2 KB natal payloads.
- `caelus-birth`: local birth time + place → UT, with DST edge cases
  reported (`ambiguous`/`nonexistent`).
- `caelus-wheel`: React SVG chart wheel, zero runtime dependencies.
