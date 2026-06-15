/**
 * Classical aspect configurations as first-class objects.
 *
 * Pure geometry over a chart's body longitudes (and houses, for stelliums); no
 * interpretation. Each configuration is judged from pairwise angular separations
 * against an explicit, overridable orb policy: the engine's {@link DEFAULT_ORBS}
 * for the Ptolemaic aspects, plus a quincunx (150°) for yods. The default body
 * set is the aspectable bodies (planets and Chiron; nodes and Lilith excluded).
 *
 * Reported patterns are maximal: a grand cross suppresses the two T-squares it
 * contains and a kite suppresses its grand trine. Port of the Python reference
 * `astroengine.patterns`, pinned by `patterns-golden`.
 */
import { mod } from "./core.js";
import { SIGNS, NOT_ASPECTABLE } from "./chart.js";
import type { Chart } from "./chart.js";

/** Pattern aspects, including the quincunx the default Ptolemaic set omits. */
export const PATTERN_ANGLES: Record<string, number> = {
  conjunction: 0, sextile: 60, square: 90, trine: 120, quincunx: 150, opposition: 180,
};

/** Default orbs: {@link DEFAULT_ORBS} for the five Ptolemaic aspects, plus a
 *  tight quincunx. Override via {@link PatternOptions.orbs}. */
export const PATTERN_ORBS: Record<string, number> = {
  conjunction: 8, sextile: 4, square: 7, trine: 7, quincunx: 3, opposition: 8,
};

const KIND_ORDER = [
  "grand_cross", "mystic_rectangle", "kite", "t_square", "grand_trine",
  "yod", "stellium_sign", "stellium_house",
];

/** One configuration found in a chart. */
export interface ChartPattern {
  /** Configuration kind, e.g. `"t_square"` or `"grand_trine"`. */
  kind: string;
  /** Participating body ids, sorted. */
  bodies: string[];
  /** Focal body for a T-square or yod (the squared / quincunx apex). */
  apex?: string;
  /** Sign for a `stellium_sign`. */
  sign?: string;
  /** House for a `stellium_house`. */
  house?: number;
  /** Worst defining-aspect orb in degrees; `0` for stelliums. */
  orb: number;
}

/** A body's longitude (and house, for stelliums) for {@link detectPatternsIn}. */
export interface PatternBody {
  lon: number;
  house?: number | null;
}

export interface PatternOptions {
  /** Per-aspect orb overrides (degrees), keyed by aspect name. */
  orbs?: Record<string, number>;
  /** Body ids to consider; defaults to the aspectable bodies present. */
  bodies?: string[];
}

const separation = (la: number, lb: number) => Math.abs(mod(la - lb + 180, 360) - 180);

/** The single aspect a pair forms (orbs do not overlap), as `[name, orb]`, or null. */
function relation(la: number, lb: number, orbs: Record<string, number>): [string, number] | null {
  const sep = separation(la, lb);
  for (const name of Object.keys(PATTERN_ANGLES)) {
    const orb = Math.abs(sep - PATTERN_ANGLES[name]);
    if (orb <= orbs[name]) return [name, orb];
  }
  return null;
}

