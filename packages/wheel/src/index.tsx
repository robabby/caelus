/**
 * caelus-wheel — React SVG chart wheel.
 *
 * Pure render, SSR-safe (no client-only APIs, no hooks, no effects).
 * Zero runtime dependencies; react is a peer.
 *
 * The geometry lives in the pure layout kernel (./layout.ts): resolved points
 * and aspect edges in, every ring, box, connector, and chord out. ChartWheel
 * is a compatibility adapter over it — it keeps this package's historical
 * defaults (hide mean_node, the classic five aspect families, orb-scaled
 * opacity) and maps the finished layout onto SVG elements.
 *
 * Orientation follows Western convention: ASC at 9 o'clock, zodiac
 * counterclockwise. Glyphs are Unicode astrological characters embedded as
 * SVG text — if a host font lacks one, the two-letter fallback in GLYPHS
 * can be substituted via the `glyphs` prop.
 */
import type { ReactElement } from "react";
import { layoutChartWheel } from "./layout.js";

export * from "./layout.js";

// minimal structural types: accept the caelus Chart object — or a caelus-mcp
// natal_chart / current_sky payload — as-is, without a runtime dependency on
// the engine. The MCP payload flags retrograde as `rx` and omits `signDeg`
// (derived from lon when absent).
export interface WheelPosition {
  lon: number;
  retrograde?: boolean;
  rx?: boolean;
  signDeg?: number;
}
export interface WheelAspect { a: string; b: string; aspect: string; orb: number }
export interface WheelChart {
  // A body may be absent (e.g. Chiron outside its fitted range on a historical
  // chart); the component filters these out before reading them.
  bodies: Record<string, WheelPosition | undefined>;
  angles: { asc: number; mc: number };
  cusps: number[];
  aspects: WheelAspect[];
}

export interface WheelTheme {
  background: string;
  ring: string;
  axis: string;
  signText: string;
  planetText: string;
  /** Optional per-body glyph color, keyed by body name ("sun","moon","mars",…).
   *  Falls back to planetText for any body not listed. */
  planetColors?: Record<string, string>;
  labelText: string;
  houseText: string;
  aspectColors: Record<string, string>;
  fontFamily: string;
}

export const DARK_THEME: WheelTheme = {
  background: "transparent",
  ring: "#3a3a44",
  axis: "#8a7fd4",
  signText: "#9a93c4",
  planetText: "#e8e6f0",
  labelText: "#8d8a99",
  houseText: "#6a6775",
  aspectColors: {
    conjunction: "#b8b4c8",
    opposition: "#c0564f",
    square: "#c0564f",
    trine: "#4f8fc0",
    sextile: "#4fb09a",
  },
  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

export const GLYPHS: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀",
  mars: "♂", jupiter: "♃", saturn: "♄", uranus: "♅",
  neptune: "♆", pluto: "♇", chiron: "⚷",
  true_node: "☊", mean_node: "☊",
};
const HARD_ASPECTS = new Set(["conjunction", "square", "opposition"]);
const MAX_ORB: Record<string, number> = {
  conjunction: 8, sextile: 4, square: 7, trine: 7, opposition: 8,
};

/** Python-semantics modulo (result sign follows the divisor). */
const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface ChartWheelProps {
  /** The Chart object from caelus, or a caelus-mcp natal_chart /
   *  current_sky tool response, as-is. */
  chart: WheelChart;
  /** Square size in px. */
  size?: number;
  showAspects?: boolean;
  aspectTypes?: string[];
  /** Bodies to draw; defaults to every body in the chart except mean_node
   *  (true node is drawn; the two sit ~1° apart and double the glyph). */
  bodies?: string[];
  theme?: Partial<WheelTheme>;
  glyphs?: Record<string, string>;
}

