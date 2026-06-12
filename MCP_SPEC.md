# caelus-mcp — MCP Specification v0.1

Chart computation only. The server returns positions and aspects; the model
interprets. No interpretive text — smaller payloads, tradition-neutral,
composable with a separate KG/corpus server (see ARCHITECTURE.md).

## Design principles

1. **Outcome-level tools, not API wrappers.** `transits` returns natal +
   transiting aspects in one call.
2. **Six tools.** More tools cost context and hurt tool selection. If six
   tools can compose it, it stays out.
3. **Token frugality.** Full natal chart ~1.9 KB: terse keys, 0.01°
   positions, compact aspect strings (`t.saturn sq n.moon (0.4° applying)`).
4. **Determinism + provenance.** Same input → same output. Tool descriptions
   state accuracy (~1″ vs Swiss Ephemeris).

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

## Non-goals (v0.1)
Progressions/returns/solar-arc (compose from primitives; dedicated tools in
v0.2 if needed), Vedic ayanamsas (`zodiac: tropical|sidereal(<ayanamsa>)`
in v0.2), interpretation text (KG server's job).
