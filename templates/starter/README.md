# caelus-starter

A Next.js 15 starter that takes a birth form to a natal chart wheel. It uses
[caelus](https://github.com/heavyblotto/caelus) (MIT ephemeris engine, charts
compute client-side), `caelus-birth` (timezone resolution), and `caelus-wheel`
(SVG chart wheel).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fheavyblotto%2Fcaelus-starter)

## Quickstart

```sh
git clone https://github.com/heavyblotto/caelus-starter
cd caelus-starter
npm install
npm run dev      # http://localhost:3000
```

Charts compute in the browser: no ephemeris files, no backend, and no API key
for the core flow.

## Timezone handling

A common cause of wrong charts is converting a local birth time with
`new Date(localString)`, which uses the server's timezone. A 2:30 PM birth in
Tampa computed on a UTC server yields an Ascendant of 10° Leo instead of the
correct 3° Libra: two signs off, and every house wrong.

This template converts through `caelus-birth`, which resolves the IANA zone
from the birthplace and applies historical tzdb rules (DST, half-hour zones,
wartime offsets). When a local time is ambiguous (the clocks changed that
night), the app surfaces it to the user rather than guessing. `npm run
test:birth` checks nine timezone edge cases in CI.

## What's inside

| Route | What it does |
|---|---|
| `/` | Birth form (place search via Open-Meteo geocoding, manual lat/lon fallback, "time unknown" path) and a today's-sky strip |
| `/chart` | Wheel, positions, houses, aspects, all client-side via `caelus/data-embedded` |
| `/rectify` | Handling unknown birth times (the `rectification_grid` flow) |
| `POST /api/reading` | Optional LLM reading. Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`); without a key the app runs charts-only |

The reading prompt is in `lib/prompt.ts`. This template ships no interpretation
text: positions are computed (caelus is verified per body against Swiss
Ephemeris; see [ephemengine.com/validation](https://ephemengine.com/validation)),
and the interpretation is left to you.

## What to build next

- **Transits and timing:** `caelus-mcp` exposes `transits`,
  `find_aspect_dates` (including retrograde re-hits), and `rectification_grid`
  to any MCP client: `npx caelus-mcp`.
- **Engine docs:** [ephemengine.com](https://ephemengine.com): playground,
  per-body validation tables, data provenance.
- **For AI assistants:** [ephemengine.com/llms.txt](https://ephemengine.com/llms.txt)
  and `docs/agents.md` in the caelus repo.

Place search data: [GeoNames](https://www.geonames.org/) via the
[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
(CC-BY 4.0).
