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
 *
 * Solar (where): the same shadow axis intersected with the IAU 1976 Earth
 * ellipsoid gives the sub-shadow geographic point -- the centre line of
 * totality/annularity at an instant; sampled across the eclipse it draws the
 * ground track. Solar (local): topocentric Sun/Moon disks at an observer give
 * the contact times, magnitude, and obscuration as seen from that point. With
 * a ~2.5" Moon these land within seconds of time and a few km of track: right
 * for charts, not for eclipse-chaser path maps.
 */
import { ARCSEC, DEG, jdTT, mod, trueObliquity, equatorial, topocentricEcl } from "./core.js";
import { Engine } from "./chart.js";
import { gast } from "./houses.js";

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

// ---------------------------------------------------------------- where + local

const EARTH_FLAT = 0.99664719; // 1 - f, IAU 1976 figure (b/a)
const EARTH_FLAT2 = EARTH_FLAT * EARTH_FLAT; // (b/a)^2 = 1 - e^2

/** Geographic point on the Earth's surface (geodetic latitude, east longitude). */
export interface GeoPoint {
  /** Geodetic latitude in degrees, north positive. */
  lat: number;
  /** Longitude in degrees, east positive, in (-180, 180]. */
  lonEast: number;
}

/** Local circumstances of a solar eclipse seen from one place. */
export interface SolarLocal {
  /** What the observer sees at maximum: `"none"` when no part of the Sun is
   *  covered from this place. */
  type: "total" | "annular" | "partial" | "none";
  /** Eclipse magnitude: fraction of the Sun's *diameter* covered at maximum
   *  (can exceed 1 in totality). 0 when `type` is `"none"`. */
  magnitude: number;
  /** Obscuration: fraction of the Sun's *area* covered at maximum, in [0, 1]. */
  obscuration: number;
  /** Time of maximum eclipse at this place (JD UT), or `null` when unseen. */
  maxTime: number | null;
  /** First contact (partial begins), JD UT, or `null` when unseen. */
  c1: number | null;
  /** Second contact (totality/annularity begins), JD UT, or `null`. */
  c2: number | null;
  /** Third contact (totality/annularity ends), JD UT, or `null`. */
  c3: number | null;
  /** Fourth contact (partial ends), JD UT, or `null` when unseen. */
  c4: number | null;
}

/** Geocentric *equatorial* Cartesian (km) of the Sun and Moon, plus obliquity. */
function sunMoonEq(
  engine: Engine, jde: number,
): { S: number[]; M: number[] } {
  const eps = trueObliquity(engine.data, jde);
  const vec = (body: "sun" | "moon"): number[] => {
    const [lon, lat, dist] = engine.ecliptic(body, jde);
    const [ra, dec] = equatorial(lon, lat, eps);
    const r = dist! * KM_PER_AU;
    return [
      r * Math.cos(dec) * Math.cos(ra),
      r * Math.cos(dec) * Math.sin(ra),
      r * Math.sin(dec),
    ];
  };
  return { S: vec("sun"), M: vec("moon") };
}

/**
 * Sub-shadow geographic point where the eclipse axis meets the Earth at a
 * Julian Day (UT): the centre line of totality/annularity at that instant.
 * Sample it across the eclipse (e.g. between the {@link SolarEclipse} `begin`
 * and `end`) to draw the ground track.
 *
 * @param engine The engine used to evaluate positions.
 * @param jd Instant to evaluate, Julian Day (UT) -- typically a
 *   {@link SolarEclipse.tMax} for the point of greatest eclipse.
 * @returns The {@link GeoPoint} on the IAU 1976 ellipsoid, or `null` when the
 *   axis misses the Earth (only a partial eclipse exists anywhere then).
 */
export function solarEclipseWhere(engine: Engine, jd: number): GeoPoint | null {
  const jde = jdTT(jd);
  const { S, M } = sunMoonEq(engine, jde);
  const SM = [M[0] - S[0], M[1] - S[1], M[2] - S[2]];
  const smn = Math.hypot(SM[0], SM[1], SM[2]);
  const d = SM.map((c) => c / smn); // travels Sun -> Moon -> Earth
  // Intersect the line M + s*d with the ellipsoid by scaling z by 1/flat,
  // which maps the ellipsoid to a sphere of radius R_EARTH.
  const Mz = [M[0], M[1], M[2] / EARTH_FLAT];
  const dz = [d[0], d[1], d[2] / EARTH_FLAT];
  const a = dz[0] ** 2 + dz[1] ** 2 + dz[2] ** 2;
  const b = 2 * (Mz[0] * dz[0] + Mz[1] * dz[1] + Mz[2] * dz[2]);
  const c = Mz[0] ** 2 + Mz[1] ** 2 + Mz[2] ** 2 - R_EARTH ** 2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a); // near side, facing the Moon
  const P = [M[0] + s * d[0], M[1] + s * d[1], M[2] + s * d[2]];
  const rho = Math.hypot(P[0], P[1]);
  const lat = Math.atan2(P[2], EARTH_FLAT2 * rho); // geocentric -> geodetic
  const ra = Math.atan2(P[1], P[0]);
  const lonEast = mod(ra - gast(engine.data, jd) + Math.PI, 2 * Math.PI) - Math.PI;
  return { lat: lat / DEG, lonEast: lonEast / DEG };
}

