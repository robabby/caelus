# caelus-wheel

React SVG chart wheel for [caelus](https://github.com/heavyblotto/caelus).
SSR-safe, zero runtime dependencies (react is a peer), ~3.4 KB gzipped.

```bash
npm install caelus-wheel
```

```tsx
import { ChartWheel } from "caelus-wheel";

<ChartWheel
  chart={chart}            // caelus Chart object or caelus-mcp chart payload, as-is
  size={520}               // px, square
  showAspects={true}
  aspectTypes={["conjunction", "sextile", "square", "trine", "opposition"]}
  theme={{ axis: "#8a7fd4" }}  // Partial<WheelTheme>; dark default
/>
```

`chart` accepts either the `Chart` object from the caelus engine or a
`natal_chart` / `current_sky` response from caelus-mcp — the MCP payload's
`rx` retrograde flag is understood and `signDeg` is derived from `lon`
when absent. An MCP client can pipe a tool response straight in.

## What it draws

- **Zodiac ring** — sign glyphs, sign boundaries, 1°/5°/10° tick marks.
- **House ring** — cusps from `chart.cusps` (all four systems), house
  numbers, AC/MC/DC/IC emphasized and labeled.
- **Planets** — glyph, degree°minute label, ℞ retrograde mark, a pointer
  tick at the true longitude. Bodies within ~6.5° fan out radially with a
  thin connector back to the true position, preserving zodiacal order —
  stelliums stay readable.
- **Aspect lines** — chords in the inner circle, colored by type, solid
  for hard aspects / dashed for soft, opacity scaled by orb tightness.

Orientation is the Western convention: ASC at 9 o'clock, longitudes
counterclockwise.

## Notes

- `mean_node` is hidden by default (it sits ~1° from the true node and
  doubles the glyph); pass `bodies={Object.keys(chart.bodies)}` to show
  every body, or any subset to filter.
- Glyphs are Unicode astrological characters embedded as SVG text. If a
  host font lacks one, override per body: `glyphs={{ chiron: "Ch" }}`.
- Pure render: no hooks, no client-only APIs — works in server components,
  static export, and `renderToStaticMarkup` (the test suite renders real
  engine charts exactly that way).

## The caelus packages

- [caelus](https://www.npmjs.com/package/caelus) — the engine
- [caelus-birth](https://www.npmjs.com/package/caelus-birth) — local birth time + place → UT
- caelus-wheel — this package
- [caelus-mcp](https://www.npmjs.com/package/caelus-mcp) — MCP server, twenty-five chart tools over stdio
