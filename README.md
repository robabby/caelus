# Caelus

Clean-room astrology computation monorepo. MIT, no Swiss Ephemeris code, no
AGPL, no ephemeris files. Caelus computes ephemeris positions, charts, events,
hellenistic timing techniques, Vedic methods, citable chart facts, sky-view
image-prompt frames, and the MCP tools around them. Live at
[ephemengine.com](https://www.ephemengine.com).

## Fork status

This is [robabby/caelus](https://github.com/robabby/caelus), WavePoint's
maintenance fork of [heavyblotto/caelus](https://github.com/heavyblotto/caelus).

- **Baseline**: upstream tag `v0.23.0`, commit
  `e2a3fabbc520c1ac1e6f39373cd81fe928135ce7` (2026-06-21).
- **Purpose**: a reviewed, pinned source for the `caelus` engine package that
  WavePoint vendors for chart and transit computation. Fork-local changes are
  limited to distribution boundaries (for example the `caelus/data-core`
  export) and this status section; computation code stays upstream's.
- **Sync policy**: WavePoint vendors from an explicit reviewed fork commit,
  never mutable `main`. Upstream updates land by merging a reviewed upstream
  tag into `main`, re-running the full `ci` workflow, and re-pinning the new
  fork commit in WavePoint's sync manifest.
- **Validation policy**: every pinned commit must pass the fork's `ci`
  workflow (conformance suite plus the compiled package tests) before it is
  vendored. The `release` (npm publish) and `live-smoke` (upstream production
  probe) workflows are disabled on this fork.
- **Scope**: only the `packages/caelus` engine is part of the WavePoint
  adoption. `caelus-delineations-pd` is **not** adopted — interpretation
  content is evaluated separately and excluded from the vendored artifact.

## Packages

| Path | npm | Description |
|------|-----|-------------|
| `packages/caelus` | [`caelus`](https://www.npmjs.com/package/caelus) | TypeScript engine (~97 KB gzipped, zero deps) |
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