/** Topocentric Sun/Moon angular separation and disk radii (rad) at a place. */
function topoCircs(
  engine: Engine, jd: number, latDeg: number, lonEastDeg: number, altM: number,
): { sep: number; sS: number; sM: number } {
  const jde = jdTT(jd);
  const eps = trueObliquity(engine.data, jde);
  const lst = mod(gast(engine.data, jd) + lonEastDeg * DEG, 2 * Math.PI);
  const topo = (body: "sun" | "moon"): [number, number, number] => {
    const [lon, lat, dist] = engine.ecliptic(body, jde);
    return topocentricEcl(lon, lat, dist!, lst, latDeg * DEG, altM, eps);
  };
  const [slon, slat, sdist] = topo("sun");
  const [mlon, mlat, mdist] = topo("moon");
  const cosSep = Math.sin(slat) * Math.sin(mlat)
    + Math.cos(slat) * Math.cos(mlat) * Math.cos(slon - mlon);
  return {
    sep: Math.acos(Math.max(-1, Math.min(1, cosSep))),
    sS: Math.asin(R_SUN / (sdist * KM_PER_AU)),
    sM: Math.asin(R_MOON / (mdist * KM_PER_AU)),
  };
}

/** Area where two disks (radii r1, r2, centre distance d) overlap. */
function lensArea(d: number, r1: number, r2: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
}

/** Step out from `tMax` (where g < 0) until `g` changes sign, then bisect. */
function contact(g: (t: number) => number, tMax: number, dir: 1 | -1): number | null {
  const step = 0.003; // ~4.3 min
  let prev = tMax; let fprev = g(tMax);
  for (let i = 1; i <= 120; i++) { // search up to ~8.6 h either side
    const t = tMax + dir * i * step;
    const f = g(t);
    if (fprev * f <= 0) return bisect(g, Math.min(prev, t), Math.max(prev, t));
    prev = t; fprev = f;
  }
  return null;
}

/**
 * Local circumstances of a solar eclipse as seen from one place: contact
 * times, magnitude, and obscuration. Topocentric Sun and Moon disks, so it
 * accounts for lunar parallax (which is what makes the same eclipse total in
 * one town and partial in the next).
 *
 * @param engine The engine used to evaluate positions.
 * @param jd A time near the eclipse, JD (UT) -- typically a
 *   {@link SolarEclipse.tMax}; the local maximum is found within a few hours.
 * @param latDeg Observer geodetic latitude in degrees (north positive).
 * @param lonEastDeg Observer longitude in degrees (east positive).
 * @param altM Observer height above the ellipsoid in metres (default 0).
 * @returns {@link SolarLocal}. `type` is `"none"` when the Sun is not eclipsed
 *   from this place at all; `c2`/`c3` are `null` outside totality/annularity.
 */
export function solarEclipseLocal(
  engine: Engine, jd: number, latDeg: number, lonEastDeg: number, altM = 0,
): SolarLocal {
  const sepAt = (t: number): number =>
    topoCircs(engine, t, latDeg, lonEastDeg, altM).sep;
  const tMax = minimize(sepAt, jd - 0.2, jd + 0.2);
  const { sep, sS, sM } = topoCircs(engine, tMax, latDeg, lonEastDeg, altM);
  const none: SolarLocal = {
    type: "none", magnitude: 0, obscuration: 0,
    maxTime: null, c1: null, c2: null, c3: null, c4: null,
  };
  if (sep >= sS + sM) return none;
  const type: SolarLocal["type"] =
    sep <= sM - sS ? "total" : sep <= sS - sM ? "annular" : "partial";
  const gOuter = (t: number): number => {
    const c = topoCircs(engine, t, latDeg, lonEastDeg, altM);
    return c.sep - (c.sS + c.sM);
  };
  let c2: number | null = null; let c3: number | null = null;
  if (type === "total" || type === "annular") {
    const gInner = (t: number): number => {
      const c = topoCircs(engine, t, latDeg, lonEastDeg, altM);
      return c.sep - Math.abs(c.sM - c.sS);
    };
    c2 = contact(gInner, tMax, -1);
    c3 = contact(gInner, tMax, 1);
  }
  return {
    type,
    magnitude: (sS + sM - sep) / (2 * sS),
    obscuration: lensArea(sep, sS, sM) / (Math.PI * sS * sS),
    maxTime: tMax,
    c1: contact(gOuter, tMax, -1),
    c2, c3,
    c4: contact(gOuter, tMax, 1),
  };
}
