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

# Claim drift fixes — 2026-06-12

## 1 Worst-diff figure was stale (1.6 → 0.82 nano-arcseconds)
- The golden suite now reports worst diff `mars.speed@2478640.52 =
  8.19e-10″` (0.82 nano-arcsec), not the 1.6 nano-arcsec the prose
  carried. The ΔT-model merge above regenerated goldens and shifted the
  worst case; the prose figure was never updated.
- Corrected in `packages/caelus/README.md`, `apps/web/app/page.tsx`,
  `apps/web/app/validation/page.tsx`, `apps/web/app/notes/page.tsx`,
  and both `llms.txt` copies (root + `apps/web/public`).

## 2 MCP per-body accuracy reconciled with the validation table
- `server.ts` natal_chart description and `MCP_SPEC.md` claimed
  "planets ≤3″, Moon ≤0.5″ (1920–2080)". Both conflicted with the
  canonical `validation/page.tsx` BODY_TABLE (Neptune 4.6″, precise Moon
  2.5″). Reconciled to the measured 1900–2099 table: Sun–Saturn ≤1″,
  Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤2.5″ (series valid
  1885–2099), Chiron ≤1″, nodes ≤1″. The same stale per-body figures in
  both `llms.txt` copies were corrected to match.

## 3 ci.yml no longer hard-codes the check count
- The conformance-job comment stated "1,438 golden checks"; dropped the
  count so the comment can't rot.

# Workstream 1: claims-as-data regression gate — 2026-06-12

Closes the "numbers live only in transient console output" gap (the root
cause of the 1.6-nano drift above). Zero new dependencies.

## 1 Suites emit a machine-readable stats artifact
- `packages/caelus/test/golden.test.ts`: when `CAELUS_STATS_OUT` is set,
  writes `{suite, checks, failures, worst:{what,deg,arcsec,nano_arcsec},
  bodies, fixtures, generatedAt}`. Human stdout unchanged.
- `packages/caelus-mcp/verify_tools.mjs`: same flag, emits
  `{suite:"mcp", checks, failures, generatedAt}`.

## 2 One canonical per-body accuracy table
- `packages/caelus/accuracy.json` (new, exported via the package's
  `exports` map) is now the single source for per-body bounds. The three
  formerly-divergent tables collapse onto it: `validation/page.tsx`
  renders `accuracy.bodies`, `SkyNow.tsx` renders `accuracy.summary`.
  The SkyNow Uranus/Neptune bucket (was "≤2″/≤5″") now matches the
  measured "≤1.9″/≤4.6″".

## 3 Claims registry + linter, wired into CI
- `scripts/claims-registry.json`: maps each prose token (golden check
  count, worst-diff nano figure in both render forms) to a stats field,
  its render strings, the files it must appear in, and a competing-value
  regex. PATCHES.md is intentionally excluded — it records superseded
  values on purpose.
- `scripts/check-claims.mjs`: regenerates/loads `conformance-stats.json`,
  asserts each claim's value is present in every listed file and that no
  competing value of the same shape appears. Exits non-zero with a
  file:line report. Mutation-tested: flipping any registered number fails.
- `package.json`: `lint:claims` script. `ci.yml` conformance job now
  emits stats from the golden run and runs `lint:claims` after the build.
- `conformance-stats.json` is gitignored (regenerated, never committed).

# Workstream 3: MCP integration suite + lat/lon guard — 2026-06-12

## 1 Server now range-checks lat/lon (real bug)
- `current_sky` and `rectification_grid` took `z.number()` for lat/lon
  with no bounds, so `current_sky lat:999` silently *computed* a chart at
  an impossible latitude (the web API route already rejected this). Both
  now reuse the shared `latSchema`/`lonSchema` ([-90,90]/[-180,180] with
  the east-positive describe text). Out-of-range input returns isError at
  the MCP boundary. Verified: lat:999, lon:400, grid lat:200 all rejected;
  valid coords still compute.

## 2 Exported output schemas
- `server.ts` now exports zod output schemas (`chartOut`, `transitsOut`,
  `synastryOut`, `findAspectDatesOut`, `rectificationGridOut`) and an
  `OUTPUT_SCHEMAS` map, so server and test share one definition of each
  tool's response shape.

## 3 Committed MCP golden payloads + integration suite
- `scripts/export-mcp-golden.mjs` mints `packages/caelus-mcp/test/
  golden-mcp.json` (11 canonical cases: one per tool plus polar, historical
  1855, southern, equator, body-to-body). Regenerate deliberately, review
  the diff.
- `packages/caelus-mcp/integration.test.mjs` (41 checks): validates every
  response against the exported output schema, deep-equals canonical inputs
  against the frozen goldens (catches payload-FORMAT drift verify_tools
  can't see), and exercises an edge-case matrix (polar fallback, historical,
  southern/equator, default-time paths) plus an invalid-input matrix
  (out-of-range lat/lon, bad ISO, >50yr range, missing target → isError).
  Emits stats to CAELUS_STATS_OUT. Wired into the conformance job after
  verify_tools. Mutation-tested: corrupting a golden fails exactly its case.

# Package rename sync — 2026-06-12

- Upstream renamed the scoped packages `@caelus/birth` → `caelus-birth` and
  `@caelus/wheel` → `caelus-wheel` (the `@caelus` npm scope was reserved); the
  directory paths `packages/birth` / `packages/wheel` were unchanged. Synced
  `dev` to the merge that reconciled Workstreams 1+3 with the rename.
