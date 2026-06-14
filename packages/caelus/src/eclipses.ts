/**
 * astroengine eclipses -- solar and lunar eclipse search.
 *
 * Lunar: direct shadow geometry at the anti-solar point with Danjon's
 * enlargement (lunar parallax x 86/85 on the flattened Earth) — the rule
 * Swiss Ephemeris uses, recovered empirically: magnitudes match to 0.001,
 * types exactly; times of maximum to ~9 s (contact times typically <=15 s,
 * up to ~2 min for grazing geometries where the crossing flattens).
 *
 * Solar (global): shadow-axis geometry. gamma = closest approach of the
 * Sun-Moon axis to the geocenter in Earth radii; the umbral cone's reach
 * at the surface separates total from annular, a sign change along the
 * track marks hybrids. Types match Swiss Ephemeris exactly over decades.
 * Local circumstances (where/visibility) are not computed here.
 */
import { ARCSEC, jdTT, mod } from "./core.js";
import { Engine } from "./chart.js";

const KM_PER_AU = 149597870.7;
const R_EARTH = 6378.14;
const R_SUN = 696000.0;
const R_MOON = 1737.4;
const PI_SUN = 8.794 * ARCSEC;
const DANJON = (1 + 1 / 85.0) * 0.99834;

export interface LunarEclipse {
  tMax: number;
  type: "total" | "partial" | "penumbral";
  magUmbral: number;
  magPenumbral: number;
  penumbralBegin: number | null; penumbralEnd: number | null;
  partialBegin: number | null; partialEnd: number | null;
  totalBegin: number | null; totalEnd: number | null;
}

export interface SolarEclipse {
  tMax: number;
  type: "total" | "annular" | "hybrid" | "partial";
  gamma: number;
  begin: number;
  end: number;
}

function lunarGeom(
  engine: Engine, jd: number,
): [number, number, number, number] {
  const jde = jdTT(jd);
  const [slon, slat, sdist] = engine.ecliptic("sun", jde);
  const [mlon, mlat, mdist] = engine.ecliptic("moon", jde);
  const alon = mod(slon + Math.PI, 2 * Math.PI);
  const alat = -slat;
  const cosd = Math.sin(alat) * Math.sin(mlat)
    + Math.cos(alat) * Math.cos(mlat) * Math.cos(alon - mlon);
  const theta = Math.acos(Math.max(-1, Math.min(1, cosd)));
  const mkm = mdist! * KM_PER_AU;
  const piEff = DANJON * Math.asin(R_EARTH / mkm);
  const sM = Math.asin(R_MOON / mkm);
  const sS = Math.asin(R_SUN / (sdist! * KM_PER_AU));
  return [theta, piEff - sS + PI_SUN, piEff + sS + PI_SUN, sM];
}

function solarGeom(
  engine: Engine, jd: number,
): [number, number, number, number, number] {
  const jde = jdTT(jd);
  const [slon, slat, sdist] = engine.ecliptic("sun", jde);
  const [mlon, mlat, mdist] = engine.ecliptic("moon", jde);
  const vec = (lon: number, lat: number, r: number): number[] => [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
  ];
  const S = vec(slon, slat, sdist! * KM_PER_AU);
  const M = vec(mlon, mlat, mdist! * KM_PER_AU);
  const SM = [M[0] - S[0], M[1] - S[1], M[2] - S[2]];
  const smn = Math.sqrt(SM[0] ** 2 + SM[1] ** 2 + SM[2] ** 2);
  const d = SM.map((c) => c / smn);
  const t0 = -(M[0] * d[0] + M[1] * d[1] + M[2] * d[2]);
  const P = [M[0] + t0 * d[0], M[1] + t0 * d[1], M[2] + t0 * d[2]];
  const dAxis = Math.sqrt(P[0] ** 2 + P[1] ** 2 + P[2] ** 2);
  const f1 = Math.asin((R_SUN + R_MOON) / smn);
  const f2 = Math.asin((R_SUN - R_MOON) / smn);
  const rPen = (R_MOON / Math.tan(f1) + t0) * Math.tan(f1);
  const rUmb = (R_MOON / Math.tan(f2) - t0) * Math.tan(f2);
  return [dAxis, rPen, rUmb, t0, f2];
}

