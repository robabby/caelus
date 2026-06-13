# Changelog

All four packages (`caelus`, `caelus-mcp`, `caelus-birth`, `caelus-wheel`)
version in lockstep. Numbers quoted here are as measured at release time;
current figures live in `packages/caelus/accuracy.json` and on
[ephemengine.com/validation](https://www.ephemengine.com/validation).

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
