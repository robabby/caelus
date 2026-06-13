/**
 * astroengine query -- declarative time queries ("when is ...?").
 *
 * The engine answers "where is the body?"; this answers "when is the
 * configuration true?" over a time range. A predicate is a continuous
 * "margin" function, true exactly where margin >= 0 (e.g. aspect-within-orb
 * -> orb minus angular distance from exact). A boolean combination is then
 * itself a margin -- AND = min of the parts, OR = max, NOT = negation -- so
 * any query reduces to one continuous function and `when()` returns the
 * intervals where it is true using the same coarse-scan-then-bisect root
 * finder as events.crossings.
 *
 *   when(engine, allOf(aspect("saturn", "square", natalMoon),
 *                      notRetrograde("mercury"),
 *                      inSign("venus", "Taurus")), jdStart, jdEnd)
 *
 * Mirrors the Python reference (astroengine/query.py); the golden fixtures
 * pin the two implementations together.
 */
import { mod } from "./core.js";
import { Engine, BodyId, SIGNS, Zodiac } from "./chart.js";

export const QUERY_ASPECTS: Record<string, number> = {
  conjunction: 0, semisextile: 30, sextile: 60, square: 90,
  trine: 120, quincunx: 150, opposition: 180,
};

const FAST = new Set<string>([
  "moon", "mean_node", "true_node", "mean_lilith", "true_lilith",
]);

export type Interval = [number, number];

/** Margin function (true where >= 0) carrying the bodies it depends on. */
export interface Predicate {
  (engine: Engine, t: number): number;
  bodies: Set<string>;
}

function wrap180(d: number): number {
  return mod(d + 180, 360) - 180;
}

function mk(fn: (e: Engine, t: number) => number, bodies: Set<string>): Predicate {
  const p = fn as Predicate;
  p.bodies = bodies;
  return p;
}

// ---------------------------------------------------------------- predicates
/** True while `body` is within `orb` deg of an exact `kind` aspect to
 *  `target` -- a fixed ecliptic longitude (deg) or another body name. */
export function aspect(
  body: BodyId, kind: string, target: number | BodyId,
  orb = 1.0, zodiac: Zodiac = "tropical",
): Predicate {
  const ang = QUERY_ASPECTS[kind];
  if (ang === undefined) throw new Error(`unknown aspect ${kind}`);
  const isLon = typeof target === "number";
  const bodies = new Set<string>([body]);
  if (!isLon) bodies.add(target as string);
  return mk((engine, t) => {
    const lon = engine.longitude(body, t, { zodiac });
    const tl = isLon
      ? (target as number)
      : engine.longitude(target as BodyId, t, { zodiac });
    const sep = lon - tl;
    return orb - Math.min(Math.abs(wrap180(sep - ang)), Math.abs(wrap180(sep + ang)));
  }, bodies);
}

/** True while `body` is in `sign` (index 0=Aries..11=Pisces, or name). */
export function inSign(
  body: BodyId, sign: number | string, zodiac: Zodiac = "tropical",
): Predicate {
  const idx = typeof sign === "number" ? sign : SIGNS.indexOf(sign);
  if (idx < 0) throw new Error(`unknown sign ${sign}`);
  const lo = idx * 30;
  return mk((engine, t) => {
    const d = mod(engine.longitude(body, t, { zodiac }) - lo, 360);
    // signed distance to the nearest 30-deg band edge, positive inside
    return d <= 30 ? Math.min(d, 30 - d) : -Math.min(d - 30, 360 - d);
  }, new Set([body]));
}

/** True while `body` is in apparent retrograde motion. */
export function retrograde(body: BodyId, zodiac: Zodiac = "tropical"): Predicate {
  const h = 0.25;
  return mk((engine, t) => {
    const l0 = engine.longitude(body, t - h, { zodiac });
    const l1 = engine.longitude(body, t + h, { zodiac });
    return -wrap180(l1 - l0) / (2 * h); // >= 0 when moving backwards
  }, new Set([body]));
}

/** True while `body` is direct or stationary. */
export function notRetrograde(body: BodyId, zodiac: Zodiac = "tropical"): Predicate {
  return notOf(retrograde(body, zodiac));
}

// --------------------------------------------------------------- combinators
function combine(op: (xs: number[]) => number, preds: Predicate[]): Predicate {
  const bodies = new Set<string>();
  for (const p of preds) for (const b of p.bodies) bodies.add(b);
  return mk((engine, t) => op(preds.map((p) => p(engine, t))), bodies);
}

/** True where every predicate is true (interval intersection). */
export function allOf(...preds: Predicate[]): Predicate {
  return combine((xs) => Math.min(...xs), preds);
}

/** True where any predicate is true (interval union). */
export function anyOf(...preds: Predicate[]): Predicate {
  return combine((xs) => Math.max(...xs), preds);
}

/** True where `pred` is false (interval complement). */
export function notOf(pred: Predicate): Predicate {
  return mk((engine, t) => -pred(engine, t), new Set(pred.bodies));
}

// --------------------------------------------------------------- solver
function bisect(
  f: (t: number) => number, a: number, b: number, tol = 1e-6,
): number {
  let fa = f(a);
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (a + b);
    if (Math.abs(b - a) < tol) return m;
    const fm = f(m);
    if ((fa < 0) !== (fm < 0)) { b = m; } else { a = m; fa = fm; }
  }
  return 0.5 * (a + b);
}

export interface WhenOptions { step?: number; maxIntervals?: number }

/** Time intervals (jdStartUt, jdEndUt) in [jdStart, jdEnd] where `predicate`
 *  is true. Endpoints touching the range bounds are clamped. The scan step
 *  defaults to 0.125 d when a fast body (Moon, nodes, Lilith) is involved
 *  and 1 d otherwise. */
export function when(
  engine: Engine, predicate: Predicate,
  jdStart: number, jdEnd: number, opts: WhenOptions = {},
): Interval[] {
  let step = opts.step;
  if (step === undefined) {
    let fast = false;
    for (const b of predicate.bodies) if (FAST.has(b)) fast = true;
    step = fast ? 0.125 : 1.0;
  }
  const maxIntervals = opts.maxIntervals ?? 500;
  const f = (t: number): number => predicate(engine, t);
  const intervals: Interval[] = [];
  let prev = f(jdStart);
  let openStart: number | null = prev >= 0 ? jdStart : null;
  let t = jdStart + step;
  while (t <= jdEnd + 1e-9 && intervals.length < maxIntervals) {
    if (t > jdEnd) t = jdEnd;
    const cur = f(t);
    if ((prev < 0) !== (cur < 0)) {
      const edge = bisect(f, t - step, t);
      if (cur >= 0) {
        openStart = edge;
      } else if (openStart !== null) {
        intervals.push([openStart, edge]);
        openStart = null;
      }
    }
    prev = cur;
    if (t >= jdEnd) break;
    t += step;
  }
  if (openStart !== null) intervals.push([openStart, jdEnd]);
  return intervals;
}
