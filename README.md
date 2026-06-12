# Caelus

Astrological ephemeris monorepo. MIT, no Swiss Ephemeris code, no AGPL, no
ephemeris files.

## Packages

| Path | Description |
|------|-------------|
| `packages/caelus` | TypeScript engine (~85 KB gzipped, zero deps) |
| `packages/caelus-mcp` | MCP server for chart computation |
| `apps/web` | Next.js demo — client-side charts + edge API |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for product strategy and [MCP_SPEC.md](./MCP_SPEC.md) for the MCP tool contract.

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