export function ChartWheel({
  chart,
  size = 520,
  showAspects = true,
  aspectTypes = ["conjunction", "sextile", "square", "trine", "opposition"],
  bodies,
  theme,
  glyphs,
}: ChartWheelProps): ReactElement {
  const T: WheelTheme = { ...DARK_THEME, ...theme,
    aspectColors: { ...DARK_THEME.aspectColors, ...(theme?.aspectColors ?? {}) },
    planetColors: { ...(DARK_THEME.planetColors ?? {}), ...(theme?.planetColors ?? {}) } };
  const G = { ...GLYPHS, ...glyphs };

  // ---- compatibility adapter: legacy chart + historical defaults -> resolved
  // kernel input. Body policy (hide mean_node), aspect-family policy, and orb
  // weighting are decided here, never in the layout kernel.
  const names = (bodies ?? Object.keys(chart.bodies).filter((b) => b !== "mean_node"))
    .filter((b) => chart.bodies[b] !== undefined);
  const drawn = new Set(names);
  const want = new Set(aspectTypes);
  const layout = layoutChartWheel({
    points: names.map((b) => {
      const p = chart.bodies[b]!;
      const signDeg = p.signDeg ?? mod(p.lon, 30);
      const retro = p.retrograde ?? p.rx ?? false;
      const deg = Math.floor(signDeg);
      const min = String(Math.floor(mod(signDeg, 1) * 60)).padStart(2, "0");
      return {
        id: b, lon: p.lon, glyph: G[b] ?? b.slice(0, 2).toUpperCase(),
        label: `${deg}°${min}'${retro ? "℞" : ""}`,
      };
    }),
    aspects: showAspects
      ? chart.aspects
        .filter((a) => want.has(a.aspect) && drawn.has(a.a) && drawn.has(a.b))
        .map((a) => ({
          a: a.a, b: a.b, family: a.aspect,
          tightness: Math.max(0, 1 - a.orb / (MAX_ORB[a.aspect] ?? 8)),
        }))
      : [],
    angles: chart.angles,
    cusps: chart.cusps,
  }, { size });

  // ---- thin renderer: map the finished layout onto SVG marks
  const fix = (v: number) => Math.round(v * 100) / 100;
  const { center: c } = layout;
  const text = (box: { cx: number; cy: number; text: string; fontSize: number },
    fill: string, key: string) => (
    <text key={key} x={box.cx} y={box.cy} fontSize={box.fontSize} fill={fill}
      textAnchor="middle" dominantBaseline="central"
      fontFamily={T.fontFamily}>{box.text}</text>
  );

  const el: ReactElement[] = [];

  // ring circles
  const RING_KEYS = { outer: "outer", zodiacInner: "zodiac-in",
    houseInner: "house-in", aspectHub: "aspect" } as const;
  for (const ring of layout.rings) {
    el.push(<circle key={`ring-${RING_KEYS[ring.id]}`} cx={c.x} cy={c.y} r={ring.r}
      fill="none" stroke={T.ring} strokeWidth={ring.id === "outer" ? 1.5 : 1} />);
  }

  // zodiac: sign boundaries, glyphs, ticks
  layout.zodiac.boundaries.forEach((b, s) => {
    el.push(<line key={`sb-${s}`} x1={b.seg.x1} y1={b.seg.y1} x2={b.seg.x2} y2={b.seg.y2}
      stroke={T.ring} strokeWidth={1} />);
    el.push(text(layout.zodiac.signGlyphs[s].box, T.signText, `sg-${s}`));
  });
  layout.zodiac.ticks.forEach((t, d) => {
    el.push(<line key={`tick-${d}`} x1={t.seg.x1} y1={t.seg.y1} x2={t.seg.x2} y2={t.seg.y2}
      stroke={T.ring} strokeWidth={t.kind === "unit" ? 0.5 : 1} />);
  });

  // house cusps + numbers; axes emphasized
  if (layout.houses) {
    layout.houses.cusps.forEach((cu, i) => {
      el.push(<line key={`cusp-${i}`} x1={cu.seg.x1} y1={cu.seg.y1}
        x2={cu.seg.x2} y2={cu.seg.y2} stroke={T.ring} strokeWidth={1} />);
      el.push(text(layout.houses!.numbers[i].box, T.houseText, `hn-${i}`));
    });
  }
  if (layout.axes) {
    for (const axis of layout.axes) {
      el.push(<line key={`axis-${axis.id}`} x1={axis.seg.x1} y1={axis.seg.y1}
        x2={axis.seg.x2} y2={axis.seg.y2} stroke={T.axis} strokeWidth={2} />);
      el.push(text(axis.label, T.axis, `axl-${axis.id}`));
    }
  }

  // aspect lines (under the planet layer)
  for (const a of layout.aspects) {
    el.push(<line key={`asp-${a.a}-${a.family}-${a.b}`}
      x1={a.seg.x1} y1={a.seg.y1} x2={a.seg.x2} y2={a.seg.y2}
      stroke={T.aspectColors[a.family] ?? T.ring}
      strokeWidth={1 + a.tightness}
      strokeDasharray={HARD_ASPECTS.has(a.family) ? undefined : "4 3"}
      opacity={fix(0.25 + 0.65 * a.tightness)} />);
  }

  // planets: pointer tick at true longitude, glyph + label at fanned angle
  for (const p of layout.points) {
    const pColor = T.planetColors?.[p.id] ?? T.planetText;
    el.push(<line key={`pt-${p.id}`} x1={p.tick.x1} y1={p.tick.y1}
      x2={p.tick.x2} y2={p.tick.y2} stroke={pColor} strokeWidth={1.2} />);
    // connector when the glyph was displaced off its true longitude
    if (p.connector) {
      el.push(<line key={`conn-${p.id}`} x1={p.connector.x1} y1={p.connector.y1}
        x2={p.connector.x2} y2={p.connector.y2}
        stroke={T.labelText} strokeWidth={0.5} opacity={0.5} />);
    }
    el.push(text(p.glyph, pColor, `pg-${p.id}`));
    if (p.label) el.push(text(p.label, T.labelText, `pl-${p.id}`));
  }

  return (
    <svg width={layout.size} height={layout.size}
      viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.width} ${layout.viewBox.height}`}
      role="img" aria-label="astrological chart wheel"
      style={{ background: T.background, display: "block" }}>
      {el}
    </svg>
  );
}

export * from "./sphere.js";

export * from "./astromap.js";

export * from "./ephemerisgraph.js";
