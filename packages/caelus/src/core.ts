/**
 * astroengine core -- clean-room ephemeris engine (TypeScript port).
 *
 * 1:1 port of the validated Python implementation. Environment-agnostic:
 * all coefficient data is injected (works in browser via fetch/bundling,
 * in Node via the loader in node-loader.ts).
 */

export const DEG = Math.PI / 180.0;
export const ARCSEC = DEG / 3600.0;
export const J2000 = 2451545.0;
export const LIGHT_TIME_AU = 0.0057755183; // days per AU
const TWO_PI = 2 * Math.PI;
const C_KM_PER_DAY = 299792.458 * 86400.0;

/** Python-style modulo: result has the sign of the divisor. */
export function mod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}

// ---------------------------------------------------------------- data types
export type VsopSeries = { L: number[][][]; B: number[][][]; R: number[][][] };
export type MoonSeries = { ta: number[][]; tb: number[][] };
export type ChebData = {
  jd0: number; seg_days: number; scale?: number; segments: number[][][];
};

export interface EngineData {
  vsop: Record<string, VsopSeries>; // mercury..neptune + earth
  nutation: number[][];
  moonMeeus: MoonSeries;
  pluto: number[][];
  chiron?: ChebData;
  moonCheb?: ChebData;
}

// ---------------------------------------------------------------- timescale
export function julianDay(
  y: number, mo: number, d: number, h = 0, mi = 0, s = 0,
): number {
  const frac = (h + mi / 60.0 + s / 3600.0) / 24.0;
  if (mo <= 2) { y -= 1; mo += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1))
    + d + b - 1524.5 + frac
  );
}

const DT_OBS: Array<[number, number]> = [
  [1955, 31.1], [1960, 33.2], [1965, 35.7], [1970, 40.2], [1975, 45.5],
  [1980, 50.5], [1985, 54.3], [1990, 56.9], [1995, 60.8], [2000, 63.8],
  [2005, 64.7], [2010, 66.1], [2015, 67.6], [2020, 69.4], [2025, 69.2],
];

/** TT - UT1 in seconds. Observed IERS 1955-2025, E&M polynomials before,
 *  gentle extrapolation after (Earth's rotation sped up post-2016). */
export function deltaT(jdUt: number): number {
  const y = 2000.0 + (jdUt - J2000) / 365.25;
  if (y >= 1955 && y <= 2025) {
    for (let i = 0; i < DT_OBS.length - 1; i++) {
      const [y0, d0] = DT_OBS[i];
      const [y1, d1] = DT_OBS[i + 1];
      if (y >= y0 && y <= y1) return d0 + ((d1 - d0) * (y - y0)) / (y1 - y0);
    }
  }
  if (y > 2025) {
    // ΔT is flat-to-falling (69.4 -> 69.2 s over 2020-2025; Earth's spin
    // sped up post-2016). Continue the observed slope (-0.04 s/yr) plus the
    // long-term tidal quadratic (+32 s/cy², same coefficient as the
    // deep-time parabola below) so it rejoins the secular rise. An 80-year
    // ΔT forecast carries ~±37 s uncertainty (Huber 2006); anything steeper
    // is false precision.
    const dy = y - 2025;
    return 69.2 - 0.04 * dy + 32 * (dy / 100) ** 2;
  }
  let t: number;
  if (y >= 1941 && y < 1955) {
    t = y - 1950;
    return 29.07 + 0.407 * t - (t * t) / 233 + t ** 3 / 2547;
  }
  if (y >= 1920 && y < 1941) {
    t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t * t + 0.0020936 * t ** 3;
  }
  if (y >= 1900 && y < 1920) {
    t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3
      - 0.000197 * t ** 4;
  }
  if (y >= 1860 && y < 1900) {
    t = y - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3
      - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  }
  if (y >= 1800 && y < 1860) {
    t = y - 1800;
    return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t ** 3
      - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5
      - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7;
  }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

export function jdTT(jdUt: number): number {
  return jdUt + deltaT(jdUt) / 86400.0;
}

// ---------------------------------------------------------------- VSOP87D
export function vsopHeliocentric(
  series: VsopSeries, jde: number,
): [number, number, number] {
  const t = (jde - J2000) / 365250.0;
  const out: number[] = [];
  for (const v of [series.L, series.B, series.R]) {
    let total = 0.0;
    let tn = 1.0;
    for (const orderTerms of v) {
      let acc = 0.0;
      for (const [A, B, C] of orderTerms) acc += A * Math.cos(B + C * t);
      total += acc * tn;
      tn *= t;
    }
    out.push(total);
  }
  return [mod(out[0], TWO_PI), out[1], out[2]];
}

// ---------------------------------------------------------------- nutation
/** IAU 1980 nutation: [dPsi, dEps] in radians. */
export function nutation(data: EngineData, jde: number): [number, number] {
  const T = (jde - J2000) / 36525.0;
  const D = (297.85036 + 445267.11148 * T - 0.0019142 * T * T + T ** 3 / 189474) * DEG;
  const M = (357.52772 + 35999.05034 * T - 0.0001603 * T * T - T ** 3 / 300000) * DEG;
  const N = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + T ** 3 / 5620) * DEG;
  const F = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + T ** 3 / 327270) * DEG;
  const Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000) * DEG;
  let dpsi = 0.0;
  let deps = 0.0;
  const tbl = data.nutation;
  for (let i = tbl.length - 1; i >= 0; i--) {
    const [d, m, n, f, om, s0, s1, c0, c1] = tbl[i];
    const arg = d * D + m * M + n * N + f * F + om * Om;
    dpsi += Math.sin(arg) * (s0 + s1 * T);
    deps += Math.cos(arg) * (c0 + c1 * T);
  }
  return [dpsi * 1e-4 * ARCSEC, deps * 1e-4 * ARCSEC];
}

