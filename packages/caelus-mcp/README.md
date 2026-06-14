# caelus-mcp

MCP server for the [caelus](https://github.com/heavyblotto/caelus) ephemeris
engine: seventeen chart tools over stdio. Computation only — positions, houses,
aspects with orbs, event search, electional, returns, progressions, composite,
dignities, Hermetic lots, and the Hellenistic time-lords (profections,
firdaria, zodiacal releasing) — the model does the interpreting. It needs
no API keys, ephemeris files, or network calls; the engine data ships inside
the package.

## Setup

Claude Code / Claude Desktop, one line:

```bash
claude mcp add caelus -- npx caelus-mcp
```

Or any MCP client that speaks stdio:

```json
{
  "mcpServers": {
    "caelus": { "command": "npx", "args": ["caelus-mcp"] }
  }
}
```

- **Claude Desktop** — `claude_desktop_config.json`
- **Cursor** — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)
- **Anything else** — spawn `npx caelus-mcp` and speak JSON-RPC over stdio

A hosted Streamable HTTP endpoint is also live at
`https://www.ephemengine.com/api/mcp` for clients that prefer a remote server.

## Tools

| tool | what it answers |
|------|-----------------|
| `natal_chart` | A person's birth chart: 13 bodies with sign, house, retrograde, speed; ASC/MC; cusps; aspects |
| `current_sky` | The sky at a moment and place (defaults to now), not tied to a person |
| `transits` | Transiting planets vs a natal chart: aspects within orb, applying/separating, natal house per body |
| `synastry` | Two charts compared: inter-chart aspects, house overlays both ways |
| `find_aspect_dates` | Exact dates a transiting body aspects a longitude or another body, retrograde re-hits included |
| `rectification_grid` | ASC/MC sweep across a window of hours for birth-time rectification |
| `sky_events` | Rise/set/meridian transits, lunar phases, stations, zodiac crossings in a date range (≤370 days) |
| `planetary_hours` | The planetary hour in effect at a moment and place: ruler, day/night, hour number, start/end, day ruler, and the 24-hour ruler sequence |
| `void_of_course` | Whether the Moon is void-of-course at a moment: its sign, sign-exit time, and next perfecting aspect to Sun–Saturn |
| `returns` | Solar/lunar return instants in a window plus the first return chart, cast at the return location (defaults to the birthplace) |
| `progressions` | Secondary progressions (day-for-a-year) and solar-arc directions to a target date: per body the secondary and directed longitude, plus the solar arc |
| `composite` | Two relationship charts for a pair: the midpoint composite (bodies and angles) and the Davison chart |
| `dignities` | Essential dignity (domicile/exaltation/detriment/fall) and sect for the seven traditional planets at a moment and place |
| `lots` | The seven Hermetic lots (Arabic parts) — Fortune, Spirit, Eros, Necessity, Courage, Victory, Nemesis — cast from the Ascendant, sect-aware |
| `profections` | Annual and monthly profections to a target date: age, the profected signs and their whole-sign houses, and the lord of the year |
| `firdaria` | The firdaria planetary time-lord periods: the full 75-year timeline (nine periods, seven sub-periods each) and the lords active at a target date |
| `releasing` | Zodiacal releasing (aphesis) from the Lot of Spirit or Fortune: the L1–L4 period timeline and the lords active at a target date, with loosing of the bond |

`natal_chart` and `current_sky` also tag each body with its solar phase
(cazimi/combust/under-the-beams) and each aspect with applying/separating.

Bodies (core chart): sun through pluto, chiron, mean and true node. Optional
bodies (mean/true Lilith, asteroids, Uranians) follow engine data on the Node
loader path. House systems: twelve total — placidus (default), whole_sign,
equal, porphyry, koch, regiomontanus, campanus, alcabitius, morinus,
meridian, polich_page, vehlow. Placidus and Koch fall back to whole_sign
above the polar circles and say so in the payload. `zodiac` supports tropical
(default) and seven sidereal ayanamsas on chart tools.

## Output

Token-frugal JSON: terse keys, positions to 0.01°, a full natal chart is
~3 KB. Each aspect is a structured object the client can use directly:

```json
{ "a": "moon", "b": "venus", "aspect": "trine", "orb": 2.09, "phase": "separating" }
```

A `natal_chart` or `current_sky` response feeds
[caelus-wheel](https://www.npmjs.com/package/caelus-wheel)'s `<ChartWheel>`
directly — no adapter:

```tsx
const payload = JSON.parse(result.content[0].text);
<ChartWheel chart={payload} size={520} />
```

## Dates are UT

Tools take ISO 8601 UTC date-times. Convert local birth times first — the
tool descriptions instruct the model to do this, and
[caelus-birth](https://www.npmjs.com/package/caelus-birth) does it correctly
in code (historical tzdb rules, DST edge cases flagged). Longitude is
east-positive everywhere; the Americas are negative.

## Accuracy

Checked against Swiss Ephemeris across 1900–2099: Sun–Saturn ≤1″,
Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤2.5″ (series valid
1885–2099), Chiron ≤1″, mean node ≤1″, true node ≤1′ vs SE's built-in
ephemeris, asteroids ≤1″ (Horizons fits), Uranians ≤2.3″. Tables:
[ephemengine.com/validation](https://ephemengine.com/validation).

## The caelus packages

- [caelus](https://www.npmjs.com/package/caelus) — the engine
- [caelus-birth](https://www.npmjs.com/package/caelus-birth) — local birth time + place → UT
- [caelus-wheel](https://www.npmjs.com/package/caelus-wheel) — React SVG chart wheel
- caelus-mcp — this package

Spec and design notes:
[MCP_SPEC.md](https://github.com/heavyblotto/caelus/blob/main/MCP_SPEC.md).
