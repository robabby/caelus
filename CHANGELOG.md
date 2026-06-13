# Changelog

All four packages (`caelus`, `caelus-mcp`, `caelus-birth`, `caelus-wheel`)
version in lockstep. Numbers quoted here are as measured at release time;
current figures live in `packages/caelus/accuracy.json` and on
[ephemengine.com/validation](https://www.ephemengine.com/validation).

## 0.4.0 — 2026-06-12

Swiss Ephemeris gap analysis Tier 2, partial (see `docs/gap-analysis.md`).
No breaking changes to the 0.3.x surface; the conformance suite grew from
3,087 to 3,177 checks.

### Engine (`caelus`)

- Event search API (`events.ts`): rise/set/meridian transits (≤0.5 s vs
  `swe_rise_trans`), zodiac degree crossings and lunar phases (≤4 s),
  retrograde stations (~1 minute — ill-conditioned by nature). Topocentric
  and sidereal modes follow chart options.
- True/osculating Lilith (`true_lilith` on request; hypersensitive to the
  lunar theory — see `accuracy.json` for the SE-oracle caveat).
- Five main-belt asteroids + Pholus: `ceres`, `pallas`, `juno`, `vesta`,
  `pholus` from JPL Horizons Chebyshev fits (1850–2150, ≤1″ geocentric;
  same pipeline as Chiron). Loaded via `loadNodeData` / optional data packs.
- Eight Hamburg-school Uranian bodies: `cupido`, `hades`, `zeus`, `kronos`,
  `apollon`, `admetos`, `vulkanus`, `poseidon` from a Kepler element pack
  calibrated to Swiss Ephemeris 2.10 (≤2.3″ geocentric).
- Open body registry: `BodyId` accepts string ids; `engine.bodies()` reports
  what the injected data can compute.

### MCP server (`caelus-mcp`)

- **`sky_events`** — seventh outcome-level tool: event search in a date
  range (≤370 days) for rise/set/meridian transits, lunar phases, stations,
  and zodiac crossings. Times agree with Swiss Ephemeris to the second
  where the oracle applies.
- Chart tools unchanged in shape; optional bodies arrive through engine data
  on the Node loader path.

## 0.4.0 — 2026-06-13

Gap-analysis Tier 2 (minus fixed stars), plus deployment-boundary fixes
from an external review. The suite grew from 3,087 to 3,177 checks; the
engine computes 28 bodies.

### Engine (`caelus`)

- Event search (`events` module): rise/set/meridian transits (≤0.5 s vs
  `swe_rise_trans`, polar no-event cases agree), zodiac crossings (≤4 s),
  lunar phases (≤4 s), stations (≤1 min — ill-conditioned by nature).
- New bodies, all on request via `ChartOptions.bodies`:
  `true_lilith` (osculating apogee; ≤3′ vs SE's built-in ephemeris — the
  quantity amplifies lunar-theory differences ~18x and implementations
  disagree across software at that scale), the big-four asteroids +
  Pholus (`ceres`, `pallas`, `juno`, `vesta`, `pholus`; JPL Horizons
  Chebyshev fits 1850–2150, ≤1″, Node/lazy data tier), and the eight
  Hamburg-school Uranian bodies (`cupido`…`poseidon`; oracle-fitted
  constant-element Kepler orbits, ≤2.3″).
- `loadNodeData` falls back per planet to the embedded VSOP tier against
  the published tarball instead of throwing.

### MCP server (`caelus-mcp`)

- `sky_events` — the seventh tool: rise/set/transits, phases, stations,
  crossings in a date range. Eclipses will extend it, not add a tool.

### Corrections and deployment

- True-node accuracy claim corrected on every surface: ≤1′ vs SE's
  built-in ephemeris (≤1″ only vs full JPL DE431); now pinned by the
  claims linter.
- Live-deploy smoke test (`live-smoke` workflow) guards the production
  API, including the date-parameter regression an external review found.

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
