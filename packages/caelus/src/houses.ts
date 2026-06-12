/** astroengine houses -- sidereal time, angles, house systems. */
import {
  DEG, J2000, mod, nutation, trueObliquity, jdTT, EngineData,
} from "./core.js";

const TWO_PI = 2 * Math.PI;

/** Greenwich mean sidereal time, radians (IAU 1982 / Meeus 12.4). */
export function gmst(jdUt: number): number {
  const T = (jdUt - J2000) / 36525.0;
  const deg = 280.46061837 + 360.98564736629 * (jdUt - J2000)
    + 0.000387933 * T * T - T ** 3 / 38710000.0;
  return mod(deg, 360.0) * DEG;
}

/** Greenwich apparent sidereal time. */
export function gast(data: EngineData, jdUt: number): number {
  const jde = jdTT(jdUt);
  const [dpsi] = nutation(data, jde);
  const eps = trueObliquity(data, jde);
  return mod(gmst(jdUt) + dpsi * Math.cos(eps), TWO_PI);
}

/** Ascendant, MC, ARMC, obliquity. East longitude positive. */
export function angles(
  data: EngineData, jdUt: number, latDeg: number, lonDeg: number,
): [number, number, number, number] {
  const jde = jdTT(jdUt);
  const eps = trueObliquity(data, jde);
  const armc = mod(gast(data, jdUt) + lonDeg * DEG, TWO_PI);
  const phi = latDeg * DEG;
  const mc = mod(Math.atan2(Math.sin(armc), Math.cos(armc) * Math.cos(eps)), TWO_PI);
  const asc = mod(Math.atan2(
    Math.cos(armc),
    -(Math.sin(armc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
  ), TWO_PI);
  return [asc, mc, armc, eps];
}

export function housesWholeSign(asc: number): number[] {
  const first = Math.floor(asc / (30 * DEG)) * 30 * DEG;
  return Array.from({ length: 12 }, (_, i) => mod(first + i * 30 * DEG, TWO_PI));
}

export function housesEqual(asc: number): number[] {
  return Array.from({ length: 12 }, (_, i) => mod(asc + i * 30 * DEG, TWO_PI));
}

export function housesPorphyry(asc: number, mc: number): number[] {
  const ic = mod(mc + Math.PI, TWO_PI);
  const dsc = mod(asc + Math.PI, TWO_PI);
  const span = (a: number, b: number) => mod(b - a, TWO_PI);
  const cusps = new Array<number>(12).fill(0);
  cusps[0] = asc;
  cusps[9] = mc;
  let s = span(mc, asc) / 3.0;
  cusps[10] = mod(mc + s, TWO_PI);
  cusps[11] = mod(mc + 2 * s, TWO_PI);
  s = span(asc, ic) / 3.0;
  cusps[1] = mod(asc + s, TWO_PI);
  cusps[2] = mod(asc + 2 * s, TWO_PI);
  cusps[3] = ic;
  cusps[6] = dsc;
  cusps[4] = mod(cusps[10] + Math.PI, TWO_PI);
  cusps[5] = mod(cusps[11] + Math.PI, TWO_PI);
  cusps[7] = mod(cusps[1] + Math.PI, TWO_PI);
  cusps[8] = mod(cusps[2] + Math.PI, TWO_PI);
  return cusps;
}

/**
 * Placidus cusps via the classic iterative scheme. Semi-arc derivation:
 * for ALL four intermediate cusps RA = ARMC + offset + f*AD with
 * AD = asin(tan(phi) tan(dec)); offsets 30/60/120/150, f = 1/3,2/3,2/3,1/3.
 * Undefined above the polar circles (as Placidus itself is).
 */
export function housesPlacidus(armc: number, phi: number, eps: number): number[] {
  const cusp = (offsetDeg: number, f: number): number => {
    let lam = mod(armc + offsetDeg * DEG, TWO_PI);
    for (let i = 0; i < 50; i++) {
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      let x = Math.tan(phi) * Math.tan(dec);
      x = Math.max(-1.0, Math.min(1.0, x));
      const ad = Math.asin(x);
      const raI = mod(armc + offsetDeg * DEG + f * ad, TWO_PI);
      const lamNew = mod(
        Math.atan2(Math.sin(raI), Math.cos(raI) * Math.cos(eps)), TWO_PI,
      );
      if (Math.abs(mod(lamNew - lam + Math.PI, TWO_PI) - Math.PI) < 1e-10) {
        lam = lamNew;
        break;
      }
      lam = lamNew;
    }
    return lam;
  };

  const mc = mod(Math.atan2(Math.sin(armc), Math.cos(armc) * Math.cos(eps)), TWO_PI);
  const asc = mod(Math.atan2(
    Math.cos(armc),
    -(Math.sin(armc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
  ), TWO_PI);
  const cusps = new Array<number>(12).fill(0);
  cusps[0] = asc;
  cusps[9] = mc;
  cusps[10] = cusp(30, 1.0 / 3.0);
  cusps[11] = cusp(60, 2.0 / 3.0);
  cusps[1] = cusp(120, 2.0 / 3.0);
  cusps[2] = cusp(150, 1.0 / 3.0);
  cusps[3] = mod(mc + Math.PI, TWO_PI);
  cusps[6] = mod(asc + Math.PI, TWO_PI);
  cusps[4] = mod(cusps[10] + Math.PI, TWO_PI);
  cusps[5] = mod(cusps[11] + Math.PI, TWO_PI);
  cusps[7] = mod(cusps[1] + Math.PI, TWO_PI);
  cusps[8] = mod(cusps[2] + Math.PI, TWO_PI);
  return cusps;
}
