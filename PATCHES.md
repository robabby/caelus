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
