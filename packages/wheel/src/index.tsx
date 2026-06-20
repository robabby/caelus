/**
 * caelus-wheel — React SVG chart wheel.
 *
 * Pure render, SSR-safe (no client-only APIs, no hooks, no effects).
 * Zero runtime dependencies; react is a peer.
 *
 * Orientation follows Western convention: ASC at 9 o'clock, zodiac
 * counterclockwise. Glyphs are Unicode astrological characters embedded as
 * SVG text — if a host font lacks one, the two-letter fallback in GLYPHS
 * can be substituted via the `glyphs` prop.
 */
import type { ReactElement } from "react";

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
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍",
  "♎", "♏", "♐", "♑", "♒", "♓"];
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

/**
 * Fan out display angles so no two bodies sit closer than minSep degrees,
 * preserving zodiacal order. Circular: cut at the largest gap, cluster
 * linearly, spread each cluster around its midpoint, merge clusters that
 * collide after spreading, repeat until stable.
 */
export function spreadAngles(lons: number[], minSep: number): number[] {
  const n = lons.length;
  if (n <= 1) return [...lons];
  // cannot fit at all: shrink separation to what the circle allows
  const sep = Math.min(minSep, 360 / n);

  const order = lons.map((lon, i) => ({ lon: mod(lon, 360), i }))
    .sort((a, b) => a.lon - b.lon);
  // rotate so the largest gap is between the last and first element
  let cut = 0;
  let biggest = -1;
  for (let k = 0; k < n; k++) {
    const gap = mod(order[(k + 1) % n].lon - order[k].lon, 360);
    if (gap > biggest) { biggest = gap; cut = (k + 1) % n; }
  }
  const seq = [...order.slice(cut), ...order.slice(0, cut)];
  // unwrap to a monotonic line starting at the first element
  const line = seq.map((e) => e.lon);
  for (let k = 1; k < n; k++) {
    while (line[k] < line[k - 1]) line[k] += 360;
  }

  // clusters as [start, end) index ranges; spread each evenly around the
  // midpoint of its true positions, merge clusters that collide, repeat
  const spread = (cl: { s: number; e: number }): number[] => {
    const m = cl.e - cl.s;
    const mid = (line[cl.s] + line[cl.e - 1]) / 2;
    return Array.from({ length: m }, (_, j) => mid + (j - (m - 1) / 2) * sep);
  };
  let clusters = line.map((_, k) => ({ s: k, e: k + 1 }));
  let positions = clusters.map(spread);
  for (let pass = 0; pass < n; pass++) {
    let merged = false;
    const nc: typeof clusters = [];
    const np: number[][] = [];
    for (let k = 0; k < clusters.length; k++) {
      const prev = np[np.length - 1];
      if (prev && positions[k][0] - prev[prev.length - 1] < sep - 1e-9) {
        nc[nc.length - 1].e = clusters[k].e;
        np[np.length - 1] = spread(nc[nc.length - 1]);
        merged = true;
      } else {
        nc.push({ ...clusters[k] });
        np.push(positions[k]);
      }
    }
    clusters = nc;
    positions = np;
    if (!merged) break;
  }

  const out = new Array<number>(n);
  clusters.forEach((cl, k) => {
    for (let j = cl.s; j < cl.e; j++) out[seq[j].i] = mod(positions[k][j - cl.s], 360);
  });
  return out;
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
  const asc = chart.angles.asc;
  const c = size / 2;
  const R = (size / 2) * 0.96;
  // AC/MC/DC/IC labels sit at r=1.05 outside the outer ring; pad the viewBox
  // so they are not clipped when the SVG is rendered at exactly `size` px.
  const pad = size * 0.07;

  // ASC at 9 o'clock, longitudes counterclockwise
  const pt = (lon: number, r: number): [number, number] => {
    const a = ((lon - asc + 180) * Math.PI) / 180;
    return [c + r * R * Math.cos(a), c - r * R * Math.sin(a)];
  };
  const fix = (v: number) => Math.round(v * 100) / 100;
  const line = (lon: number, r0: number, r1: number, props: object, key: string) => {
    const [x1, y1] = pt(lon, r0);
    const [x2, y2] = pt(lon, r1);
    return <line key={key} x1={fix(x1)} y1={fix(y1)} x2={fix(x2)} y2={fix(y2)} {...props} />;
  };
  const text = (
    lon: number, r: number, content: string, fontSize: number,
    fill: string, key: string, extra: object = {},
  ) => {
    const [x, y] = pt(lon, r);
    return (
      <text key={key} x={fix(x)} y={fix(y)} fontSize={fontSize} fill={fill}
        textAnchor="middle" dominantBaseline="central"
        fontFamily={T.fontFamily} {...extra}>{content}</text>
    );
  };

  const names = (bodies ?? Object.keys(chart.bodies).filter((b) => b !== "mean_node"))
    .filter((b) => chart.bodies[b] !== undefined);
  const trueLons = names.map((b) => chart.bodies[b]!.lon);
  const dispLons = spreadAngles(trueLons, 6.5);

  const el: ReactElement[] = [];

  // ring circles
  for (const [r, key] of [[1.0, "outer"], [0.84, "zodiac-in"], [0.70, "house-in"],
    [0.50, "aspect"]] as Array<[number, string]>) {
    el.push(<circle key={`ring-${key}`} cx={c} cy={c} r={fix(r * R)}
      fill="none" stroke={T.ring} strokeWidth={r === 1.0 ? 1.5 : 1} />);
  }

  // zodiac: sign boundaries, glyphs, ticks
  for (let s = 0; s < 12; s++) {
    el.push(line(s * 30, 0.84, 1.0, { stroke: T.ring, strokeWidth: 1 }, `sb-${s}`));
    el.push(text(s * 30 + 15, 0.92, SIGN_GLYPHS[s], size * 0.045, T.signText, `sg-${s}`));
  }
  for (let d = 0; d < 360; d++) {
    const len = d % 10 === 0 ? 0.035 : d % 5 === 0 ? 0.028 : 0.016;
    el.push(line(d, 0.84, 0.84 + len,
      { stroke: T.ring, strokeWidth: d % 5 === 0 ? 1 : 0.5 }, `tick-${d}`));
  }

  // house cusps + numbers; axes emphasized
  const cusps = chart.cusps;
  const axes: Array<[number, string]> = [
    [asc, "AC"], [chart.angles.mc, "MC"],
    [mod(asc + 180, 360), "DC"], [mod(chart.angles.mc + 180, 360), "IC"],
  ];
  for (let i = 0; i < 12; i++) {
    el.push(line(cusps[i], 0.50, 0.84, { stroke: T.ring, strokeWidth: 1 }, `cusp-${i}`));
    const arc = mod(cusps[(i + 1) % 12] - cusps[i], 360);
    el.push(text(cusps[i] + arc / 2, 0.77, String(i + 1), size * 0.026, T.houseText, `hn-${i}`));
  }
  for (const [lon, label] of axes) {
    el.push(line(lon, 0.50, 1.0, { stroke: T.axis, strokeWidth: 2 }, `axis-${label}`));
    el.push(text(lon, 1.045, label, size * 0.026, T.axis, `axl-${label}`));
  }

  // aspect lines (under the planet layer)
  if (showAspects) {
    const want = new Set(aspectTypes);
    const drawn = new Set(names);
    for (const a of chart.aspects) {
      if (!want.has(a.aspect) || !drawn.has(a.a) || !drawn.has(a.b)) continue;
      const [x1, y1] = pt(chart.bodies[a.a]!.lon, 0.50);
      const [x2, y2] = pt(chart.bodies[a.b]!.lon, 0.50);
      const tightness = Math.max(0, 1 - a.orb / (MAX_ORB[a.aspect] ?? 8));
      el.push(<line key={`asp-${a.a}-${a.aspect}-${a.b}`}
        x1={fix(x1)} y1={fix(y1)} x2={fix(x2)} y2={fix(y2)}
        stroke={T.aspectColors[a.aspect] ?? T.ring}
        strokeWidth={1 + tightness}
        strokeDasharray={HARD_ASPECTS.has(a.aspect) ? undefined : "4 3"}
        opacity={fix(0.25 + 0.65 * tightness)} />);
    }
  }

  // planets: pointer tick at true longitude, glyph + label at fanned angle
  names.forEach((b, i) => {
    const p = chart.bodies[b]!;
    const disp = dispLons[i];
    const pColor = T.planetColors?.[b] ?? T.planetText;
    el.push(line(p.lon, 0.815, 0.84, { stroke: pColor, strokeWidth: 1.2 }, `pt-${b}`));
    // connector when the glyph was displaced off its true longitude
    if (Math.abs(mod(disp - p.lon + 180, 360) - 180) > 0.75) {
      const [x1, y1] = pt(p.lon, 0.815);
      const [x2, y2] = pt(disp, 0.71);
      el.push(<line key={`conn-${b}`} x1={fix(x1)} y1={fix(y1)} x2={fix(x2)} y2={fix(y2)}
        stroke={T.labelText} strokeWidth={0.5} opacity={0.5} />);
    }
    el.push(text(disp, 0.655, G[b] ?? b.slice(0, 2).toUpperCase(),
      size * 0.05, pColor, `pg-${b}`));
    const signDeg = p.signDeg ?? mod(p.lon, 30);
    const retro = p.retrograde ?? p.rx ?? false;
    const deg = Math.floor(signDeg);
    const min = String(Math.floor(mod(signDeg, 1) * 60)).padStart(2, "0");
    el.push(text(disp, 0.585, `${deg}°${min}'${retro ? "℞" : ""}`,
      size * 0.024, T.labelText, `pl-${b}`));
  });

  return (
    <svg width={size} height={size}
      viewBox={`${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`}
      role="img" aria-label="astrological chart wheel"
      style={{ background: T.background, display: "block" }}>
      {el}
    </svg>
  );
}

export * from "./sphere.js";

export * from "./astromap.js";

export * from "./ephemerisgraph.js";
