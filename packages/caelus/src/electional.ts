/**
 * astroengine electional -- electional building blocks on the validated
 * primitives: applying/separating aspects, solar phase (combustion/cazimi),
 * planetary hours, void-of-course Moon, and house placement.
 *
 * Arithmetic and time-mapping on apparent positions already checked against
 * Swiss Ephemeris and JPL Horizons. Mirrors the Python reference
 * (astroengine/electional.py); the golden fixtures pin the two together.
 */
import { mod } from "./core.js";
import { Engine, BodyId, Zodiac, SIGNS, ASPECTS, DEFAULT_ORBS } from "./chart.js";
import { riseSet } from "./events.js";

/** Chaldean order for planetary hours (slowest to fastest). */
const CHALDEAN = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
/** Weekday ruler, index 0 = Sunday (Meeus day-of-week convention). */
const DAY_RULERS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

export const CAZIMI_DEG = 0.2833; // 17 arcminutes
export const COMBUST_DEG = 8.5;
export const UNDER_BEAMS_DEG = 15.0;

// Local copy of the events.ts bisection (identical), to keep the same roots.
function bisect(f: (t: number) => number, a: number, b: number, iters = 45): number {
  let fa = f(a);
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    if (fa * f(m) <= 0) {
      b = m;
    } else {
      a = m;
      fa = f(a);
    }
  }
  return (a + b) / 2;
}

function wrap180(x: number): number {
  return mod(x + 180.0, 360.0) - 180.0;
}

/** Signed shortest angle from b to a, in (-180, 180] degrees. */
export function signedElongation(lonA: number, lonB: number): number {
  return wrap180(lonA - lonB);
}

/** Unsigned angular separation in [0, 180] degrees. */
export function separation(lonA: number, lonB: number): number {
  return Math.abs(wrap180(lonA - lonB));
}

// ------------------------------------------------------ applying / separating
export type AspectPhase = "applying" | "separating" | "exact";

/** Applying/separating/exact for the aspect (degrees) between body a and body b,
 *  from their longitudes and longitude speeds (deg/day). Applying = the orb to
 *  the exact aspect is closing. */
export function aspectPhase(
  lonA: number, speedA: number, lonB: number, speedB: number, aspectDeg: number,
): AspectPhase {
  const e = wrap180(lonA - lonB);
  const sep = Math.abs(e);
  const dsepDt = (e >= 0.0 ? 1.0 : -1.0) * (speedA - speedB);
  const orb = sep - aspectDeg;
  if (Math.abs(orb) < 1e-9) return "exact";
  const dAbsOrbDt = (orb >= 0.0 ? 1.0 : -1.0) * dsepDt;
  return dAbsOrbDt < 0.0 ? "applying" : "separating";
}

export interface AspectMatch {
  aspect: string;
  orb: number;
  separation: number;
  phase: AspectPhase;
}

/** The tightest major aspect between two bodies at jd, within orb, or null.
 *  orb is the signed distance from exact (degrees). */
export function aspectBetween(
  engine: Engine, bodyA: BodyId, bodyB: BodyId, jdUt: number,
  zodiac: Zodiac = "tropical", orbs: Record<string, number> = DEFAULT_ORBS,
): AspectMatch | null {
  const pa = engine.position(bodyA, jdUt, { zodiac });
  const pb = engine.position(bodyB, jdUt, { zodiac });
  const sep = separation(pa.lon, pb.lon);
  let best: [string, number] | null = null;
  for (const [name, deg] of Object.entries(ASPECTS)) {
    const orb = sep - deg;
    if (Math.abs(orb) <= (orbs[name] ?? 0.0)) {
      if (best === null || Math.abs(orb) < Math.abs(best[1])) best = [name, orb];
    }
  }
  if (best === null) return null;
  const [name, orb] = best;
  return {
    aspect: name,
    orb,
    separation: sep,
    phase: aspectPhase(pa.lon, pa.speed, pb.lon, pb.speed, ASPECTS[name]),
  };
}

// ---------------------------------------------------- solar phase (combustion)
export type SolarPhase = "cazimi" | "combust" | "under_beams" | null;

/** Ecliptic-longitude separation between a body and the Sun (degrees). */
export function solarElongation(
  engine: Engine, body: BodyId, jdUt: number, zodiac: Zodiac = "tropical",
): number {
  return separation(
    engine.longitude(body, jdUt, { zodiac }),
    engine.longitude("sun", jdUt, { zodiac }),
  );
}

/** cazimi / combust / under_beams / null for a body's nearness to the Sun by
 *  ecliptic longitude. The Sun itself returns null. */
export function solarPhase(
  engine: Engine, body: BodyId, jdUt: number, zodiac: Zodiac = "tropical",
  cazimi = CAZIMI_DEG, combust = COMBUST_DEG, underBeams = UNDER_BEAMS_DEG,
): SolarPhase {
  if (body === "sun") return null;
  const sep = solarElongation(engine, body, jdUt, zodiac);
  if (sep <= cazimi) return "cazimi";
  if (sep <= combust) return "combust";
  if (sep <= underBeams) return "under_beams";
  return null;
}

// ----------------------------------------------------------- planetary hours
export interface PlanetaryHour {
  ruler: string;
  kind: "day" | "night";
  hour: number;
  dayRuler: string;
  start: number;
  end: number;
}

/** The planetary hour containing jdUt at a place, or null at latitudes where
 *  the Sun does not rise or set on the day in question. */