export function meanObliquity(jde: number): number {
  const T = (jde - J2000) / 36525.0;
  return (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) * ARCSEC;
}

export function trueObliquity(data: EngineData, jde: number): number {
  return meanObliquity(jde) + nutation(data, jde)[1];
}

// ---------------------------------------------------------------- frame fix
function fk5Correction(L: number, B: number, jde: number): [number, number] {
  const T = (jde - J2000) / 36525.0;
  const Lp = L - (1.397 + 0.00031 * T) * T * DEG;
  const dL = -0.09033 * ARCSEC
    + 0.03916 * ARCSEC * (Math.cos(Lp) + Math.sin(Lp)) * Math.tan(B);
  const dB = 0.03916 * ARCSEC * (Math.cos(Lp) - Math.sin(Lp));
  return [L + dL, B + dB];
}

/** Precession of ecliptic coordinates (Meeus 21.7). */
export function precessEcliptic(
  lon: number, lat: number, jdeFrom: number, jdeTo: number,
): [number, number] {
  const T = (jdeFrom - J2000) / 36525.0;
  const t = (jdeTo - jdeFrom) / 36525.0;
  const eta = ((47.0029 - 0.06603 * T + 0.000598 * T * T) * t
    + (-0.03302 + 0.000598 * T) * t * t + 0.00006 * t ** 3) * ARCSEC;
  const Pi = (174.876384 * 3600 + 3289.4789 * T + 0.60622 * T * T) * ARCSEC
    - ((869.8089 + 0.50491 * T) * t - 0.03536 * t * t) * ARCSEC;
  const p = ((5029.0966 + 2.22226 * T - 0.000042 * T * T) * t
    + (1.11113 - 0.000042 * T) * t * t - 0.000006 * t ** 3) * ARCSEC;
  const se = Math.sin(eta);
  const ce = Math.cos(eta);
  const A = ce * Math.cos(lat) * Math.sin(Pi - lon) - se * Math.sin(lat);
  const Bv = Math.cos(lat) * Math.cos(Pi - lon);
  const C = ce * Math.sin(lat) + se * Math.cos(lat) * Math.sin(Pi - lon);
  return [mod(p + Pi - Math.atan2(A, Bv), TWO_PI), Math.asin(C)];
}

/** Rotate a vector from ecliptic-J2000 to ecliptic-of-date frame. */
function eclJ2000ToEclDate(
  v: [number, number, number], jde: number,
): [number, number, number] {
  let [x, y, z] = v;
  const e0 = 84381.448 * ARCSEC;
  [y, z] = [y * Math.cos(e0) - z * Math.sin(e0), y * Math.sin(e0) + z * Math.cos(e0)];
  const T = (jde - J2000) / 36525.0;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC;
  const zz = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC;
  const rz = (a: number) => {
    const c = Math.cos(a); const s = Math.sin(a);
    [x, y] = [c * x + s * y, -s * x + c * y];
  };
  const ry = (a: number) => {
    const c = Math.cos(a); const s = Math.sin(a);
    [x, z] = [c * x - s * z, s * x + c * z];
  };
  rz(-zeta); ry(th); rz(-zz);
  const e = meanObliquity(jde);
  [y, z] = [y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e)];
  return [x, y, z];
}

