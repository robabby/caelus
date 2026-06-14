/**
 * ChartSphere: the chart as a tilted celestial sphere instead of a flat wheel,
 * SSR-safe SVG with no runtime dependencies. Planets sit at their true ecliptic
 * latitude (a flat wheel collapses that to zero), so you see the Moon ride above
 * the ecliptic and Pluto swing well off it. The ecliptic and equator are drawn
 * as great-circle rings, solid on the near hemisphere and faded on the far one;
 * a short stem drops each planet to the ecliptic plane to show its latitude.
 *
 * Inspired by Astrolog's chart spheres. The 3D aspect angle that pairs with this
 * view is `angularSeparation3d` in the caelus engine.
 */
import { GLYPHS, DARK_THEME, type WheelTheme } from "./index.js";

const D2R = Math.PI / 180;
const DEFAULT_OBLIQUITY = 23.4368; // mean obliquity, deg; for the equator ring
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍",
  "♎", "♏", "♐", "♑", "♒", "♓"];

export interface SpherePosition {
  lon: number;
  lat: number;
  retrograde?: boolean;
}
export interface SphereChart {
  /** Bodies with ecliptic longitude AND latitude (the caelus chart's bodies
   *  satisfy this as-is). A body may be absent (e.g. Chiron outside its fitted
   *  range); the component filters these out before reading them. */
  bodies: Record<string, SpherePosition | undefined>;
}

export interface ChartSphereProps {
  chart: SphereChart;
  /** Square size in px. */
  size?: number;
  /** Degrees the ecliptic pole tilts away from the viewer (0 = pole-on wheel,
   *  90 = edge-on). */
  tilt?: number;
  /** Degrees the sphere is spun about its pole (which longitude faces front). */
  turn?: number;
  /** Obliquity for the equator ring, degrees. */
  obliquity?: number;
  showEquator?: boolean;
  bodies?: string[];
  theme?: Partial<WheelTheme>;
  glyphs?: Record<string, string>;
}

type V3 = [number, number, number];

const eclVec = (lonDeg: number, latDeg: number): V3 => {
  const l = lonDeg * D2R, b = latDeg * D2R, cb = Math.cos(b);
  return [cb * Math.cos(l), cb * Math.sin(l), Math.sin(b)];
};
const rotX = (v: V3, deg: number): V3 => {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
};
const rotZ = (v: V3, deg: number): V3 => {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
};

interface ChartSphereCtx { turn: number; tilt: number; R: number; c: number; }
interface P2 { x: number; y: number; front: boolean; depth: number; }

function project(world: V3, ctx: ChartSphereCtx): P2 {
  const v = rotX(rotZ(world, ctx.turn), ctx.tilt);
  return { x: ctx.c + v[0] * ctx.R, y: ctx.c - v[1] * ctx.R, front: v[2] >= 0, depth: v[2] };
}

/** A great circle sampled and split into near (front) and far (back) polyline
 *  paths, so the near arc can be drawn solid over the far one. */
function ringPaths(points: V3[], ctx: ChartSphereCtx): { front: string; back: string } {
  const segs: Record<"front" | "back", string[]> = { front: [], back: [] };
  let run: P2[] = [];
  let runFront = true;
  const flush = () => {
    if (run.length < 2) { run = []; return; }
    const d = "M" + run.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L");
    segs[runFront ? "front" : "back"].push(d);
    run = [];
  };
  for (let i = 0; i <= points.length; i++) {
    const p = project(points[i % points.length], ctx);
    if (run.length && p.front !== runFront) { flush(); }
    if (!run.length) runFront = p.front;
    run.push(p);
  }
  flush();
  return { front: segs.front.join(" "), back: segs.back.join(" ") };
}

function circleSamples(make: (deg: number) => V3, n = 120): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) out.push(make((i / n) * 360));
  return out;
}

export function ChartSphere({
  chart,
  size = 520,
  tilt = 64,
  turn = -90,
  obliquity = DEFAULT_OBLIQUITY,
  showEquator = true,
  bodies,
  theme,
  glyphs,
}: ChartSphereProps) {
  const th: WheelTheme = { ...DARK_THEME, ...theme };
  const gl = { ...GLYPHS, ...glyphs };
  const c = size / 2;
  const R = size * 0.42;
  const ctx: ChartSphereCtx = { turn, tilt, R, c };

  const ecliptic = ringPaths(circleSamples((d) => eclVec(d, 0)), ctx);
  const equator = ringPaths(circleSamples((d) => rotX(eclVec(d, 0), obliquity)), ctx);

  const names = (bodies ?? Object.keys(chart.bodies)).filter((b) => chart.bodies[b]);
  const drawn = names.map((name) => {
    const { lon, lat, retrograde } = chart.bodies[name]!;
    const p = project(eclVec(lon, lat), ctx);
    const base = project(eclVec(lon, 0), ctx); // foot on the ecliptic plane
    return { name, p, base, retrograde };
  }).sort((a, b) => a.p.depth - b.p.depth); // far first (painter's order)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}
      xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="Astrological chart sphere">
      <circle cx={c} cy={c} r={R} fill={th.background} stroke={th.ring} strokeWidth={1} />

      {showEquator && (
        <g fill="none" stroke={th.axis} strokeWidth={1}>
          <path d={equator.back} opacity={0.25} strokeDasharray="3 3" />
          <path d={equator.front} opacity={0.7} />
        </g>
      )}
      <g fill="none" stroke={th.signText} strokeWidth={1.25}>
        <path d={ecliptic.back} opacity={0.3} strokeDasharray="3 3" />
        <path d={ecliptic.front} opacity={0.9} />
      </g>

      {/* zodiac sign marks at each 30 deg of ecliptic longitude */}
      <g fontFamily={th.fontFamily} fontSize={size * 0.03} fill={th.signText}
        textAnchor="middle" dominantBaseline="central">
        {SIGN_GLYPHS.map((g, i) => {
          const m = project(eclVec(i * 30, 0), ctx);
          return (
            <text key={i} x={m.x} y={m.y} opacity={m.front ? 0.85 : 0.3}>{g}</text>
          );
        })}
      </g>

      {/* planets at true latitude, with a stem to the ecliptic plane */}
      <g fontFamily={th.fontFamily}>
        {drawn.map(({ name, p, base, retrograde }) => {
          const op = p.front ? 1 : 0.4;
          return (
            <g key={name} opacity={op}>
              <line x1={base.x} y1={base.y} x2={p.x} y2={p.y}
                stroke={th.labelText} strokeWidth={1} opacity={0.6} />
              <circle cx={base.x} cy={base.y} r={1.5} fill={th.labelText} />
              <text x={p.x} y={p.y} fontSize={size * 0.045} fill={th.planetText}
                textAnchor="middle" dominantBaseline="central">{gl[name] ?? name.slice(0, 2)}</text>
              {retrograde && (
                <text x={p.x + size * 0.03} y={p.y - size * 0.03} fontSize={size * 0.022}
                  fill={th.labelText} textAnchor="middle">R</text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
