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
import { gast } from "./houses.js";
import { DEG, mod } from "./core.js";
import type { Engine, BodyId } from "./chart.js";

export const PARAN_ANGLES = ["rise", "mtransit", "set", "itransit"] as const;
export const DEFAULT_PARAN_BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

const TWO_PI = 2 * Math.PI;
// Local sidereal time advances one turn per sidereal day.
const SID_RATE = 360.98564736629 * DEG;
// Standard rise/set: the geometric horizon lifted by ~34' of refraction.
const RISE_ALT = -0.5667 * DEG;

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

/** The UT instant in `[jd, jd+1)` when apparent sidereal time = `target` (rad). */
function timeAtLst(engine: Engine, jd: number, target: number): number {
  const dlst = mod(target - gast(engine.data, jd), TWO_PI);
  let t = jd + dlst / SID_RATE;
  for (let i = 0; i < 2; i++) {
    const err = mod(gast(engine.data, t) - target + Math.PI, TWO_PI) - Math.PI;
    t -= err / SID_RATE;
  }
  return t;
}

/**
 * The four angle crossings of a fixed `star` over the day from `jd` at latitude
 * `lat`: the meridian transits always occur; `rise`/`set` are absent when the
 * star is circumpolar or never rises.
 */
export function starAngleTimes(engine: Engine, star: string, jd: number, lat: number): Record<string, number> {
  const fs = engine.fixedStar(star, jd);
  const alpha = mod(fs.ra * DEG, TWO_PI);
  const delta = fs.dec * DEG;
  const phi = lat * DEG;
  const out: Record<string, number> = {
    mtransit: timeAtLst(engine, jd, alpha),
    itransit: timeAtLst(engine, jd, mod(alpha + Math.PI, TWO_PI)),
  };
  const denom = Math.cos(phi) * Math.cos(delta);
  if (denom !== 0) {
    const cosH0 = (Math.sin(RISE_ALT) - Math.sin(phi) * Math.sin(delta)) / denom;
    if (cosH0 >= -1 && cosH0 <= 1) {
      const h0 = Math.acos(cosH0);
      out.rise = timeAtLst(engine, jd, mod(alpha - h0, TWO_PI));
      out.set = timeAtLst(engine, jd, mod(alpha + h0, TWO_PI));
    }
  }
  return out;
}

/** One star-to-body paran: a fixed star and a body on angles at ~the same time. */
export interface StarParan {
  star: string;
  star_angle: string;
  body: string;
  body_angle: string;
  jd: number;
  gap_min: number;
}

/**
 * Star-to-body parans over the day from `jd` (UT) at latitude `lat`: a fixed
 * star and a moving body simultaneously on angles within `toleranceMin`
 * minutes — Brady's fixed-star parans. Ordered by (star, body, jd).
 *
 * @param engine An engine whose data pack includes the fixed-star catalog.
 * @param jd Julian Day in UT (the 24-hour window starts here).
 * @param lat Geographic latitude in degrees, north positive.
 * @param stars Catalog star names to test (see {@link Engine.starNames}).
 * @param bodies Bodies to consider; defaults to the seven classical planets.
 * @param toleranceMin The paran window in minutes (default 30).
 */
export function starParans(
  engine: Engine, jd: number, lat: number, stars: string[],
  bodies: string[] = DEFAULT_PARAN_BODIES, toleranceMin = 30,
): StarParan[] {
  const bodyEvents: Array<[string, string, number]> = [];
  for (const b of bodies) {
    for (const kind of PARAN_ANGLES) {
      const t = riseSet(engine, b as BodyId, jd, lat, 0, kind);
      if (t !== null && t < jd + 1) bodyEvents.push([b, kind, t]);
    }
  }

  const out: StarParan[] = [];
  for (const s of stars) {
    const at = starAngleTimes(engine, s, jd, lat);
    for (const [sa, ts] of Object.entries(at)) {
      if (!(ts >= jd && ts < jd + 1)) continue;
      for (const [b, ba, tb] of bodyEvents) {
        const gap = Math.abs(ts - tb) * 1440;
        if (gap <= toleranceMin) {
          out.push({
            star: s, star_angle: sa, body: b, body_angle: ba,
            jd: Math.round(((ts + tb) / 2) * 1e6) / 1e6,
            gap_min: Math.round(gap * 1e4) / 1e4,
          });
        }
      }
    }
  }

  out.sort((x, y) =>
    (x.star < y.star ? -1 : x.star > y.star ? 1 : x.body < y.body ? -1 : x.body > y.body ? 1 : x.jd - y.jd));
  return out;
}