- Audited every Workstream 1/3 deliverable for stale package references:
  `claims-registry.json`, `check-claims.mjs`, `export-mcp-golden.mjs`,
  `integration.test.mjs`, `golden-mcp.json`, the `accuracy.json` imports, and
  CI steps. None referenced the renamed packages — they touch only `caelus`
  and `caelus-mcp` (neither renamed) — so no fixups were required and the
  claims linter stayed green. Full suite re-run confirmed against the renamed
  layout (golden 1438, verify_tools 166, integration 41, birth 269, wheel 33,
  lint:claims, build).

# Workstream 2: LLM function-calling consistency — 2026-06-12

## 1 MCP schema/description fixes (the 8 D.1 ambiguities)
- `server.ts` tool descriptions rewritten to encode intent and head off the
  tool-selection and bad-arg pitfalls the audit catalogued:
  - `natal_chart` / `current_sky` overlap: each description now states when to
    use it ("a person's birth chart, requires date+place" vs "the sky at a
    moment, not tied to a person; defaults to now / geocentric 0,0").
  - `current_sky` / `rectification_grid` lat/lon got the east-positive describe
    text and the "default 0 makes houses nominal" footgun note (bounds were
    added in Workstream 3).
  - Every datetime field ("convert from local first") on `current_sky.date`,
    `transit_date`, and `find_aspect_dates.start/end`.
  - `find_aspect_dates`: "provide exactly one of target_lon / target_body" at
    the description level, plus a snake_case-body and abbreviated-output-token
    note.
  - `rectification_grid`: spelled out the date/window_*_hour interaction.
  - `synastry`: documented that overlays always use Placidus (not
    configurable) and each person needs date+lat+lon.
  These change wording only; payloads are unchanged, so verify_tools (166) and
  the integration goldens (41) stay green.

## 2 Eval harness (`packages/caelus-mcp/eval/`)
- `prompts.jsonl` — 49 fixtures: one+ clear case per tool, the D.1
  tool-selection traps (sky-now vs natal, synastry, body-to-lon vs body-to-body
  find, rectification, transits default-time), pitfall probes (local-time→UTC
  for Tokyo/LA/Sydney, west/east longitude sign, southern latitude, polar
  Svalbard fallback, historical 1855/1899, out-of-range pre-1800/post-2149,
  >50yr range), and negative/should-refuse cases (pure interpretation, missing
  birth data). Each fixture carries `expect.tool` (exact or accepted-set incl.
  `null`), `expect.args` (exact / `{approx,tol}` for geocoded numerics / `"now"`
  sentinel), `expect.argChecks`, and `tags`.
- `score.mjs` — the named argCheck predicates (`date_is_utc`, `lon_sign_east/
  west`, `lat_sign_south`, `orb_in_range`, `step_in_range`, `window_in_range`,
  `exactly_one_target`, `exactly_one_date`, `range_le_50yr`, `snake_case_body`,
  `synastry_both_present`), tool-match (accepts a set incl. `null`), numeric
  tolerance comparison, and aggregation/markdown reporting (tool-selection
  accuracy, schema-valid rate, per-predicate and per-tag breakdown).
- `run.mjs` — model-agnostic orchestrator. **CI / self-check mode (default, no
  model, no keys):** spawns the server, pulls each tool's live JSON Schema via
  `listTools()`, and asserts every fixture's expected args are schema-valid
  (ajv) and satisfy their own argChecks; emits `{suite:"mcp-eval-selfcheck"}`
  to CAELUS_STATS_OUT. **Live mode (opt-in via `EVAL_MODEL=provider:model`):**
  pluggable Anthropic/OpenAI adapters that read keys from the environment only,
  capture {tool,args}, score, and write `report.json`/`report.md`. No keys are
  read from disk or committed; live runs are not a CI gate. `ajv` added as the
  single new dev dep (already in the tree transitively).
- Wired the self-check into the conformance job after `integration.test.mjs`
  (`node packages/caelus-mcp/eval/run.mjs`) and added `eval:selfcheck` to root
  scripts. Mutation-tested: flipping an expected longitude sign fails its
  predicate; an out-of-range expected orb fails ajv schema validation.

# Vale brand-casing fixes — 2026-06-13

- Vocab: added intentional product/competitor terms to the Caelus accept list
  (EphemEngine, Prokerala, Kerykeion, Celestine, Merriman, Streamable,
  prosumer, composable, embeddable, instrumentable, commoditized, anonymized,
  dogfooding, SDKs, SLAs, eval) and widened `Uranian` to `Uranians?`. Mirrored
  into both `styles/Vocab/Caelus` and `styles/config/vocabularies/Caelus`.
- Vale.Terms: lowercase `ephemengine` accepted so the literal
  `ephemengine.com` domain in README/CHANGELOG link text stops tripping the
  term-casing rule; `[*.md]` gets a URL/hostname `TokenIgnores`.
- Cleared two pre-existing prose-lint failures introduced upstream by the
  0.4.0 release docs: `Uranians` spelling in docs/gap-analysis.md (vocab) and a
  stacked "no X, no Y, no Z" anaphora in packages/caelus-mcp/README.md (reworded
  to a single clause, meaning unchanged).