// ---------------------------------------------------------------- planets
function geoVector(
  data: EngineData, name: string, jde: number,
): [number, number, number] {
  const [L0, B0, R0] = vsopHeliocentric(data.vsop.earth, jde);
  const [L, B, R] = vsopHeliocentric(data.vsop[name], jde);
  return [
    R * Math.cos(B) * Math.cos(L) - R0 * Math.cos(B0) * Math.cos(L0),
    R * Math.cos(B) * Math.sin(L) - R0 * Math.cos(B0) * Math.sin(L0),
    R * Math.sin(B) - R0 * Math.sin(B0),
  ];
}

/** Apparent geocentric ecliptic lon/lat (true equinox of date), distance. */
export function planetApparent(
  data: EngineData, name: string, jde: number,
): [number, number, number] {
  let [x, y, z] = geoVector(data, name, jde);
  let delta = Math.sqrt(x * x + y * y + z * z);
  for (let i = 0; i < 2; i++) {
    const tau = LIGHT_TIME_AU * delta;
    [x, y, z] = geoVector(data, name, jde - tau);
    delta = Math.sqrt(x * x + y * y + z * z);
  }
  let lon = mod(Math.atan2(y, x), TWO_PI);
  let lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  [lon, lat] = fk5Correction(lon, lat, jde);
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat, delta];
}

export function sunApparent(
  data: EngineData, jde: number,
): [number, number, number] {
  const [L0, B0, R0] = vsopHeliocentric(data.vsop.earth, jde);
  let lon = mod(L0 + Math.PI, TWO_PI);
  let lat = -B0;
  [lon, lat] = fk5Correction(lon, lat, jde);
  lon -= (20.4898 * ARCSEC) / R0;
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat, R0];
}

// ---------------------------------------------------------------- moon
function moonFundamental(T: number): [number, number, number, number, number] {
  const Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
    + T ** 3 / 538841 - T ** 4 / 65194000) * DEG;
  const D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
    + T ** 3 / 545868 - T ** 4 / 113065000) * DEG;
  const M = (357.5291092 + 35999.0502909 * T - 0.0001535 * T * T
    + T ** 3 / 24490000) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
    + T ** 3 / 69699 - T ** 4 / 14712000) * DEG;
  const F = (93.272095 + 483202.0175233 * T - 0.0036539 * T * T
    - T ** 3 / 3526000 + T ** 4 / 863310000) * DEG;
  return [Lp, D, M, Mp, F];
}

/** Geocentric Moon, mean equinox of date (Meeus ch.47): lon, lat, dist km. */
export function moonGeometric(
  data: EngineData, jde: number,
): [number, number, number] {
  const T = (jde - J2000) / 36525.0;
  const [Lp, D, M, Mp, F] = moonFundamental(T);
  const A1 = (119.75 + 131.849 * T) * DEG;
  const A2 = (53.09 + 479264.29 * T) * DEG;
  const A3 = (313.45 + 481266.484 * T) * DEG;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const E2 = E * E;
  let sl = 3958 * Math.sin(A1) + 1962 * Math.sin(Lp - F) + 318 * Math.sin(A2);
  let sr = 0.0;
  let sb = -2235 * Math.sin(Lp) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F)
    + 175 * Math.sin(A1 + F) + 127 * Math.sin(Lp - Mp) - 115 * Math.sin(Lp + Mp);
  for (const [d, m, mp, f, lC, rC] of data.moonMeeus.ta) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E2 : 1.0;
    sl += lC * Math.sin(arg) * e;
    sr += rC * Math.cos(arg) * e;
  }
  for (const [d, m, mp, f, bC] of data.moonMeeus.tb) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E2 : 1.0;
    sb += bC * Math.sin(arg) * e;
  }
  return [
    mod(Lp + sl * 1e-6 * DEG, TWO_PI),
    sb * 1e-6 * DEG,
    385000.56 + sr * 1e-3,
  ];
}

export function moonApparentSeries(
  data: EngineData, jde: number,
): [number, number, number] {
  const [lon, lat, dist] = moonGeometric(data, jde);
  return [mod(lon + nutation(data, jde)[0], TWO_PI), lat, dist];
}