function minimize(f: (t: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

function bisect(f: (t: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 50; i++) {
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

function syzygies(
  engine: Engine, jdStart: number, jdEnd: number, angle: number,
): number[] {
  const f = (t: number): number => {
    const e = mod(engine.longitude("moon", t) - engine.longitude("sun", t), 360);
    return mod(e - angle + 180, 360) - 180;
  };
  const out: number[] = [];
  const step = 5.0;
  let prev = f(jdStart);
  for (let t = jdStart + step; t <= jdEnd + step; t += step) {
    const cur = f(t);
    if (prev * cur < 0 && Math.abs(cur - prev) < 180) {
      out.push(bisect(f, t - step, t));
    }
    prev = cur;
  }
  return out;
}

/** Lunar eclipses in [jdStart, jdEnd] (UT JDs). */
export function lunarEclipses(
  engine: Engine, jdStart: number, jdEnd: number,
): LunarEclipse[] {
  const out: LunarEclipse[] = [];
  for (const tFull of syzygies(engine, jdStart - 1, jdEnd + 1, 180.0)) {
    const tMax = minimize((t) => lunarGeom(engine, t)[0], tFull - 0.3, tFull + 0.3);
    const [theta, u, pen, sM] = lunarGeom(engine, tMax);
    const magU = (u + sM - theta) / (2 * sM);
    const magP = (pen + sM - theta) / (2 * sM);
    if (magP <= 0 || tMax < jdStart || tMax > jdEnd) continue;
    const kind = magU >= 1 ? "total" : magU > 0 ? "partial" : "penumbral";
    const cross = (idx: 1 | 2, sign: 1 | -1): [number, number] => {
      const f = (t: number): number => {
        const g = lunarGeom(engine, t);
        return g[0] - (g[idx] + sign * g[3]);
      };
      return [bisect(f, tMax - 0.35, tMax), bisect(f, tMax, tMax + 0.35)];
    };
    const [penB, penE] = cross(2, 1);
    const [parB, parE] = magU > 0 ? cross(1, 1) : [null, null];
    const [totB, totE] = magU >= 1 ? cross(1, -1) : [null, null];
    out.push({
      tMax, type: kind,
      magUmbral: Math.max(magU, 0), magPenumbral: magP,
      penumbralBegin: penB, penumbralEnd: penE,
      partialBegin: parB, partialEnd: parE,
      totalBegin: totB, totalEnd: totE,
    });
  }
  return out;
}

/**
 * Solar eclipses in `[jdStart, jdEnd]`, with global circumstances (not
 * local visibility). Each new Moon in the window is tested for an eclipse and,
 * when found, classified by the Moon's shadow geometry.
 *
 * @param engine The engine used to evaluate positions.
 * @param jdStart Start of the window, Julian Day (UT).
 * @param jdEnd End of the window, Julian Day (UT).
 * @returns {@link SolarEclipse} records: `tMax` (greatest eclipse, JD UT),
 *   `type` (`"total"`/`"annular"`/`"hybrid"`/`"partial"`), `gamma` (minimum
 *   shadow-axis distance in Earth radii), and the `begin`/`end` JDs.
 * @example
 * ```ts
 * const eclipses = solarEclipses(engine, julianDay(2025, 1, 1), julianDay(2030, 1, 1));
 * eclipses[0].type; // e.g. "partial"
 * ```
 */
export function solarEclipses(
  engine: Engine, jdStart: number, jdEnd: number,
): SolarEclipse[] {
  const out: SolarEclipse[] = [];
  for (const tNew of syzygies(engine, jdStart - 1, jdEnd + 1, 0.0)) {
    const tMax = minimize((t) => solarGeom(engine, t)[0], tNew - 0.4, tNew + 0.4);
    const [dAxis, rPen, rUmb, , f2] = solarGeom(engine, tMax);
    if (dAxis > R_EARTH + rPen || tMax < jdStart || tMax > jdEnd) continue;
    const gamma = dAxis / R_EARTH;
    let kind: SolarEclipse["type"];
    if (dAxis < R_EARTH) {
      const depth = Math.sqrt(Math.max(R_EARTH ** 2 - dAxis ** 2, 0));
      const rUmbSurface = rUmb + depth * Math.tan(f2);
      kind = rUmb > 0 ? "total" : rUmbSurface > 0 ? "hybrid" : "annular";
    } else {
      kind = "partial";
    }
    const f = (t: number): number => {
      const g = solarGeom(engine, t);
      return g[0] - (R_EARTH + g[1]);
    };
    out.push({
      tMax, type: kind, gamma,
      begin: bisect(f, tMax - 0.35, tMax),
      end: bisect(f, tMax, tMax + 0.35),
    });
  }
  return out;
}
