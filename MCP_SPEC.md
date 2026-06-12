# caelus-mcp — MCP Specification v0.2

Chart computation only. The server returns positions and aspects; the model
interprets. No interpretive text — smaller payloads, tradition-neutral,
composable with a separate KG/corpus server (see ARCHITECTURE.md).

## Design principles

1. **Outcome-level tools, not API wrappers.** `transits` returns natal +
   transiting aspects in one call.
2. **Seven tools.** More tools cost context and hurt tool selection. If
   seven tools can compose it, it stays out. (Six through v0.3;
   `sky_events` joined when the engine grew event search.)
3. **Token frugality.** Full natal chart ~2.5 KB: terse keys, 0.01° positions,
   compact aspect objects (`{"a":"moon","b":"venus","aspect":"trine","orb":2.09}`;
   transits add `t`/`n` and an `applying` flag).
4. **Render-ready output.** Chart aspects pass the engine's `Aspect` objects
   through unchanged, so a `natal_chart` / `current_sky` response feeds
   caelus-wheel's `<ChartWheel chart={payload} />` with no adapter.
5. **Determinism + provenance.** Same input → same output. Tool descriptions
   state per-body accuracy vs Swiss Ephemeris — never a blanket figure
   (1900–2099: Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″,
   Pluto ≤2.5″ with series valid 1885–2099, Chiron ≤1″, nodes ≤1″).

## Tools

### natal_chart(date, lat, lon, house_system?)
13 bodies (sun..pluto, chiron, both nodes): sign, degree, house, retrograde,
speed; ASC/MC; 12 cusps; major aspects with orbs.

### current_sky(date?, lat?, lon?, house_system?)
Same shape as natal_chart. Defaults to now.

### transits(date, lat, lon, transit_date?, orb?, house_system?)
Natal chart + transiting positions + transit-to-natal aspects within orb
(applying/separating), plus natal house per transiting body.

### synastry(a, b, orb?)
Two charts, inter-chart aspects, house overlays both ways.

### find_aspect_dates(body, aspect, target_lon|target_body, start, end)
Exact aspect dates in a range (bisection to ~1 minute), including retrograde
re-hits. Saturn square natal Moon across 2026–2027 returns direct/retrograde/
direct passes. Used for electional timing and inverse transit queries.

### rectification_grid(date, lat, lon, window?, step_minutes?)
Sweeps a day or window: ASC/MC per step, ASC sign-change boundaries.
Pairs with find_aspect_dates to check candidate times against dated events.

### sky_events(start, end, kinds, body?, lat?, lon?, target_lon?, zodiac?)
Event search in a date range (≤370 days): rise/set/meridian transits
(body + place), lunar phases, stations (retrograde/direct), zodiac degree
crossings. Times agree with Swiss Ephemeris to the second; stations to
~1 minute (ill-conditioned by nature). Eclipses join this tool in Tier 3.

## Resources (phase 2)
- `caelus://glossary` — machine-readable definitions (aspects, houses, dignities).
- `caelus://accuracy` — validation table.

## Prompts (phase 2)
- `natal_reading` — template wiring natal_chart + corpus citations (once KG server exists).
- `rectification_session` — multi-turn script around rectification_grid.

## Transports & deployment
- **stdio** (shipped): `npx caelus-mcp` for Claude Desktop / local agents.
- **Streamable HTTP** (next): mount `buildServer()` at `/api/mcp` on
  ephemengine.com (Vercel). Stateless, no auth on free tier; API key +
  rate limits on paid tier. No per-user state.

## Non-goals (v0.2)
Progressions/returns/solar-arc (compose from primitives; dedicated tools in
a later version if needed), Vedic ayanamsas (`zodiac: tropical|sidereal(<ayanamsa>)`
later), interpretation text (KG server's job).

## v0.3 surface (shipped)
New engine features do not become new tools. `natal_chart`, `current_sky`,
`transits`, and `synastry` take `zodiac` (`tropical` default, or
`sidereal:<ayanamsa>`: lahiri, fagan_bradley, krishnamurti, raman,
yukteshwar); `find_aspect_dates` searches in either zodiac. `house_system`
widened to 12: placidus, whole_sign, equal, porphyry, koch, regiomontanus,
campanus, alcabitius, morinus, meridian, polich_page, vehlow (Placidus and
Koch fall back to whole_sign above the polar circles, reported as before).
Payloads gain a `zodiac` key only when sidereal.

## v0.4 surface (shipped)
`sky_events` (the seventh tool, above): rise/set/transits, phases,
stations, crossings. Eclipses extend it in Tier 3 — no eighth tool.
