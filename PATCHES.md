# Codex review fixes — 2026-06-11

All six findings addressed and verified. Apply to the Cursor-managed tree
(Projects/caelus) or diff against this canonical copy.

## 1 (High) Placidus polar fallback now explicit
- `packages/caelus/src/chart.ts`: `Chart` gains `houseSystem` (actually
  used) and `houseSystemRequested`; fallback to whole_sign above |lat|>=66
  is now reported, never silent. Python engine patched identically
  (`house_system`, `house_system_requested`) for parity.
- MCP payload reports `houses` = actual, plus `houses_requested` and
  `houses_fallback_reason` when they differ.
- New golden fixture + conformance check (Svalbard chart): suite is now
  1,438 checks.
- Verified: GET /api/chart at lat 78.2 returns
  `houseSystemRequested: "placidus", houseSystem: "whole_sign"`.

## 2 (High) find_aspect_dates searches both aspect geometries
- `packages/caelus-mcp/src/server.ts`: sextile/square/trine are exact at
  BOTH +angle and -angle separation; the search now root-finds both
  offsets and merges sorted hits (conjunction/opposition unchanged,
  single geometry).
- Verified against an independent Swiss Ephemeris scan: Mars sextile
  283.283° over 2026–2033 → 9 hits on both sides incl. a retrograde
  triple-pass; both implementations agree to the minute on all 9.

## 3 (Medium) API validates input
- `apps/web/app/api/chart/route.ts`: 400 on non-finite/out-of-range
  lat ([-90,90]) and lon ([-180,180]), invalid dates, and dates outside
  the supported 1800–2149 range. Verified: lat=nope → 400, lat=999 → 400,
  date=1492 → 400.

## 4 (Medium) Synastry house overlays implemented
- `synastry` now returns `a_planets_in_b_houses` and
  `b_planets_in_a_houses` (house index per body via cusp arithmetic).

## 5 (Medium) Package metadata + README
- `packages/caelus/package.json`: `main`/`types` →
  `dist/src/index.{js,d.ts}` (match tsc output and exports map).
- README renamed to caelus throughout; imports corrected
  (`caelus`, `caelus/node`, `caelus/data-embedded`).

## 6 (Low) smoke.mjs path-independent
- Resolves the server binary relative to `import.meta.url`; runs from any
  cwd. Verified from repo root.

## Design feedback: playground UI
- Landing page is now an interactive playground: editable UTC datetime,
  lat/lon (validated inline), house-system selector; a context line
  stating exactly what was computed (time, coords, system used, fallback
  note, ms); tabs for positions (with houses) / aspects / raw JSON; the
  nuanced per-body accuracy table replacing the blanket "~1 arcsecond"
  claim; install/GitHub/REST/MCP links. Coordinates still default to
  Tampa but are visible and editable rather than silent.

## Process note
Finding 2 lived in the MCP layer, which the engine conformance suite
cannot see. Added `verify_aspects.mjs` as the seed of an MCP-layer
verification suite against the swisseph oracle — recommend expanding this
to cover every tool before npm publish.

# Research review fixes — 2026-06-11 (evening)

A research pass verified the site copy's external claims against primary
sources (IERS/NASA ΔT data, Astrodienst licensing pages, VSOP87 papers,
competing library repos). Engine fixes plus copy corrections follow.

## 1 ΔT extrapolation trend corrected (both engines)
- The post-2025 formula extrapolated ΔT upward at +0.29 s/yr (an
  Espenak–Meeus polynomial habit). Measured ΔT has been flat to slightly
  declining since ~2016 because Earth's rotation is accelerating; the
  old curve reached ~158 s at 2080 vs a realistic ~69 s.
- `packages/caelus/src/core.ts` and `python/astroengine/core.py` now use
  `max(69.2 - 0.05 * (y - 2025), 68.2)` past 2025, with a comment citing
  the IERS trend. Worst-case effect stays bounded: the Moon moves
  0.55″ per ΔT second, so the old curve injected up to ~50″ of avoidable
  late-century lunar error.
- Golden fixtures regenerated; conformance suite green
  (1,438 checks, 0 failures; TS-vs-Python worst diff 1.6e-9″).

## 2 export_golden.py missed the chart_polar fixture
- The fixture exporter predated Codex fix #1 and neither regenerated the
  Svalbard polar chart nor wrote `house_system`/`house_system_requested`,
  so any regeneration crashed (TypeError) or silently dropped a check.
- Both `regen_from_template` and `create_fresh` now emit the polar chart
  fixture with both house-system fields.

## 3 Copy corrections from the research pass (apps/web)
- ΔT note (/notes): now states the measured ~69 s plateau, the ~90 s
  overestimate the old curve produced by 2080, and the ±37 s
  century-scale uncertainty band, with sources.
- Licensing (/provenance): Swiss Ephemeris moved GPL→AGPL at v2.10.1
  (2021); the professional license is 700 CHF. Stated precisely instead
  of paraphrased.
- Alternatives (/provenance): new engine comparison table covering Swiss
  Ephemeris, astronomy-engine, astronomia, ephemeris (Moshier port),
  celestine, and Skyfield — including celestine, the closest MIT/TS
  competitor, compared honestly.
- Validation (/validation): Uranus/Neptune residuals attributed to series
  truncation (complete VSOP87 holds ≤1″); Moon reference data identified
  as DE423 (2010), within 0.1″ of DE440 for this span; true node
  described as an osculating element that rounds to the 1′ display step.
- SkyNow + MCP server description: true node accuracy "≤ 1′" → "~1′";
  natal_chart tool description now gives per-body accuracy instead of a
  blanket claim.
- Home page (/): redesigned to explain the whole project in one place —
  what it is, why it exists, how it is checked, what ships — with the
  playground kept at the top.
- Checked and left alone: the 20.4898″ aberration constant is correct as
  written (Meeus eq. 25.10 uses κ·(1−e²)); no code change.
