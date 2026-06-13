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
export type KeplerElements = {
  a: number; e: number; i: number; node: number; peri: number;
  M0: number; n: number;
};
export type KeplerPack = { epoch: number; bodies: Record<string, KeplerElements> };
/** Anything that yields heliocentric ecliptic-J2000 xyz (AU) at a TT jd:
 *  ChebSeries (fitted small bodies) or KeplerOrbit (Uranian bodies). */
export interface XyzSource { xyz(jd: number): [number, number, number] }

export interface EngineData {
  vsop: Record<string, VsopSeries>; // mercury..neptune + earth
  nutation: number[][];
  moonMeeus: MoonSeries;
  pluto: number[][];
  chiron?: ChebData;
  moonCheb?: ChebData;
  /** Heliocentric ecliptic-J2000 Chebyshev packs by body id (ceres,
   *  pallas, juno, vesta, pholus, ...). Same pipeline as Chiron. */
  chebPacks?: Record<string, ChebData>;
  /** Hamburg-school (Uranian) constant-element orbits; see fit_uranian.py. */
  keplerPack?: KeplerPack;
  /** Fixed-star catalog (HYG-derived; ICRS J2000 + proper motions). */
  fixedStars?: import("./stars.js").StarPack;
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

// ------------------------------------------------- Vondrak 2011 precession
// Long-term precession of the ecliptic and equator (Vondrak, Capitaine &
// Wallace 2011, A&A 534 A22; coefficient tables as carried by ERFA under
// BSD-3). Replaces the IAU 1976 angles.
const PQ_POL = [
  [5851.607687, -0.1189, -0.00028913, 0.000000101],
  [-1600.8863, 1.1689818, -0.0000002, -0.000000437],
];
const PQ_PER = [
  [708.15, -5486.751211, -684.66156, 667.66673, -5523.863691],
  [2309.0, -17.127623, 2446.28388, -2354.886252, -549.74745],
  [1620.0, -617.517403, 399.671049, -428.152441, -310.998056],
  [492.2, 413.44294, -356.652376, 376.202861, 421.535876],
  [1183.0, 78.614193, -186.387003, 184.778874, -36.776172],
  [622.0, -180.732815, -316.80007, 335.321713, -145.278396],
  [882.0, -87.676083, 198.296701, -185.138669, -34.74445],
  [547.0, 46.140315, 101.135679, -120.97283, 22.885731],
];
const XY_POL = [
  [5453.282155, 0.4252841, -0.00037173, -0.000000152],
  [-73750.93035, -0.7675452, -0.00018725, 0.000000231],
];
const XY_PER = [
  [256.75, -819.940624, 75004.344875, 81491.287984, 1558.515853],
  [708.15, -8444.676815, 624.033993, 787.163481, 7774.939698],
  [274.2, 2600.009459, 1251.136893, 1251.296102, -2219.534038],
  [241.45, 2755.17563, -1102.212834, -1257.950837, -2523.969396],
  [2309.0, -167.659835, -2660.66498, -2966.79973, 247.850422],
  [492.2, 871.855056, 699.291817, 639.744522, -846.485643],
  [396.1, 44.769698, 153.16722, 131.600209, -1393.124055],
  [288.9, -512.313065, -950.865637, -445.040117, 368.526116],
  [231.1, -819.415595, 499.754645, 584.522874, 749.045012],
  [1610.0, -538.071099, -145.18821, -89.756563, 444.704518],
  [620.0, -189.793622, 558.116553, 524.42963, 235.934465],
  [157.87, -402.922932, -23.923029, -13.549067, 374.049623],
  [220.3, 179.516345, -165.405086, -210.157124, -171.33018],
  [1200.0, -9.814756, 9.344131, -44.919798, -22.899655],
];
const EPS0_V = 84381.406 * ARCSEC;     // J2000 obliquity of the Vondrak model
const EPS0_FRAME = 84381.448 * ARCSEC; // obliquity defining our ecliptic-J2000 data

function ltpPecl(jde: number): [number, number, number] {
  const t = (jde - J2000) / 36525.0;
  let p = 0.0;
  let q = 0.0;
  const w = 2.0 * Math.PI * t;
  for (const [per, c1, c2, s1, s2] of PQ_PER) {
    const a = w / per;
    const ca = Math.cos(a); const sa = Math.sin(a);
    p += ca * c1 + sa * s1;
    q += ca * c2 + sa * s2;
  }
  let tn = 1.0;
  for (let i = 0; i < 4; i++) {
    p += PQ_POL[0][i] * tn;
    q += PQ_POL[1][i] * tn;
    tn *= t;
  }
  p *= ARCSEC;
  q *= ARCSEC;
  const z = Math.sqrt(Math.max(1.0 - p * p - q * q, 0.0));
  const s = Math.sin(EPS0_V); const c = Math.cos(EPS0_V);
  return [p, -q * c - z * s, -q * s + z * c];
}

function ltpPequ(jde: number): [number, number, number] {
  const t = (jde - J2000) / 36525.0;
  let x = 0.0;
  let y = 0.0;
  const w = 2.0 * Math.PI * t;
  for (const [per, c1, c2, s1, s2] of XY_PER) {
    const a = w / per;
    const ca = Math.cos(a); const sa = Math.sin(a);
    x += ca * c1 + sa * s1;
    y += ca * c2 + sa * s2;
  }
  let tn = 1.0;
  for (let i = 0; i < 4; i++) {
    x += XY_POL[0][i] * tn;
    y += XY_POL[1][i] * tn;
    tn *= t;
  }
  x *= ARCSEC;
  y *= ARCSEC;
  return [x, y, Math.sqrt(Math.max(1.0 - x * x - y * y, 0.0))];
}

type V3 = [number, number, number];

/** Rows of the rotation J2000-equatorial -> mean ecliptic/equinox of date
 *  (ERFA eraLtecm): x = equinox, z = ecliptic pole, y = z cross x. */
function ltpEclMatrix(jde: number): [V3, V3, V3] {
  const p = ltpPequ(jde);
  const z = ltpPecl(jde);
  const wx: V3 = [
    p[1] * z[2] - p[2] * z[1], p[2] * z[0] - p[0] * z[2], p[0] * z[1] - p[1] * z[0],
  ];
  const n = Math.sqrt(wx[0] ** 2 + wx[1] ** 2 + wx[2] ** 2);
  const x: V3 = [wx[0] / n, wx[1] / n, wx[2] / n];
  const y: V3 = [
    z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0],
  ];
  return [x, y, z];
}