export function planetaryHour(
  engine: Engine, jdUt: number, lat: number, lonEast: number,
): PlanetaryHour | null {
  let sr = riseSet(engine, "sun", jdUt - 1.0, lat, lonEast, "rise");
  if (sr === null) return null;
  let nxt = riseSet(engine, "sun", sr + 0.01, lat, lonEast, "rise");
  while (nxt !== null && nxt <= jdUt) {
    sr = nxt;
    nxt = riseSet(engine, "sun", sr + 0.01, lat, lonEast, "rise");
  }
  if (sr > jdUt) return null;
  const dayStart = sr;
  const dayEnd = riseSet(engine, "sun", dayStart + 0.01, lat, lonEast, "set");
  if (dayEnd === null) return null;
  const nightEnd = riseSet(engine, "sun", dayEnd + 0.01, lat, lonEast, "rise");
  if (nightEnd === null) return null;

  let span: number;
  let kind: "day" | "night";
  let hourNumber: number;
  let start: number;
  if (jdUt < dayEnd) {
    span = (dayEnd - dayStart) / 12.0;
    const idx = Math.min(Math.floor((jdUt - dayStart) / span), 11);
    kind = "day";
    hourNumber = idx;
    start = dayStart + idx * span;
  } else {
    span = (nightEnd - dayEnd) / 12.0;
    const idx = Math.min(Math.floor((jdUt - dayEnd) / span), 11);
    kind = "night";
    hourNumber = 12 + idx;
    start = dayEnd + idx * span;
  }

  const weekday = Math.floor(dayStart + 1.5) % 7; // 0 = Sunday
  const dayRuler = DAY_RULERS[weekday];
  const ruler = CHALDEAN[(CHALDEAN.indexOf(dayRuler) + hourNumber) % 7];
  return { ruler, kind, hour: hourNumber + 1, dayRuler, start, end: start + span };
}

// --------------------------------------------------------- void-of-course Moon
function perfections(
  engine: Engine, bodyA: BodyId, bodyB: BodyId, aspectDeg: number,
  jdStart: number, jdEnd: number, zodiac: Zodiac, step: number,
): number[] {
  const roots: number[] = [];
  const orientations = aspectDeg !== 0.0 && aspectDeg !== 180.0 ? [1, -1] : [1];
  for (const orient of orientations) {
    const f = (t: number): number => {
      const la = engine.longitude(bodyA, t, { zodiac });
      const lb = engine.longitude(bodyB, t, { zodiac });
      return mod(la - lb - orient * aspectDeg + 180.0, 360.0) - 180.0;
    };
    let prev = f(jdStart);
    for (let t = jdStart + step; t <= jdEnd; t += step) {
      const cur = f(t);
      if (prev * cur < 0.0 && Math.abs(cur - prev) < 180.0) {
        roots.push(bisect(f, t - step, t));
      }
      prev = cur;
    }
  }
  roots.sort((a, b) => a - b);
  return roots;
}

export interface VoidOfCourse {
  isVoid: boolean;
  sign: string;
  signExit: number;
  nextAspect: number | null;
}

/** Void-of-course state of the Moon at jdUt: void from its last perfecting
 *  aspect to a traditional planet (Sun..Saturn) until it leaves the sign it
 *  occupies at jdUt. */
export function voidOfCourse(
  engine: Engine, jdUt: number, zodiac: Zodiac = "tropical", maxDays = 14.0,
): VoidOfCourse {
  const moon = engine.longitude("moon", jdUt, { zodiac });
  const sign = mod(Math.floor(moon / 30), 12);
  const boundary = mod((sign + 1) * 30.0, 360.0);

  const edge = (t: number): number =>
    mod(engine.longitude("moon", t, { zodiac }) - boundary + 180.0, 360.0) - 180.0;
  let signExit: number | null = null;
  const step = 0.125;
  let prev = edge(jdUt);
  for (let t = jdUt + step; t <= jdUt + maxDays; t += step) {
    const cur = edge(t);
    if (prev * cur < 0.0 && Math.abs(cur - prev) < 180.0) {
      signExit = bisect(edge, t - step, t);
      break;
    }
    prev = cur;
  }
  if (signExit === null) signExit = jdUt + maxDays;

  let nextAspect: number | null = null;
  for (const planet of ["sun", "mercury", "venus", "mars", "jupiter", "saturn"]) {
    for (const deg of Object.values(ASPECTS)) {
      for (const jd of perfections(engine, "moon", planet, deg, jdUt, signExit, zodiac, 0.125)) {
        if (jd > jdUt && (nextAspect === null || jd < nextAspect)) nextAspect = jd;
      }
    }
  }
  return {
    isVoid: nextAspect === null,
    sign: SIGNS[sign],
    signExit,
    nextAspect,
  };
}

// -------------------------------------------------------------- house helpers
/** 1-based house number for an ecliptic longitude (degrees) given the twelve
 *  cusps (degrees), wrapping across 0. */
export function houseOf(lon: number, cusps: number[]): number {
  lon = mod(lon, 360.0);
  for (let i = 0; i < 12; i++) {
    const a = mod(cusps[i], 360.0);
    const b = mod(cusps[(i + 1) % 12], 360.0);
    const span = mod(b - a, 360.0);
    if (span === 0.0) continue;
    if (mod(lon - a, 360.0) < span) return i + 1;
  }
  return 12;
}

/** angular / succedent / cadent for a 1-based house number. */
export function angularity(house: number): "angular" | "succedent" | "cadent" {
  return (["angular", "succedent", "cadent"] as const)[(house - 1) % 3];
}