// ---------------------------------------------------------------- chebyshev
function clenshaw(coeffs: number[], x: number): number {
  let b0 = 0.0;
  let b1 = 0.0;
  for (let i = coeffs.length - 1; i >= 1; i--) {
    [b0, b1] = [2.0 * x * b0 - b1 + coeffs[i], b0];
  }
  return x * b0 - b1 + coeffs[0];
}

function clenshawDeriv(
  coeffs: number[], x: number, halfSpanDays: number,
): [number, number] {
  const n = coeffs.length;
  const d = new Array<number>(n).fill(0.0);
  for (let k = n - 1; k >= 1; k--) {
    d[k - 1] = (k + 1 < n ? d[k + 1] : 0.0) + 2.0 * k * coeffs[k];
  }
  d[0] *= 0.5;
  return [clenshaw(coeffs, x), clenshaw(d.slice(0, Math.max(n - 1, 1)), x) / halfSpanDays];
}

export class ChebSeries {
  jd0: number; seg: number; segments: number[][][]; jd1: number; scale: number;

  constructor(data: ChebData) {
    this.jd0 = data.jd0;
    this.seg = data.seg_days;
    this.segments = data.segments;
    this.jd1 = this.jd0 + this.seg * this.segments.length;
    this.scale = data.scale ?? 1.0;
  }

  private locate(jd: number): [number, number] {
    if (jd < this.jd0 || jd > this.jd1) {
      throw new RangeError(`jd ${jd} outside fitted range ${this.jd0}-${this.jd1}`);
    }
    const i = Math.min(
      Math.floor((jd - this.jd0) / this.seg), this.segments.length - 1,
    );
    const x = (2.0 * (jd - (this.jd0 + i * this.seg))) / this.seg - 1.0;
    return [i, x];
  }

  xyz(jd: number): [number, number, number] {
    const [i, x] = this.locate(jd);
    const s = this.segments[i];
    return [
      clenshaw(s[0], x) * this.scale,
      clenshaw(s[1], x) * this.scale,
      clenshaw(s[2], x) * this.scale,
    ];
  }

  xyzVel(jd: number): [[number, number, number], [number, number, number]] {
    const [i, x] = this.locate(jd);
    const s = this.segments[i];
    const half = this.seg / 2.0;
    const pos: number[] = [];
    const vel: number[] = [];
    for (const c of s) {
      const [p, v] = clenshawDeriv(c, x, half);
      pos.push(p * this.scale);
      vel.push(v * this.scale);
    }
    return [pos as [number, number, number], vel as [number, number, number]];
  }
}

// ---------------------------------------------------------------- precise moon
export function moonApparentPrecise(
  data: EngineData, cheb: ChebSeries, jde: number,
): [number, number, number] {
  let [x, y, z] = cheb.xyz(jde);
  const dist = Math.sqrt(x * x + y * y + z * z);
  const tau = dist / C_KM_PER_DAY;
  [x, y, z] = cheb.xyz(jde - tau);
  let lon = mod(Math.atan2(y, x), TWO_PI);
  let lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  [lon, lat] = precessEcliptic(lon, lat, J2000, jde);
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat, dist];
}

export function trueNodePrecise(
  data: EngineData, cheb: ChebSeries, jde: number,
): number {
  const [[x, y, z], [vx, vy, vz]] = cheb.xyzVel(jde);
  const h: [number, number, number] = [
    y * vz - z * vy, z * vx - x * vz, x * vy - y * vx,
  ];
  const [hx, hy] = eclJ2000ToEclDate(h, jde);
  const node = mod(Math.atan2(hx, -hy), TWO_PI);
  return mod(node + nutation(data, jde)[0], TWO_PI);
}

// ---------------------------------------------------------------- lunar node
export function meanNode(data: EngineData, jde: number): number {
  const T = (jde - J2000) / 36525.0;
  const om = (125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
    + T ** 3 / 467441 - T ** 4 / 60616000) * DEG;
  return mod(om + nutation(data, jde)[0], TWO_PI);
}

/** Osculating node from the series moon (fallback outside Chebyshev range). */
export function trueNodeSeries(data: EngineData, jde: number): number {
  const h = 0.01;
  const xyz = (t: number): [number, number, number] => {
    const [lon, lat, dist] = moonGeometric(data, t);
    return [
      dist * Math.cos(lat) * Math.cos(lon),
      dist * Math.cos(lat) * Math.sin(lon),
      dist * Math.sin(lat),
    ];
  };
  const [x0, y0, z0] = xyz(jde - h);
  const [x1, y1, z1] = xyz(jde + h);
  const [x, y, z] = xyz(jde);
  const vx = (x1 - x0) / (2 * h);
  const vy = (y1 - y0) / (2 * h);
  const vz = (z1 - z0) / (2 * h);
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const node = mod(Math.atan2(hx, -hy), TWO_PI);
  return mod(node + nutation(data, jde)[0], TWO_PI);
}

