/**
 * astroengine derived -- standard chart derivations built on the validated
 * primitives: returns, secondary progressions, solar arc directions, composite
 * charts, Davison charts.
 *
 * These are constructions on top of apparent positions (already checked against
 * Swiss Ephemeris), so this layer is time-mapping and arithmetic, not new
 * ephemeris. Mirrors the Python reference (astroengine/derived.py); the
 * golden fixtures pin the two together.
 */
import { mod, meanObliquity, jdTT, DEG } from "./core.js";
import { Engine, BodyId, Zodiac, SIGNS } from "./chart.js";
import { crossings } from "./events.js";
import { azAlt } from "./pheno.js";

export const TROPICAL_YEAR = 365.24219; // mean tropical year, days

/** Shorter-arc midpoint of two longitudes (degrees). */
export function midpointLon(a: number, b: number): number {
  const d = mod(b - a + 180, 360) - 180; // signed shortest a -> b
  return mod(a + d / 2, 360);
}

// ---------------------------------------------------------------- returns
/** UT JDs in [jdStart, jdEnd] when `body` returns to its natal longitude.
 *  Outer-planet returns can show three crossings around a retrograde loop. */
export function returns(
  engine: Engine, body: BodyId, natalJd: number,
  jdStart: number, jdEnd: number, zodiac: Zodiac = "tropical", maxHits = 60,
): number[] {
  const natalLon = engine.longitude(body, natalJd, { zodiac });
  return crossings(engine, body, natalLon, jdStart, jdEnd, zodiac, maxHits);
}

export function solarReturn(
  engine: Engine, natalJd: number, jdStart: number, jdEnd: number,
  zodiac: Zodiac = "tropical",
): number[] {
  return returns(engine, "sun", natalJd, jdStart, jdEnd, zodiac);
}

export function lunarReturn(
  engine: Engine, natalJd: number, jdStart: number, jdEnd: number,
  zodiac: Zodiac = "tropical",
): number[] {
  return returns(engine, "moon", natalJd, jdStart, jdEnd, zodiac);
}

// ----------------------------------------------- secondary progressions
/** The JD whose real positions are the secondary-progressed positions for the
 *  age (targetJd - natalJd): one day of motion per year of life. */
export function progressedJd(
  natalJd: number, targetJd: number, yearLength = TROPICAL_YEAR,
): number {
  return natalJd + (targetJd - natalJd) / yearLength;
}

export function progressedLongitude(
  engine: Engine, body: BodyId, natalJd: number, targetJd: number,
  yearLength = TROPICAL_YEAR, zodiac: Zodiac = "tropical",
): number {
  return engine.longitude(body, progressedJd(natalJd, targetJd, yearLength), { zodiac });
}

// ----------------------------------------------------------- solar arc
/** Solar-arc direction angle (degrees, forward): how far the secondary-
 *  progressed Sun has moved from the natal Sun. Add it to any natal longitude. */
export function solarArc(
  engine: Engine, natalJd: number, targetJd: number,
  yearLength = TROPICAL_YEAR, zodiac: Zodiac = "tropical",
): number {
  const pjd = progressedJd(natalJd, targetJd, yearLength);
  const natalSun = engine.longitude("sun", natalJd, { zodiac });
  const progSun = engine.longitude("sun", pjd, { zodiac });
  return mod(progSun - natalSun, 360); // Sun only moves forward
}

export function directedLongitude(
  engine: Engine, body: BodyId, natalJd: number, targetJd: number,
  yearLength = TROPICAL_YEAR, zodiac: Zodiac = "tropical",
): number {
  const arc = solarArc(engine, natalJd, targetJd, yearLength, zodiac);
  return mod(engine.longitude(body, natalJd, { zodiac }) + arc, 360);
}

// ----------------------------------------------------------- composite
/** Midpoint-method composite: the shorter-arc midpoint of each body's two
 *  longitudes. Angles compose the same way via midpointLon on the two ASC/MC. */
export function compositeLongitudes(
  engine: Engine, jdA: number, jdB: number, bodies: BodyId[],
  zodiac: Zodiac = "tropical",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const body of bodies) {
    const la = engine.longitude(body, jdA, { zodiac });
    const lb = engine.longitude(body, jdB, { zodiac });
    out[body] = midpointLon(la, lb);
  }
  return out;
}

// ----------------------------------------------------------- davison
/** Time and place for a Davison relationship chart: the temporal midpoint and
 *  the geographic midpoint (mean latitude, shorter-arc mean longitude). Compute
 *  a normal chart at these to get the Davison chart. Returns [jd, lat, lonEast]. */
export function davisonParams(
  jdA: number, jdB: number, latA: number, lonEastA: number,
  latB: number, lonEastB: number,
): [number, number, number] {
  const midJd = 0.5 * (jdA + jdB);
  const midLat = 0.5 * (latA + latB);
  let midLon = midpointLon(mod(lonEastA, 360), mod(lonEastB, 360));
  if (midLon > 180) midLon -= 360; // back to (-180, 180] east-longitude
  return [midJd, midLat, midLon];
}