/** Precession of ecliptic coordinates between epochs (Vondrak 2011):
 *  ecliptic-of-from -> J2000 equatorial -> ecliptic-of-to. */
export function precessEcliptic(
  lon: number, lat: number, jdeFrom: number, jdeTo: number,
): [number, number] {
  const cb = Math.cos(lat);
  const v: V3 = [cb * Math.cos(lon), cb * Math.sin(lon), Math.sin(lat)];
  const [xf, yf, zf] = ltpEclMatrix(jdeFrom);
  const e: V3 = [0, 1, 2].map(
    (i) => xf[i] * v[0] + yf[i] * v[1] + zf[i] * v[2],
  ) as V3;
  const [xt, yt, zt] = ltpEclMatrix(jdeTo);
  const u: V3 = [
    xt[0] * e[0] + xt[1] * e[1] + xt[2] * e[2],
    yt[0] * e[0] + yt[1] * e[1] + yt[2] * e[2],
    zt[0] * e[0] + zt[1] * e[1] + zt[2] * e[2],
  ];
  return [mod(Math.atan2(u[1], u[0]), TWO_PI),
    Math.asin(Math.max(-1, Math.min(1, u[2])))];
}

/** Rotate a vector from the ecliptic-J2000 data frame (obliquity 84381.448
 *  arcsec, as used by Horizons/Meeus) to the mean ecliptic of date
 *  (Vondrak 2011). */
