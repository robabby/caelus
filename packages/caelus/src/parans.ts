/**
 * Paranatellonta (parans): co-angular bodies.
 *
 * Two bodies are in paran on a given day at a given latitude when both are
 * simultaneously on one of the four angles: rising, culminating (upper
 * meridian), setting, or anti-culminating (lower meridian) — the relationship
 * behind the fixed-star parans of Brady's tradition, computed here for the
 * moving bodies.
 *
 * Pure positional astronomy over the validated rise/set/transit times, with a
 * stated tolerance (not a hidden convention). Longitude-independent, so latitude
 * alone is needed. Port of the Python reference `astroengine.parans`, pinned by
 * `parans-golden`.
 */
import { riseSet } from "./events.js";
import type { Engine, BodyId } from "./chart.js";

export const PARAN_ANGLES = ["rise", "mtransit", "set", "itransit"] as const;
export const DEFAULT_PARAN_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

/** One co-angular pair: bodies `a` and `b` on the named angles at ~the same time. */
export interface Paran {
  a: string;
  a_angle: string;
  b: string;
  b_angle: string;
  /** Midpoint instant of the two angle crossings, Julian Day (UT). */
  jd: number;
  /** Gap between the two crossings, minutes. */
  gap_min: number;
}

/**
 * Co-angular pairs over the 24 hours from `jd` (UT) at latitude `lat`: every
 * pair of different bodies whose angle crossings fall within `toleranceMin`
 * minutes. Ordered by (a, b, jd), with `a` < `b` by name.
 *
 * @param engine The engine used to evaluate rise/set/transit times.
 * @param jd Julian Day in UT (the 24-hour window starts here).
 * @param lat Geographic latitude in degrees, north positive.
 * @param bodies Bodies to consider; defaults to the seven classical planets.
 * @param toleranceMin The paran window in minutes (default 30).
 * @returns The co-angular pairs as {@link Paran} objects.
 */
export function parans(
  engine: Engine, jd: number, lat: number,
  bodies: string[] = DEFAULT_PARAN_BODIES, toleranceMin = 30,
): Paran[] {
  const events: Array<[string, string, number]> = [];
  for (const b of bodies) {
    for (const kind of PARAN_ANGLES) {
      const t = riseSet(engine, b as BodyId, jd, lat, 0, kind);
      if (t !== null && t < jd + 1) events.push([b, kind, t]);
    }
  }

  const out: Paran[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const [ab, aa, ta] = events[i];
      const [bb, ba, tb] = events[j];
      if (ab === bb) continue;
      const gap = Math.abs(ta - tb) * 1440;
      if (gap > toleranceMin) continue;
      const [pa, paa, pb, pba] = ab <= bb ? [ab, aa, bb, ba] : [bb, ba, ab, aa];
      out.push({
        a: pa, a_angle: paa, b: pb, b_angle: pba,
        jd: Math.round(((ta + tb) / 2) * 1e6) / 1e6,
        gap_min: Math.round(gap * 1e4) / 1e4,
      });
    }
  }

  out.sort((x, y) =>
    (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : x.jd - y.jd));
  return out;
}