// ----------------------------------------------------------- harmonics
/** The nth-harmonic longitude of a point: lon * n, wrapped to 360. */
export function harmonicLongitude(lon: number, n: number): number {
  return mod(lon * n, 360);
}

export function harmonicChart(
  engine: Engine, jd: number, bodies: BodyId[], n: number,
  zodiac: Zodiac = "tropical",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bodies) out[b] = harmonicLongitude(engine.longitude(b, jd, { zodiac }), n);
  return out;
}

// ----------------------------------------------------------- antiscia
/** Reflection across the solstice (Cancer-Capricorn) axis. */
export function antiscion(lon: number): number {
  return mod(180 - lon, 360);
}

/** Reflection across the equinox (Aries-Libra) axis. */
export function contraAntiscion(lon: number): number {
  return mod(-lon, 360);
}

// ------------------------------------------------- declination aspects
export type DeclinationKind = "parallel" | "contraparallel" | null;

/** Classify two declinations: parallel (same), contraparallel (opposite), null. */
export function declinationAspect(decA: number, decB: number, orb = 1.0): DeclinationKind {
  if (Math.abs(decA - decB) <= orb) return "parallel";
  if (Math.abs(decA + decB) <= orb) return "contraparallel";
  return null;
}

export interface DeclinationPair { a: string; b: string; kind: DeclinationKind }

export function declinationAspects(
  engine: Engine, bodies: BodyId[], jd: number, orb = 1.0,
): DeclinationPair[] {
  const decs: Record<string, number> = {};
  for (const b of bodies) decs[b] = engine.position(b, jd).dec;
  const out: DeclinationPair[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const kind = declinationAspect(decs[bodies[i]], decs[bodies[j]], orb);
      if (kind) out.push({ a: bodies[i], b: bodies[j], kind });
    }
  }
  return out;
}

// ----------------------------------------------------------- out of bounds
/** |declination| minus the mean obliquity, degrees. Positive = out of bounds. */
export function outOfBoundsMargin(engine: Engine, body: BodyId, jd: number): number {
  const dec = engine.position(body, jd).dec;
  const eps = meanObliquity(jdTT(jd)) / DEG;
  return Math.abs(dec) - eps;
}

export function outOfBounds(engine: Engine, body: BodyId, jd: number): boolean {
  return outOfBoundsMargin(engine, body, jd) > 0;
}

// ----------------------------------------------------------- dignities
const DOMICILE: Record<string, number[]> = {
  sun: [4], moon: [3], mercury: [2, 5], venus: [1, 6],
  mars: [0, 7], jupiter: [8, 11], saturn: [9, 10],
};
const EXALTATION: Record<string, number> = {
  sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6,
};

function signIndex(sign: number | string): number {
  return typeof sign === "number" ? sign : SIGNS.indexOf(sign);
}

/** Essential dignities of `body` in `sign`: domicile, exaltation, detriment,
 *  fall (the last two are the signs opposite domicile and exaltation). */
export function dignities(body: string, sign: number | string): string[] {
  const idx = signIndex(sign);
  const dom = DOMICILE[body] ?? [];
  const out: string[] = [];
  if (dom.includes(idx)) out.push("domicile");
  if (EXALTATION[body] === idx) out.push("exaltation");
  if (dom.map((d) => mod(d + 6, 12)).includes(idx)) out.push("detriment");
  if (body in EXALTATION && mod(EXALTATION[body] + 6, 12) === idx) out.push("fall");
  return out;
}

export function dignityOf(
  engine: Engine, body: BodyId, jd: number, zodiac: Zodiac = "tropical",
): string[] {
  const lon = engine.longitude(body, jd, { zodiac });
  return dignities(body, mod(Math.floor(lon / 30), 12));
}

// ----------------------------------------------------------- sect
const DIURNAL = new Set(["sun", "jupiter", "saturn"]);
const NOCTURNAL = new Set(["moon", "venus", "mars"]);

/** Diurnal when the Sun is above the horizon at the given place. */
export function isDayChart(
  engine: Engine, jd: number, lat: number, lonEast: number,
): boolean {
  const sun = engine.position("sun", jd);
  const [, alt] = azAlt(engine.data, sun.lon, sun.lat, jd, lat, lonEast);
  return alt > 0;
}

export function planetarySect(body: string): "diurnal" | "nocturnal" | null {
  if (DIURNAL.has(body)) return "diurnal";
  if (NOCTURNAL.has(body)) return "nocturnal";
  return null;
}

export function inSect(body: string, dayChart: boolean): boolean | null {
  const s = planetarySect(body);
  if (s === null) return null;
  return (s === "diurnal") === Boolean(dayChart);
}
