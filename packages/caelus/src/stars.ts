/**
 * astroengine stars -- fixed stars: apparent places from the HYG-derived
 * catalog (data/fixed_stars.json; ICRS J2000 with proper motions).
 *
 * Chain: full 3D space motion (proper motion + radial velocity at the
 * parallax distance) -> ICRS equatorial -> ecliptic J2000 -> Vondrak 2011
 * precession to date -> annual aberration (classic elliptic form, as for
 * Pluto/Chiron) -> nutation. Validated against swe_fixstar fed the same
 * catalog rows: <=0.3 arcsec over 1900-2099.
 */
import {
  DEG, ARCSEC, J2000, mod, nutation, precessEcliptic, vsopHeliocentric,
  EngineData,
} from "./core.js";

const TWO_PI = 2 * Math.PI;
const KM_PER_AU = 149597870.7;
const AU_PER_PC = 206264.806;

export interface StarEntry {
  ra: number; dec: number;        // ICRS J2000, degrees
  pmra: number; pmdec: number;    // mas/yr (mu_alpha*)
  rv: number;                     // km/s
  plx: number;                    // mas
  mag: number;
  bayer: string;
}

export interface StarPack {
  provenance: string;
  frame: string;
  stars: Record<string, StarEntry>;
}

/** Constellation figure lines and labels; vertices as ecliptic J2000 (lon, lat)
 *  degrees. Built by scripts/build-constellations.mjs from d3-celestial. */
export interface ConstellationPack {
  provenance: string;
  // segs: per figure, a list of polylines; each point is [eclLonDeg, eclLatDeg]
  // (J2000). Typed loosely because static JSON imports widen tuples to number[].
  lines: { con: string; segs: number[][][] }[];
  labels: { name: string; con: string; lon: number; lat: number }[];
}

/** Apparent ecliptic [lon, lat] of date (rad) for a catalog entry. */
export function starApparent(
  data: EngineData, s: StarEntry, jde: number,
): [number, number] {
  const t = (jde - J2000) / 365.25;
  const ra = s.ra * DEG;
  const dec = s.dec * DEG;
  const rAu = s.plx > 0 ? AU_PER_PC / (s.plx * 1e-3) : 1e9 * AU_PER_PC;
  const cd = Math.cos(dec); const sd = Math.sin(dec);
  const cr = Math.cos(ra); const sr = Math.sin(ra);
  const p = [cd * cr, cd * sr, sd];
  const east = [-sr, cr, 0.0];
  const north = [-sd * cr, -sd * sr, cd];
  const pmra = s.pmra * 1e-3 * ARCSEC;
  const pmdec = s.pmdec * 1e-3 * ARCSEC;
  const rv = (s.rv * 86400 * 365.25) / KM_PER_AU;
  const pos = [0, 1, 2].map((i) =>
    p[i] * rAu + (east[i] * pmra * rAu + north[i] * pmdec * rAu + p[i] * rv) * t);
  const rn = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  const x = pos[0] / rn; const y = pos[1] / rn; const z = pos[2] / rn;
  const ra2 = Math.atan2(y, x);
  const dec2 = Math.asin(z);
  const e0 = 84381.448 * ARCSEC;
  let lat = Math.asin(
    Math.sin(dec2) * Math.cos(e0) - Math.cos(dec2) * Math.sin(e0) * Math.sin(ra2),
  );
  let lon = mod(Math.atan2(
    Math.sin(ra2) * Math.cos(e0) + Math.tan(dec2) * Math.sin(e0), Math.cos(ra2),
  ), TWO_PI);
  [lon, lat] = precessEcliptic(lon, lat, J2000, jde);
  const [L0] = vsopHeliocentric(data.vsop.earth, jde);
  const sunLon = mod(L0 + Math.PI, TWO_PI);
  const T = (jde - J2000) / 36525.0;
  const k = 20.4898 * ARCSEC;
  const e = 0.016708634 - 0.000042037 * T;
  const piPer = (102.93735 + 1.71946 * T) * DEG;
  lon += (-k * Math.cos(sunLon - lon) + e * k * Math.cos(piPer - lon)) / Math.cos(lat);
  lat += -k * Math.sin(lat) * (Math.sin(sunLon - lon) - e * Math.sin(piPer - lon));
  lon = mod(lon + nutation(data, jde)[0], TWO_PI);
  return [lon, lat];
}
