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

# Branch merge: measured accuracy + ΔT unification — 2026-06-12

Two parallel sessions addressed the same research review. The merge to
dev unified them, with disagreements resolved by measurement.

## 1 ΔT post-2025 model unified (both engines)
- The two fixes disagreed: hold-with-floor `max(69.2 - 0.05·t, 68.2)`
  vs decline-plus-tidal-rise. Merged to the latter:
  `69.2 - 0.04·t + 32·(t/100)²` — the observed 2020–2025 slope plus the
  long-term tidal quadratic (+32 s/cy², the same coefficient as the
  deep-time parabola), so ΔT rejoins the secular rise instead of
  flat-lining at 68.2 s through 2150. Huber's ±37 s/80 yr uncertainty
  citation kept. Goldens regenerated; suite green (1,438 checks).

## 2 True node re-measured against FULL Swiss files (DE431)
- The "61″ / ~1′" true-node figures came from Swiss's built-in Moshier
  mode. Against the DE431 data files the node is sub-arcsecond:
  max 0.76″, RMS 0.37″ over 1900–2099 (n=400); ≤0.9″ across 1850–2149.
  Moshier mode itself differs from DE431 by up to ~15″ here.
- Validation table, SkyNow, and the MCP natal_chart description now
  carry the measured numbers. Swiss files used as oracle only, from a
  temp dir, never entering the repo.

## 3 Moon precise-tier: post-2025 deltas are ΔT divergence, not error
- At identical TT instants the 1920–2080 tier agrees with DE431 to
  0.28″ worst-case. UT-based comparisons after 2025 drift apart because
  Swiss 2.10 extrapolates ΔT ~8 s higher by 2079 — unknowable for any
  engine, documented on /validation.

## 4 MCP layer gets its per-tool oracle suite
- `verify_tools.mjs` (grown from `verify_aspects.mjs`, now removed):
  166 checks across all 6 tools against the engine in-process — polar
  fallback reporting, retrograde triple-pass, both ±60° sextile
  geometries, contract errors, grid cross-checks. Mutation-tested:
  reintroducing the finding-#2 bug fails exactly the two relevant
  checks. Runs in CI after the smoke test.

## 5 Housekeeping
- `export_golden.py`: both parallel fixes converged on emitting
  `chart_polar`; deduplicated, and the chart fixture now carries the
  full engine dict including house-system fields.
- Doc drift: check counts 1,437 → 1,438; Python reference located in
  `python/`; Chiron re-fit marked done. Chiron Horizons cache commit
  handed off (`docs/handoff-chiron-cache.md`) pending network access.