// ---------------------------------------------------------------- frames+
/** Ecliptic lon/lat -> right ascension, declination (all radians). */
export function equatorial(
  lon: number, lat: number, eps: number,
): [number, number] {
  const ra = mod(Math.atan2(
    Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon),
  ), TWO_PI);
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon),
  );
  return [ra, dec];
}

/** Mean ayanamsa at J2000.0 (degrees) per mode. Standard epoch anchors
 *  (matched to Swiss Ephemeris 2.10 to 1e-9 deg); propagation uses IAU 1976
 *  ecliptic precession. Agreement with Swiss Ephemeris over 1900-2099 is
 *  <=0.30 arcsec (precession-model difference: SE uses Vondrak 2011). */
export const AYANAMSA_J2000: Record<string, number> = {
  lahiri: 23.857092325,
  fagan_bradley: 24.740299966,
  krishnamurti: 23.760240012,
  raman: 22.410791012,
  yukteshwar: 22.478803000,
};

/** Mean ayanamsa in degrees. Sidereal longitude = (tropical true-equinox
 *  longitude - nutation in longitude) - ayanamsa: the sidereal zodiac is
 *  anchored to the mean equinox. */
export function ayanamsa(jde: number, mode: string): number {
  const a0 = AYANAMSA_J2000[mode];
  if (a0 === undefined) throw new Error(`unknown ayanamsa ${mode}`);
  const [lon] = precessEcliptic(a0 * DEG, 0.0, J2000, jde);
  return lon / DEG;
}

/** Mean lunar apogee (Black Moon Lilith) on the inclined lunar orbit:
 *  apparent lon (true equinox) and orbital latitude, radians. */
export function meanLilith(data: EngineData, jde: number): [number, number] {
  const T = (jde - J2000) / 36525.0;
  const [Lp, , , Mp] = moonFundamental(T);
  const apog = Lp - Mp + Math.PI; // mean perigee + 180
  const om = (125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
    + T ** 3 / 467441 - T ** 4 / 60616000) * DEG;
  const inc = 5.145396374 * DEG;
  const u = apog - om;
  const lat = Math.asin(Math.sin(inc) * Math.sin(u));
  let lon = om + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u));
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat];
}

export const EARTH_RADIUS_AU = 6378.14 / 149597870.7;
const EARTH_FLAT = 0.99664719; // 1 - f, IAU 1976 figure

/** Diurnal parallax in ecliptic coordinates (Meeus ch. 11/40).
 *  lst = local apparent sidereal time (rad). Returns [lon, lat, distAu]. */
export function topocentricEcl(
  lon: number, lat: number, distAu: number, lst: number,
  obsLat: number, altM: number, eps: number,
): [number, number, number] {
  const u = Math.atan(EARTH_FLAT * Math.tan(obsLat));
  const rs = EARTH_FLAT * Math.sin(u) + (altM / 6378140.0) * Math.sin(obsLat);
  const rc = Math.cos(u) + (altM / 6378140.0) * Math.cos(obsLat);
  const ox = EARTH_RADIUS_AU * rc * Math.cos(lst);
  const oy = EARTH_RADIUS_AU * rc * Math.sin(lst);
  const oz = EARTH_RADIUS_AU * rs;
  const [ra, dec] = equatorial(lon, lat, eps);
  const bx = distAu * Math.cos(dec) * Math.cos(ra);
  const by = distAu * Math.cos(dec) * Math.sin(ra);
  const bz = distAu * Math.sin(dec);
  const tx = bx - ox;
  const ty = by - oy;
  const tz = bz - oz;
  const ra2 = Math.atan2(ty, tx);
  const dec2 = Math.atan2(tz, Math.hypot(tx, ty));
  const lon2 = mod(Math.atan2(
    Math.sin(ra2) * Math.cos(eps) + Math.tan(dec2) * Math.sin(eps), Math.cos(ra2),
  ), TWO_PI);
  const lat2 = Math.asin(
    Math.sin(dec2) * Math.cos(eps) - Math.cos(dec2) * Math.sin(eps) * Math.sin(ra2),
  );
  return [lon2, lat2, Math.sqrt(tx * tx + ty * ty + tz * tz)];
}

