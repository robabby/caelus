# Caelus

Astrological ephemeris monorepo. MIT, no Swiss Ephemeris code, no AGPL, no
ephemeris files. Live at [ephemengine.com](https://www.ephemengine.com).

## Packages

| Path | npm | Description |
|------|-----|-------------|
| `packages/caelus` | [`caelus`](https://www.npmjs.com/package/caelus) | TypeScript engine (~85 KB gzipped, zero deps) |
| `packages/caelus-mcp` | [`caelus-mcp`](https://www.npmjs.com/package/caelus-mcp) | MCP server: charts, transits, synastry, events, eclipses |
| `packages/caelus-delineations-pd` | — | Public-domain interpretation corpus + default validation set for `interpret()` |
| `packages/birth` | [`caelus-birth`](https://www.npmjs.com/package/caelus-birth) | Birth time + place → UT (timezone and DST resolution) |
| `packages/wheel` | [`caelus-wheel`](https://www.npmjs.com/package/caelus-wheel) | React SVG chart wheel, zero runtime deps |
| `apps/web` | — | Next.js site: playground, validation, edge `/api/chart` |
| [`caelus-starter`](https://github.com/heavyblotto/caelus-starter) | — | Next.js starter app (separate repo) |

The Python reference engine and data-fitting pipeline live in `python/`;
they mint the coefficient data and golden fixtures and are not a runtime
dependency.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — layout, durability decisions, product strategy
- [MCP_SPEC.md](./MCP_SPEC.md) — MCP tool contract
- [docs/gap-analysis.md](./docs/gap-analysis.md) — Swiss Ephemeris comparison (closed at 0.5.0)
- [docs/agents.md](./docs/agents.md) — pitfalls for coding agents building on Caelus
- [docs/releasing.md](./docs/releasing.md) — release process

## Quick start

```bash
npm install
npm run build
npm test
npm run dev -w web
```

http://localhost:3000 — live chart in the browser.
Edge API: `GET /api/chart?date=…&lat=…&lon=…`.

## Branches

- `main` — stable releases
- `dev` — active development
