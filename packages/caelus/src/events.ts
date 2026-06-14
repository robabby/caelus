/**
 * astroengine events -- rise/set/meridian transits, zodiac crossings,
 * lunar phases, stations.
 *
 * Rise/set condition (matches Swiss Ephemeris defaults, calibrated against
 * swe_rise_trans at standard pressure/temperature): the topocentric true
 * altitude of the disc center equals -(R0 + topocentric semidiameter),
 * with R0 = 34.076 arcmin scaled by (pressure/1010)(283/(273+temp)). All
 * searches are bracketed sign changes refined by bisection; speeds come
 * from the same apparent-position pipeline as the chart API, so retrograde
 * loops and multiple crossings are found, not assumed away.
 */
import {
  DEG, mod, jdTT, equatorial, trueObliquity, topocentricEcl, EngineData,
} from "./core.js";
import { gast } from "./houses.js";
import { Engine, BodyId, Zodiac } from "./chart.js";
import { DIAMETER_KM } from "./pheno.js";

const TWO_PI = 2 * Math.PI;
const KM_PER_AU = 149597870.7;
const R0_ARCMIN = 34.076; // horizon refraction at 1010 hPa / 10 C (vs SE)

export type RiseKind = "rise" | "set" | "mtransit" | "itransit";

export interface RiseSetOptions {
  altM?: number;
  pressure?: number;
  tempC?: number;
  searchDays?: number;
  /** Rise/set of the disc center instead of the upper limb. */
  discCenter?: boolean;
}

function topoAltHa(
  engine: Engine, body: BodyId, jdUt: number,
  latDeg: number, lonDeg: number, altM: number,
): [number, number, number | null] {
  const jde = jdTT(jdUt);
  let [lon, lat, dist] = engine.ecliptic(body, jde);
  const eps = trueObliquity(engine.data, jde);
  const lst = mod(gast(engine.data, jdUt) + lonDeg * DEG, TWO_PI);
  if (dist !== null) {
    [lon, lat, dist] = topocentricEcl(lon, lat, dist, lst, latDeg * DEG, altM, eps);
  }
  const [ra, dec] = equatorial(lon, lat, eps);
  const ha = mod(lst - ra + Math.PI, TWO_PI) - Math.PI;
  const phi = latDeg * DEG;
  const alt = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha),
  );
  return [alt, ha, dist];
}

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

/**
 * The next rise, set, or meridian transit of a body after `jdStart`, as a
 * Julian Day (UT). Accounts for the body's apparent radius, atmospheric
 * refraction, and observer altitude.
 *
 * @param engine The engine used to evaluate positions.
 * @param body A body id from {@link Engine.bodies}.
 * @param jdStart Search start, Julian Day (UT). The result is the first event
 *   strictly after this instant.
 * @param latDeg Observer latitude in degrees, north positive.
 * @param lonDeg Observer longitude in degrees, east positive.
 * @param kind `"rise"`, `"set"`, `"mtransit"` (upper/meridian transit), or
 *   `"itransit"` (lower transit). Defaults to `"rise"`.
 * @param opts `altM` (observer altitude, m), `pressure` (hPa), `tempC`, and
 *   `searchDays` (how far ahead to look; defaults to 2).
 * @returns The event time as a Julian Day (UT), or `null` when it does not
 *   occur in the window (e.g. polar day or night).
 * @example
 * ```ts
 * // Next sunrise over London after 2025-06-01
 * const jd = riseSet(engine, "sun", julianDay(2025, 6, 1), 51.5, -0.13, "rise");
 * ```
 */
export function riseSet(
  engine: Engine, body: BodyId, jdStart: number,
  latDeg: number, lonDeg: number, kind: RiseKind = "rise",
  opts: RiseSetOptions = {},
): number | null {
  const altM = opts.altM ?? 0.0;
  const pressure = opts.pressure ?? 1013.25;
  const tempC = opts.tempC ?? 15.0;
  const searchDays = opts.searchDays ?? 2.0;
  const scale = (pressure / 1010.0) * (283.0 / (273.0 + tempC));

  if (kind === "mtransit" || kind === "itransit") {
    const target = kind === "mtransit" ? 0.0 : Math.PI;
    const g = (t: number): number => {
      const [, ha] = topoAltHa(engine, body, t, latDeg, lonDeg, altM);
      return mod(ha - target + Math.PI, TWO_PI) - Math.PI;
    };
    const step = 1.0 / 48;
    let prev = g(jdStart);
    for (let t = jdStart + step; t <= jdStart + searchDays; t += step) {
      const cur = g(t);
      if (prev * cur < 0 && Math.abs(cur - prev) < Math.PI) {
        return bisect(g, t - step, t);
      }
      prev = cur;
    }
    return null;
  }

  const f = (t: number): number => {
    const [alt, , dist] = topoAltHa(engine, body, t, latDeg, lonDeg, altM);
    let sd = 0.0;
    const diam = DIAMETER_KM[body];
    if (!opts.discCenter && diam !== undefined && dist !== null) {
      sd = Math.asin(diam / (2 * dist * KM_PER_AU));
    }
    const h0 = -((R0_ARCMIN / 60.0) * scale * DEG + sd);
    return alt - h0;
  };
  const step = 1.0 / 48; // 30 min: well under the fastest crossing scale
  let prev = f(jdStart);
  for (let t = jdStart + step; t <= jdStart + searchDays; t += step) {
    const cur = f(t);
    if ((kind === "rise" && prev < 0 && cur >= 0)
      || (kind === "set" && prev > 0 && cur <= 0)) {
      return bisect(f, t - step, t);
    }
    prev = cur;
  }
  return null;
}

