# caelus-wheel

React SVG chart wheel for [caelus](https://github.com/heavyblotto/caelus).
SSR-safe, zero runtime dependencies (react is a peer), ~4.8 KB gzipped.

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
  stelliums stay readable. Labels whose boxes would still collide drop to
  an inner tier.
- **Aspect lines** — chords in the inner circle, colored by type, solid
  for hard aspects / dashed for soft, opacity scaled by orb tightness.

Orientation is the Western convention: ASC at 9 o'clock, longitudes
counterclockwise.

## The layout kernel

All geometry comes from a pure module, exported alongside the component:

```ts
import { layoutChartWheel } from "caelus-wheel";

const layout = layoutChartWheel(input, options);
```

`layoutChartWheel(input, options?)` is deterministic and framework-free —
no React, no DOM, no clock. The same input always produces the same
`ChartWheelLayout`: rings, sign boundaries and glyphs, degree ticks,
optional house lines and numbers, optional axes, point anchors with text
boxes, connectors, aspect chords, and crowding metadata. `ChartWheel` is a
thin adapter over it: it converts a legacy `WheelChart` — applying this
package's historical defaults (hide `mean_node`, the five classic aspect
families, orb-scaled tightness) — and maps the finished layout onto SVG
elements.

### Input

`WheelLayoutInput` carries resolved display points and resolved aspect
edges. Each point supplies a stable `id`, its true ecliptic longitude
`lon`, glyph text, and an optional label. Each aspect edge names its two
endpoint ids, a `family` string, and a resolved `tightness` in [0, 1]. The
kernel never decides which bodies to draw, which node flavor wins, which
aspect families display, or which orb admits an aspect: callers resolve
policy before the kernel runs, and edges that reference missing points
throw rather than disappear.

`angles` and `cusps` are optional, independently. Omitting them represents
an unknown birth time: the layout omits axes, house lines, and house
numbers, and anchors 0° Aries at 9 o'clock. When angles are present, the
Ascendant anchors at 9 o'clock instead. `options.anchor` ("asc" or
"aries0") overrides the default; "asc" without angles throws.

### Geometry options

`WheelLayoutOptions` owns geometry only: `size`, `radii` (ring fractions
of the outer radius), `minAngularSep`, `anchor`, `connectorThresholdDeg`,
per-role font sizes, sign-glyph and axis-label strings, and text
`metrics`. `layout.applied` echoes every value the kernel actually used.

### Text metrics

Text boxes come from a deterministic `WheelTextMetrics` — `width(text,
fontSize)` and `height(fontSize)` — injected through options and never
read from the DOM. Each codepoint contributes its own advance width. The
default table approximates the wheel's monospace stack: 0.6 em cells,
0.62 em astrological glyphs, a 0.7 em line box.
`createTableTextMetrics` builds a metrics object from a measured table for
any other font.

### Collision handling

After angular spreading (`spreadAngles`, still exported), the kernel
measures every glyph and label box and detects glyph-to-glyph,
label-to-label, and cross-point glyph-to-label intersections. One bounded
adjustment applies: within each cluster of intersecting labels, alternate
labels in circular order drop to an inner tier. Whatever still intersects
is returned in `layout.crowding` — point ids in display order, the kind of
overlap, and the display arc — rather than silently overdrawn.

Guarantees: the kernel never returns a blank layout; every coordinate is
finite and rounded to 2 decimals; every point preserves both `trueLon` and
`displayLon`; every intersecting region is adjusted or reported. It does
not move glyphs, does not iterate beyond the single label tier, and does
not resize text — a severely crowded chart reports its regions and leaves
resolution to the caller.

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
- [caelus-mcp](https://www.npmjs.com/package/caelus-mcp) — MCP server, thirty-four chart tools over stdio
