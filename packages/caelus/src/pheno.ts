/**
 * astroengine pheno -- phase, elongation, apparent diameter, magnitude,
 * equation of time, horizontal coordinates, refraction.
 *
 * Magnitude models: Mallama & Hilton 2018 for Mercury-Saturn (Saturn with
 * the ring term), constant-plus-distance for Sun and Pluto, the Mallama
 * secular ramp for Neptune, Allen's phase law for the Moon (valid to phase
 * angle ~140 deg; the Moon is invisible near conjunction anyway).
 * Validated against swe_pheno (Swiss Ephemeris 2.10, Moshier mode).
 */
import {
  DEG, J2000, mod, jdTT, trueObliquity, equatorial, sunApparent, EngineData,
} from "./core.js";
import { gast } from "./houses.js";
import { Engine, BodyId } from "./chart.js";

const TWO_PI = 2 * Math.PI;
const KM_PER_AU = 149597870.7;

/** Equatorial diameters, km (IAU values, as used by Swiss Ephemeris). */
export const DIAMETER_KM: Record<string, number> = {
  sun: 1392000.0, moon: 3475.0, mercury: 4878.8, venus: 12103.6,
  mars: 6779.0, jupiter: 139822.0, saturn: 116464.0,
  uranus: 50724.0, neptune: 49244.0, pluto: 2376.6,
};

export interface Pheno {
  phaseAngle: number;   // deg
  phase: number;        // illuminated fraction
  elongation: number;   // deg
  diameter: number;     // apparent diameter, deg
  magnitude: number;
}

function magnitude(
  body: string, a: number, r: number, dlt: number, jde: number,
  lonDeg: number, latDeg: number,
): number {
  const x = 5 * Math.log10(r * dlt);
  switch (body) {
    case "sun":
      return -26.86 + 5 * Math.log10(dlt);
    case "moon":
      // Allen phase law; constant solved against swe_pheno (a < 130).
      return 0.233431 + x + 0.026 * Math.abs(a) + 4e-9 * a ** 4;
    case "mercury":
      return x - 0.613 + 6.328e-2 * a - 1.6336e-3 * a ** 2 + 3.3644e-5 * a ** 3
        - 3.4265e-7 * a ** 4 + 1.6893e-9 * a ** 5 - 3.0334e-12 * a ** 6;
    case "venus":
      if (a <= 163.7) {
        return x - 4.384 - 1.044e-3 * a + 3.687e-4 * a ** 2
          - 2.814e-6 * a ** 3 + 8.938e-9 * a ** 4;
      }
      return x + 236.05828 - 2.81914 * a + 8.39034e-3 * a ** 2;
    case "mars":
      return x - 1.601 + 2.267e-2 * a - 1.302e-4 * a ** 2;
    case "jupiter":
      return x - 9.395 - 3.7e-4 * a + 6.16e-4 * a ** 2;
    case "saturn": {
      // ring inclination (Meeus ch. 45)
      const T = (jde - J2000) / 36525.0;
      const i = (28.075216 - 0.012998 * T + 0.000004 * T * T) * DEG;
      const om = (169.50847 + 1.394681 * T + 0.000412 * T * T) * DEG;
      const lam = lonDeg * DEG;
      const bet = latDeg * DEG;
      const sinB = Math.sin(i) * Math.cos(bet) * Math.sin(lam - om)
        - Math.cos(i) * Math.sin(bet);
      const b = Math.abs(Math.asin(Math.max(-1.0, Math.min(1.0, sinB))));
      return x - 8.914 - 1.825 * Math.sin(b) + 0.026 * a
        - 0.378 * Math.sin(b) * Math.exp(-2.25 * a);
    }
    case "uranus":
      // constant absorbs Mallama's sub-solar-latitude term
      return x - 7.16 + 6.587e-3 * a + 1.045e-4 * a ** 2;
    case "neptune": {
      const y = 2000.0 + (jde - J2000) / 365.25;
      const base = y < 1980.0 ? -6.89
        : y < 2000.0 ? -6.89 - (0.11 * (y - 1980.0)) / 20.0
          : -7.0;
      return x + base + 7.944e-3 * a + 9.617e-5 * a ** 2;
    }
    default: // pluto
      return x - 1.01;
  }
}

/**
 * Photometric and apparent-geometry quantities for a body at an instant: its
 * phase angle, illuminated fraction, elongation from the Sun, apparent disc
 * diameter, and apparent visual magnitude.
 *
 * @param engine The engine used to evaluate positions.
 * @param body A body with known physical dimensions (Sun, Moon, the planets).
 * @param jdUt Julian Day (UT).
 * @returns A {@link Pheno}: `phaseAngle` (deg), `phase` (lit fraction `0`–`1`),
 *   `elongation` (deg), `diameter` (deg), and `magnitude`.
 * @throws Error if `body` has no photometric data.
 * @example
 * ```ts
 * pheno(engine, "venus", julianDay(2025, 6, 1)).phase; // illuminated fraction
 * ```
 */