// ---------------------------------------------------------------- pluto
/** Meeus ch.37 heliocentric Pluto, ecliptic J2000: [l rad, b rad, r AU]. */
export function plutoHeliocentric(
  data: EngineData, jde: number,
): [number, number, number] {
  const T = (jde - J2000) / 36525.0;
  const J = (34.35 + 3034.9057 * T) * DEG;
  const S = (50.08 + 1222.1138 * T) * DEG;
  const P = (238.96 + 144.96 * T) * DEG;
  let l = 0.0; let b = 0.0; let r = 0.0;
  for (const [i, j, k, lA, lB, bA, bB, rA, rB] of data.pluto) {
    const a = i * J + j * S + k * P;
    const sa = Math.sin(a); const ca = Math.cos(a);
    l += lA * sa + lB * ca;
    b += bA * sa + bB * ca;
    r += rA * sa + rB * ca;
  }
  return [
    (l + 238.958116 + 144.96 * T) * DEG,
    (b - 3.908239) * DEG,
    r + 40.7241346,
  ];
}

export function plutoApparent(
  data: EngineData, jde: number,
): [number, number, number] {
  const helioJ2000 = (tJde: number): [number, number, number] =>
    plutoHeliocentric(data, tJde);
  const [L0d, B0d, R0d] = vsopHeliocentric(data.vsop.earth, jde);
  const [Lj, Bj] = precessEcliptic(L0d, B0d, jde, J2000);
  const ex = R0d * Math.cos(Bj) * Math.cos(Lj);
  const ey = R0d * Math.cos(Bj) * Math.sin(Lj);
  const ez = R0d * Math.sin(Bj);
  const geo = (t: number): [number, number, number] => {
    const [l, b, r] = helioJ2000(t);
    return [
      r * Math.cos(b) * Math.cos(l) - ex,
      r * Math.cos(b) * Math.sin(l) - ey,
      r * Math.sin(b) - ez,
    ];
  };
  let [x, y, z] = geo(jde);
  let delta = Math.sqrt(x * x + y * y + z * z);
  for (let i = 0; i < 2; i++) {
    [x, y, z] = geo(jde - LIGHT_TIME_AU * delta);
    delta = Math.sqrt(x * x + y * y + z * z);
  }
  let lon = mod(Math.atan2(y, x), TWO_PI);
  let lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const T = (jde - J2000) / 36525.0;
  const sunLon = mod(L0d + Math.PI, TWO_PI);
  const k = 20.4898 * ARCSEC;
  const e = 0.016708634 - 0.000042037 * T;
  const piPer = (102.93735 + 1.71946 * T) * DEG;
  lon += (-k * Math.cos(sunLon - lon) + e * k * Math.cos(piPer - lon)) / Math.cos(lat);
  [lon, lat] = precessEcliptic(lon, lat, J2000, jde);
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat, delta];
}

// ---------------------------------------------------------------- chiron
export function chironApparent(
  data: EngineData, cheb: ChebSeries, jde: number,
): [number, number, number] {
  const [L0, B0, R0] = vsopHeliocentric(data.vsop.earth, jde);
  const [Lj, Bj] = precessEcliptic(L0, B0, jde, J2000);
  const ex = R0 * Math.cos(Bj) * Math.cos(Lj);
  const ey = R0 * Math.cos(Bj) * Math.sin(Lj);
  const ez = R0 * Math.sin(Bj);
  const geo = (t: number): [number, number, number] => {
    const [cx, cy, cz] = cheb.xyz(t);
    return [cx - ex, cy - ey, cz - ez];
  };
  let [x, y, z] = geo(jde);
  let delta = Math.sqrt(x * x + y * y + z * z);
  for (let i = 0; i < 2; i++) {
    [x, y, z] = geo(jde - LIGHT_TIME_AU * delta);
    delta = Math.sqrt(x * x + y * y + z * z);
  }
  let lon = mod(Math.atan2(y, x), TWO_PI);
  let lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const T = (jde - J2000) / 36525.0;
  const sunLon = mod(L0 + Math.PI, TWO_PI);
  const k = 20.4898 * ARCSEC;
  const e = 0.016708634 - 0.000042037 * T;
  const piPer = (102.93735 + 1.71946 * T) * DEG;
  lon += (-k * Math.cos(sunLon - lon) + e * k * Math.cos(piPer - lon)) / Math.cos(lat);
  [lon, lat] = precessEcliptic(lon, lat, J2000, jde);
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat, delta];
}
