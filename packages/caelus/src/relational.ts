/**
 * astroengine relational -- diachronic and two-chart derivations for the
 * interpretation layer: transits vs natal, synastry, composite midpoints.
 *
 * Pure geometry on validated positions; no interpretation. Mirrors the MCP
 * transits/synastry/composite tools but returns structured hits the fact
 * projection can turn into citable atoms.
 */
import { mod } from "./core.js";
import {
  ASPECTS, BODIES, DEFAULT_ORBS, NOT_ASPECTABLE, SIGNS,
  type BodyId, type Chart, type Engine, type Zodiac,
} from "./chart.js";
import { aspectPhase, type AspectPhase } from "./electional.js";
import { compositeLongitudes } from "./derived.js";

/** A transiting body aspecting a natal point. */
export interface TransitHit {
  transit: string;
  natal: string;
  aspect: string;
  orb: number;
  phase: AspectPhase;
  strength: number;
  /** Natal house the transiting body occupies (by natal cusps). */
  natalHouse: number;
}

/** An inter-chart aspect between person A's body and person B's body. */
export interface SynastryAspectHit {
  a: string;
  b: string;
  aspect: string;
  orb: number;
  strength: number;
}

export interface SynastryOverlays {
  /** Person A's bodies in person B's houses. */
  aInB: Record<string, number>;
  /** Person B's bodies in person A's houses. */
  bInA: Record<string, number>;
}

/** A composite-chart body placement (midpoint method). */
export interface CompositePlacement {
  body: string;
  lon: number;
  sign: string;
  signDeg: number;
}

function houseIndex(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

function aspectHits(
  lonA: number, speedA: number, labelA: string,
  lonB: number, speedB: number, labelB: string,
  maxOrb: number, orbs: Record<string, number>,
): Array<{ a: string; b: string; aspect: string; orb: number; phase: AspectPhase; strength: number }> {
  const sep = Math.abs(mod(lonA - lonB + 180, 360) - 180);
  const out: Array<{ a: string; b: string; aspect: string; orb: number; phase: AspectPhase; strength: number }> = [];
  for (const [name, angle] of Object.entries(ASPECTS)) {
    const limit = Math.min(maxOrb, orbs[name] ?? maxOrb);
    const orb = Math.abs(sep - angle);
    if (orb > limit) continue;
    const orbRounded = Math.round(orb * 100) / 100;
    out.push({
      a: labelA, b: labelB, aspect: name, orb: orbRounded,
      phase: aspectPhase(lonA, speedA, lonB, speedB, angle),
      strength: Math.max(0, 1 - orbRounded / limit),
    });
  }
  return out;
}

/**
 * Transiting bodies aspecting a natal chart at `transitJd`. Natal longitudes are
 * fixed; phase reflects the transiting body's motion toward the natal point.
 */
export function transitAspects(
  natal: Chart, engine: Engine, transitJd: number,
  opts: { maxOrb?: number; zodiac?: Zodiac; orbs?: Record<string, number>; bodies?: BodyId[] } = {},
): TransitHit[] {
  const maxOrb = opts.maxOrb ?? 3;
  const orbs = opts.orbs ?? DEFAULT_ORBS;
  const zodiac = opts.zodiac ?? natal.zodiac;
  const bodies = opts.bodies ?? (BODIES as unknown as BodyId[]);
  const natalBodies = bodies.filter((b) => natal.bodies[b] && !NOT_ASPECTABLE.has(b));
  const out: TransitHit[] = [];
  for (const tb of bodies) {
    if (NOT_ASPECTABLE.has(tb)) continue;
    const tp = engine.position(tb, transitJd, { zodiac });
    const natalHouse = houseIndex(tp.lon, natal.cusps);
    for (const nb of natalBodies) {
      const nLon = natal.bodies[nb]!.lon;
      for (const hit of aspectHits(tp.lon, tp.speed, tb, nLon, 0, nb, maxOrb, orbs)) {
        out.push({
          transit: hit.a, natal: hit.b, aspect: hit.aspect,
          orb: hit.orb, phase: hit.phase, strength: hit.strength, natalHouse,
        });
      }
    }
  }
  return out;
}

/**
 * Inter-chart aspects between two natal charts (static snapshot; both speeds 0).
 */
export function synastryAspects(
  chartA: Chart, chartB: Chart, maxOrb = 4, orbs: Record<string, number> = DEFAULT_ORBS,
): SynastryAspectHit[] {
  const bodies = (BODIES as unknown as BodyId[]).filter(
    (b) => chartA.bodies[b] && chartB.bodies[b] && !NOT_ASPECTABLE.has(b),
  );
  const out: SynastryAspectHit[] = [];
  for (const ba of bodies) {
    const la = chartA.bodies[ba]!.lon;
    for (const bb of bodies) {
      const lb = chartB.bodies[bb]!.lon;
      for (const hit of aspectHits(la, 0, ba, lb, 0, bb, maxOrb, orbs)) {
        out.push({ a: hit.a, b: hit.b, aspect: hit.aspect, orb: hit.orb, strength: hit.strength });
      }
    }
  }
  return out;
}

/** House overlays both ways between two charts. */
export function synastryOverlays(chartA: Chart, chartB: Chart): SynastryOverlays {
  const bodies = (BODIES as unknown as BodyId[]).filter((b) => chartA.bodies[b] && chartB.bodies[b]);
  const aInB: Record<string, number> = {};
  const bInA: Record<string, number> = {};
  for (const b of bodies) {
    aInB[b] = houseIndex(chartA.bodies[b]!.lon, chartB.cusps);
    bInA[b] = houseIndex(chartB.bodies[b]!.lon, chartA.cusps);
  }
  return { aInB, bInA };
}

/**
 * Midpoint-composite placements for `bodies` from two birth instants.
 */
export function compositePlacements(
  engine: Engine, jdA: number, jdB: number,
  bodies: BodyId[] = BODIES as unknown as BodyId[], zodiac: Zodiac = "tropical",
): CompositePlacement[] {
  const lons = compositeLongitudes(engine, jdA, jdB, bodies, zodiac);
  return bodies.map((body) => {
    const lon = mod(lons[body], 360);
    const signIdx = Math.floor(lon / 30) % 12;
    return { body, lon, sign: SIGNS[signIdx], signDeg: mod(lon, 30) };
  });
}