export function pheno(engine: Engine, body: BodyId, jdUt: number): Pheno {
  if (DIAMETER_KM[body] === undefined) {
    throw new Error(`pheno not available for '${body}'`);
  }
  const jde = jdTT(jdUt);
  const p = engine.position(body, jdUt);
  const s = body === "sun" ? p : engine.position("sun", jdUt);
  const dlt = p.dist!;
  const a1 = p.lon * DEG;
  const d1 = p.lat * DEG;
  const a2 = s.lon * DEG;
  const d2 = s.lat * DEG;
  const elong = Math.acos(Math.max(-1.0, Math.min(1.0,
    Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2),
  )));
  let phaseAngle: number;
  let r: number;
  if (body === "sun") {
    phaseAngle = 0.0;
    r = dlt;
  } else if (body === "moon") {
    r = s.dist!; // sun-earth distance stands in for sun-moon
    const R = s.dist!;
    phaseAngle = Math.atan2(R * Math.sin(elong), dlt - R * Math.cos(elong));
  } else {
    r = engine.heliocentric(body, jdUt).dist;
    const cosi = (r * r + dlt * dlt - s.dist! ** 2) / (2 * r * dlt);
    phaseAngle = Math.acos(Math.max(-1.0, Math.min(1.0, cosi)));
  }
  const aDeg = phaseAngle / DEG;
  const diam = (2 * Math.asin(DIAMETER_KM[body] / (2 * dlt * KM_PER_AU))) / DEG;
  return {
    phaseAngle: aDeg,
    phase: (1 + Math.cos(phaseAngle)) / 2,
    elongation: elong / DEG,
    diameter: diam,
    magnitude: magnitude(body, aDeg, r, dlt, jde, p.lon, p.lat),
  };
}

/** Apparent minus mean solar time, minutes (Meeus ch. 28). */
export function equationOfTime(engine: Engine, jdUt: number): number {
  const jde = jdTT(jdUt);
  const t = (jde - J2000) / 365250.0;
  const l0 = mod(280.4664567 + 360007.6982779 * t + 0.03032028 * t * t
    + t ** 3 / 49931 - t ** 4 / 15300 - t ** 5 / 2000000, 360);
  const [lon, lat] = sunApparent(engine.data, jde);
  const [ra] = equatorial(lon, lat, trueObliquity(engine.data, jde));
  const e = mod(l0 - 0.0057183 - ra / DEG + 180, 360) - 180;
  return e * 4.0; // degrees -> minutes
}

/** Apparent ecliptic position -> azimuth (deg, from true north, east-
 *  positive) and true altitude (deg). No refraction. */
export function azAlt(
  data: EngineData, lonDeg: number, latDeg: number, jdUt: number,
  obsLat: number, obsLonEast: number,
): [number, number] {
  const jde = jdTT(jdUt);
  const eps = trueObliquity(data, jde);
  const [ra, dec] = equatorial(lonDeg * DEG, latDeg * DEG, eps);
  const lst = mod(gast(data, jdUt) + obsLonEast * DEG, TWO_PI);
  const ha = lst - ra;
  const phi = obsLat * DEG;
  const alt = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha),
  );
  const azS = Math.atan2(
    Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );
  return [mod(azS / DEG + 180.0, 360.0), alt / DEG];
}

/** Saemundsson refraction, degrees. Returns the input unchanged when even
 *  the refracted altitude stays below the horizon (matches Swiss
 *  Ephemeris). */
export function refractTrueToApparent(
  altDeg: number, pressure = 1013.25, tempC = 15.0,
): number {
  if (altDeg < -2.0) return altDeg;
  let r = 1.02 / Math.tan((altDeg + 10.3 / (altDeg + 5.11)) * DEG);
  r *= (pressure / 1010.0) * (283.0 / (273.0 + tempC));
  const out = altDeg + r / 60.0;
  return out < 0.0 ? altDeg : out;
}

/** Bennett refraction, degrees. */
export function refractApparentToTrue(
  altDeg: number, pressure = 1013.25, tempC = 15.0,
): number {
  if (altDeg < -2.0) return altDeg;
  let r = 1.0 / Math.tan((altDeg + 7.31 / (altDeg + 4.4)) * DEG);
  r *= (pressure / 1010.0) * (283.0 / (273.0 + tempC));
  return altDeg - r / 60.0;
}