function cmpBodies(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

/**
 * The configurations present among a body map. Lower-level form of
 * {@link detectPatterns}: `bodies` maps a body id to `{ lon, house? }`.
 */
export function detectPatternsIn(
  bodies: Record<string, PatternBody>, opts: PatternOptions = {},
): ChartPattern[] {
  const orbs = opts.orbs ?? PATTERN_ORBS;
  const names = (opts.bodies ?? Object.keys(bodies).filter((b) => !NOT_ASPECTABLE.has(b)))
    .filter((b) => b in bodies);
  const lon: Record<string, number> = {};
  for (const b of names) lon[b] = mod(bodies[b].lon, 360);

  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const rel = new Map<string, [string, number]>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const r = relation(lon[names[i]], lon[names[j]], orbs);
      if (r) rel.set(key(names[i], names[j]), r);
    }
  }
  const asp = (a: string, b: string) => rel.get(key(a, b)) ?? null;
  const isAspect = (a: string, b: string, kind: string) => {
    const r = asp(a, b);
    return r !== null && r[0] === kind;
  };

  const out: ChartPattern[] = [];

  // Grand trines (3-body) and grand crosses / mystic rectangles (4-body).
  const grandTrines: ChartPattern[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (let k = j + 1; k < names.length; k++) {
        const [a, b, c] = [names[i], names[j], names[k]];
        if (isAspect(a, b, "trine") && isAspect(b, c, "trine") && isAspect(a, c, "trine")) {
          const orb = Math.max(asp(a, b)![1], asp(b, c)![1], asp(a, c)![1]);
          grandTrines.push({ kind: "grand_trine", bodies: [a, b, c].sort(), orb });
        }
      }
    }
  }

  const grandCrosses: ChartPattern[] = [];
  const mysticRectangles: ChartPattern[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (let k = j + 1; k < names.length; k++) {
        for (let l = k + 1; l < names.length; l++) {
          const quad = [names[i], names[j], names[k], names[l]];
          const pairs: Array<[string, string]> = [
            [quad[0], quad[1]], [quad[0], quad[2]], [quad[0], quad[3]],
            [quad[1], quad[2]], [quad[1], quad[3]], [quad[2], quad[3]],
          ];
          const kinds = pairs.map(([a, b]) => asp(a, b));
          if (kinds.some((r) => r === null)) continue;
          const counts: Record<string, number> = {};
          let worst = 0;
          for (const r of kinds) {
            counts[r![0]] = (counts[r![0]] ?? 0) + 1;
            if (r![1] > worst) worst = r![1];
          }
          if (counts.opposition === 2 && counts.square === 4) {
            grandCrosses.push({ kind: "grand_cross", bodies: [...quad].sort(), orb: worst });
          } else if (counts.opposition === 2 && counts.trine === 2 && counts.sextile === 2) {
            mysticRectangles.push({ kind: "mystic_rectangle", bodies: [...quad].sort(), orb: worst });
          }
        }
      }
    }
  }

  // Kite: a grand trine plus a fourth body opposite one member.
  const kites: ChartPattern[] = [];
  for (const gt of grandTrines) {
    const tri = gt.bodies;
    for (const d of names) {
      if (tri.includes(d)) continue;
      for (const apex of tri) {
        const others = tri.filter((x) => x !== apex);
        if (isAspect(d, apex, "opposition")
          && isAspect(d, others[0], "sextile")
          && isAspect(d, others[1], "sextile")) {
          const orb = Math.max(gt.orb, asp(d, apex)![1], asp(d, others[0])![1], asp(d, others[1])![1]);
          kites.push({ kind: "kite", bodies: [...tri, d].sort(), apex, orb });
        }
      }
    }
  }

  // T-square: an opposition whose two ends both square a common apex.
  const tSquares: ChartPattern[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      if (!isAspect(a, b, "opposition")) continue;
      for (const apex of names) {
        if (apex === a || apex === b) continue;
        if (isAspect(apex, a, "square") && isAspect(apex, b, "square")) {
          const orb = Math.max(asp(a, b)![1], asp(apex, a)![1], asp(apex, b)![1]);
          tSquares.push({ kind: "t_square", bodies: [a, b, apex].sort(), apex, orb });
        }
      }
    }
  }

  // Yod: a sextile whose two ends both quincunx a common apex.
  const yods: ChartPattern[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      if (!isAspect(a, b, "sextile")) continue;
      for (const apex of names) {
        if (apex === a || apex === b) continue;
        if (isAspect(apex, a, "quincunx") && isAspect(apex, b, "quincunx")) {
          const orb = Math.max(asp(a, b)![1], asp(apex, a)![1], asp(apex, b)![1]);
          yods.push({ kind: "yod", bodies: [a, b, apex].sort(), apex, orb });
        }
      }
    }
  }

  // Suppress sub-patterns contained in a larger reported one.
  const subset = (small: string[], big: string[]) => small.every((x) => big.includes(x));
  const keptTSquares = tSquares.filter((t) => !grandCrosses.some((g) => subset(t.bodies, g.bodies)));
  const keptTrines = grandTrines.filter((g) => !kites.some((k) => subset(g.bodies, k.bodies)));

  out.push(...grandCrosses, ...mysticRectangles, ...kites, ...keptTSquares, ...keptTrines, ...yods);

  // Stelliums by sign and by house: three or more bodies sharing one.
  const bySign: Record<number, string[]> = {};
  for (const b of names) {
    const s = Math.floor(lon[b] / 30) % 12;
    (bySign[s] ??= []).push(b);
  }
  for (const s of Object.keys(bySign)) {
    const members = bySign[Number(s)];
    if (members.length >= 3) {
      out.push({ kind: "stellium_sign", bodies: [...members].sort(), sign: SIGNS[Number(s)], orb: 0 });
    }
  }

  const byHouse: Record<number, string[]> = {};
  for (const b of names) {
    const h = bodies[b].house;
    if (h != null) (byHouse[h] ??= []).push(b);
  }
  for (const h of Object.keys(byHouse)) {
    const members = byHouse[Number(h)];
    if (members.length >= 3) {
      out.push({ kind: "stellium_house", bodies: [...members].sort(), house: Number(h), orb: 0 });
    }
  }

  out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || cmpBodies(a.bodies, b.bodies));
  for (const p of out) p.orb = Math.round(p.orb * 1e4) / 1e4;
  return out;
}

/**
 * The aspect configurations present in a {@link Chart}: T-squares, grand trines,
 * grand crosses, yods, kites, mystic rectangles, and stelliums by sign and by
 * house. Bodies outside their fitted range (absent from the chart) are skipped.
 *
 * @param chart A {@link Chart} from {@link Engine.chart} / {@link Engine.chartAt}.
 * @param opts Orb overrides and an optional explicit body set.
 * @returns The configurations, most-complex first, each a {@link ChartPattern}.
 * @example
 * ```ts
 * const chart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
 * detectPatterns(chart); // [{ kind: "mystic_rectangle", bodies: [...], orb: 2.54 }, ...]
 * ```
 */
export function detectPatterns(chart: Chart, opts: PatternOptions = {}): ChartPattern[] {
  const bodies: Record<string, PatternBody> = {};
  for (const [name, p] of Object.entries(chart.bodies)) {
    if (p) bodies[name] = { lon: p.lon, house: p.house };
  }
  return detectPatternsIn(bodies, opts);
}