/** UT JDs where the body's apparent longitude crosses targetLon (degrees)
 *  in [jdStart, jdEnd]. Retrograde bodies can cross a degree three times;
 *  every crossing is returned in time order. */
export function crossings(
  engine: Engine, body: BodyId, targetLon: number,
  jdStart: number, jdEnd: number, zodiac: Zodiac = "tropical", maxHits = 60,
): number[] {
  const f = (t: number): number =>
    mod(engine.longitude(body, t, { zodiac }) - targetLon + 180, 360) - 180;
  const fast = body === "moon" || body === "mean_node"
    || body === "true_node" || body === "mean_lilith" || body === "true_lilith";
  const step = fast ? 0.25 : 1.0;
  const out: number[] = [];
  let prev = f(jdStart);
  for (let t = jdStart + step; t <= jdEnd && out.length < maxHits; t += step) {
    const cur = f(t);
    if (prev * cur < 0 && Math.abs(cur - prev) < 180) {
      out.push(bisect(f, t - step, t));
    }
    prev = cur;
  }
  return out;
}

export type PhaseName = "new" | "first_quarter" | "full" | "last_quarter";

/**
 * Every principal lunar phase (new, first quarter, full, last quarter) within
 * `[jdStart, jdEnd]`, sorted by time. Found from the Sun–Moon elongation
 * crossing 0°/90°/180°/270°.
 *
 * @param engine The engine used to evaluate positions.
 * @param jdStart Start of the window, Julian Day (UT).
 * @param jdEnd End of the window, Julian Day (UT).
 * @param maxHits Cap on the number of phases returned. Defaults to 60.
 * @returns Sorted `[jdUt, phase]` pairs, where `phase` is one of
 *   {@link PhaseName}.
 * @example
 * ```ts
 * const phases = lunarPhases(engine, julianDay(2025, 1, 1), julianDay(2025, 2, 1));
 * // [[jd, "new"], [jd, "first_quarter"], ...]
 * ```
 */
export function lunarPhases(
  engine: Engine, jdStart: number, jdEnd: number, maxHits = 60,
): Array<[number, PhaseName]> {
  const elong = (t: number): number =>
    mod(engine.longitude("moon", t) - engine.longitude("sun", t), 360);
  const names: Array<[number, PhaseName]> = [
    [0, "new"], [90, "first_quarter"], [180, "full"], [270, "last_quarter"],
  ];
  const out: Array<[number, PhaseName]> = [];
  const step = 0.25;
  for (const [angle, name] of names) {
    const f = (t: number): number => mod(elong(t) - angle + 180, 360) - 180;
    let prev = f(jdStart);
    for (let t = jdStart + step; t <= jdEnd && out.length < maxHits; t += step) {
      const cur = f(t);
      if (prev * cur < 0 && Math.abs(cur - prev) < 180) {
        out.push([bisect(f, t - step, t), name]);
      }
      prev = cur;
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** Times the body stations (speed crosses zero): [jdUt, direction the body
 *  turns]. Sun and Moon never station. Station timing is ill-conditioned:
 *  expect minute-level differences between ephemerides. */
export function stations(
  engine: Engine, body: BodyId, jdStart: number, jdEnd: number, maxHits = 30,
): Array<[number, "retrograde" | "direct"]> {
  const h = 0.25;
  const speed = (t: number): number => {
    const l0 = engine.longitude(body, t - h);
    const l1 = engine.longitude(body, t + h);
    return (mod(l1 - l0 + 540, 360) - 180) / (2 * h);
  };
  const step = 2.0;
  const out: Array<[number, "retrograde" | "direct"]> = [];
  let prev = speed(jdStart);
  for (let t = jdStart + step; t <= jdEnd && out.length < maxHits; t += step) {
    const cur = speed(t);
    if (prev * cur < 0) {
      out.push([bisect(speed, t - step, t), prev > 0 ? "retrograde" : "direct"]);
    }
    prev = cur;
  }
  return out;
}

/** Gauquelin sector (1..36, float) from rise/set times of the disc center
 *  with refraction (Swiss Ephemeris method 3). Sectors run from rise: 1-18
 *  above the horizon, 19-36 below. Null in polar no-rise/no-set
 *  conditions. */
export function gauquelinSector(
  engine: Engine, body: BodyId, jdUt: number, latDeg: number, lonDeg: number,
): number | null {
  const surrounding = (kind: RiseKind): [number | null, number | null] => {
    let t = riseSet(engine, body, jdUt - 1.3, latDeg, lonDeg, kind,
      { discCenter: true });
    let prev: number | null = null;
    while (t !== null && t <= jdUt) {
      prev = t;
      t = riseSet(engine, body, t + 1e-4, latDeg, lonDeg, kind,
        { discCenter: true });
    }
    return [prev, t];
  };
  const [prevRise] = surrounding("rise");
  const [prevSet, nextSetA] = surrounding("set");
  if (prevRise === null || prevSet === null) return null;
  if (prevRise > prevSet) {
    if (nextSetA === null) return null;
    return 1 + (18 * (jdUt - prevRise)) / (nextSetA - prevRise);
  }
  const [, nextRise] = surrounding("rise");
  if (nextRise === null) return null;
  return 19 + (18 * (jdUt - prevSet)) / (nextRise - prevSet);
}