function eclJ2000ToEclDate(
  v: [number, number, number], jde: number,
): [number, number, number] {
  const [x, y, z] = v;
  const s = Math.sin(EPS0_FRAME); const c = Math.cos(EPS0_FRAME);
  const e: V3 = [x, y * c - z * s, y * s + z * c];
  const [xt, yt, zt] = ltpEclMatrix(jde);
  return [
    xt[0] * e[0] + xt[1] * e[1] + xt[2] * e[2],
    yt[0] * e[0] + yt[1] * e[1] + yt[2] * e[2],
    zt[0] * e[0] + zt[1] * e[1] + zt[2] * e[2],
  ];
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
 *  (matched to Swiss Ephemeris 2.10 to 1e-9 deg); propagation uses Vondrak
 *  2011 ecliptic precession, the same model Swiss Ephemeris uses:
 *  agreement over 1900-2099 is <=0.005 arcsec. */
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

const GM_EARTH_MOON = 403503.2356 * 86400.0 ** 2; // km^3/day^2

/** Osculating apogee point from a geocentric lunar state vector (km,
 *  km/day): apparent ecliptic lon/lat of date (rad) + distance (km).
 *  Hypersensitive to the lunar theory: the eccentricity vector amplifies
 *  position/velocity differences ~1/e (~18x). Swiss Ephemeris in Moshier
 *  mode differs from our DE423 fit by up to ~3 arcmin here; published
 *  'True Lilith' values disagree across software at that scale. */
function oscApogeeFromState(
  data: EngineData, x: number, y: number, z: number,
  vx: number, vy: number, vz: number, jde: number, frameJ2000: boolean,
): [number, number, number] {
  const mu = GM_EARTH_MOON;
  const r = Math.sqrt(x * x + y * y + z * z);
  const v2 = vx * vx + vy * vy + vz * vz;
  const rv = x * vx + y * vy + z * vz;
  const ex = (v2 * x - rv * vx) / mu - x / r;
  const ey = (v2 * y - rv * vy) / mu - y / r;
  const ez = (v2 * z - rv * vz) / mu - z / r;
  const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const a = 1.0 / (2.0 / r - v2 / mu);
  const s = (a * (1 + e)) / e;
  let px = -ex * s;
  let py = -ey * s;
  let pz = -ez * s;
  if (frameJ2000) [px, py, pz] = eclJ2000ToEclDate([px, py, pz], jde);
  const lon = mod(Math.atan2(py, px) + nutation(data, jde)[0], TWO_PI);
  const lat = Math.atan2(pz, Math.hypot(px, py));
  return [lon, lat, Math.sqrt(px * px + py * py + pz * pz)];
}

/** Osculating lunar apogee (True Lilith) from the Chebyshev moon. */
export function oscApogeePrecise(
  data: EngineData, cheb: ChebSeries, jde: number,
): [number, number, number] {
  const [[x, y, z], [vx, vy, vz]] = cheb.xyzVel(jde);
  return oscApogeeFromState(data, x, y, z, vx, vy, vz, jde, true);
}

/** Series fallback outside the Chebyshev range (same finite-difference
 *  state as the true-node fallback). */
export function oscApogeeSeries(
  data: EngineData, jde: number,
): [number, number, number] {
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
  return oscApogeeFromState(
    data, x, y, z,
    (x1 - x0) / (2 * h), (y1 - y0) / (2 * h), (z1 - z0) / (2 * h),
    jde, false,
  );
}

/** Constant-element two-body orbit with the same xyz(jde) interface as
 *  ChebSeries, so chironApparent takes either. */
export class KeplerOrbit implements XyzSource {
  constructor(private els: KeplerElements, private epoch: number) {}

  xyz(jde: number): [number, number, number] {
    const { a, e, i, node, peri: w, M0, n } = this.els;
    const M = M0 + n * (jde - this.epoch);
    let E = M;
    for (let k = 0; k < 30; k++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    const xv = a * (Math.cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w); const sw = Math.sin(w);
    const cn = Math.cos(node); const sn = Math.sin(node);
    const ci = Math.cos(i); const si = Math.sin(i);
    const xp = xv * cw - yv * sw;
    const yp = xv * sw + yv * cw;
    return [xp * cn - yp * sn * ci, xp * sn + yp * cn * ci, yp * si];
  }
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
  data: EngineData, cheb: XyzSource, jde: number,
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
