/**
 * astroengine vargas -- Vedic divisional charts (vargas).
 *
 * A varga D-n divides each 30-degree sign into n equal parts and maps each part
 * to a sign by a classical (Parashari) rule. This covers the unambiguous,
 * textbook set: D1 (rasi), D3 (drekkana), D9 (navamsa), D10 (dasamsa), and D12
 * (dwadasamsa); the contested hora (D2) and unequal trimsamsa (D30) are left to
 * a later step. Rules (rasi/div 0-based; an "odd sign" is the 1st, 3rd, ... =
 * even rasi index): D1 the sign; D3 (rasi + 4*div); D9 element start
 * ([Aries, Capricorn, Libra, Cancer] by element) + div; D10 odd (rasi + div),
 * even (rasi + 8 + div); D12 (rasi + div). Computed from rasi = floor(lon/30)
 * and div = floor(within/(30/n)) so sign boundaries stay robust and
 * `Math.floor` matches Python's `math.floor`. Built on the validated sidereal
 * longitudes. Mirrors the Python reference (astroengine/vargas.py).
 */
import { Engine, BodyId, BODIES, SIGNS, Zodiac } from "./chart.js";

/** Element start sign for the navamsa (fire, earth, air, water by rasi % 4). */
const NAVAMSA_START = [0, 9, 6, 3];
/** Supported divisions. */
export const VARGA_DIVISIONS = [1, 2, 3, 9, 10, 12, 30] as const;

// Trimsamsa (D30): five unequal degree-bands per sign mapping to a non-luminary's
// sign. Odd: Mars 0-5 -> Aries, Saturn 5-10 -> Aquarius, Jupiter 10-18 ->
// Sagittarius, Mercury 18-25 -> Gemini, Venus 25-30 -> Libra. Even reverses with
// the planets' even signs. Each is [upper-degree-bound, result sign index].
const TRIMSAMSA_ODD: Array<[number, number]> = [[5, 0], [10, 10], [18, 8], [25, 2], [30, 6]];
const TRIMSAMSA_EVEN: Array<[number, number]> = [[5, 1], [12, 5], [20, 11], [25, 9], [30, 7]];

function trimsamsa(rasi: number, within: number): [number, number] {
  const bands = rasi % 2 === 0 ? TRIMSAMSA_ODD : TRIMSAMSA_EVEN;
  for (let i = 0; i < bands.length; i++) if (within < bands[i][0]) return [bands[i][1], i + 1];
  return [bands[bands.length - 1][1], 5];
}

function vargaSign(rasi: number, div: number, n: number): number {
  switch (n) {
    case 1: return rasi;
    // Parashari hora: odd sign first half -> Leo, second half -> Cancer; even
    // sign reversed (odd sign == even rasi index).
    case 2: return ((rasi % 2 === 0) === (div === 0)) ? 4 : 3;
    case 3: return (rasi + 4 * div) % 12;
    case 9: return (NAVAMSA_START[rasi % 4] + div) % 12;
    case 10: return rasi % 2 === 0 ? (rasi + div) % 12 : (rasi + 8 + div) % 12;
    case 12: return (rasi + div) % 12;
    default: throw new Error(`unsupported varga D${n}`);
  }
}

export interface Varga {
  varga: number;
  rasi: string;
  rasi_index: number;
  sign: string;
  sign_index: number;
  division: number;
}

/** The varga D-n placement of a sidereal longitude. */
export function varga(siderealLon: number, n: number): Varga {
  const lon = ((siderealLon % 360) + 360) % 360;
  const rasi = Math.floor(lon / 30) % 12;
  const within = lon - rasi * 30;
  let s: number;
  let division: number;
  if (n === 30) { // trimsamsa: unequal bands
    [s, division] = trimsamsa(rasi, within);
  } else {
    let div = Math.floor(within / (30 / n));
    if (div >= n) div = n - 1; // guard a boundary rounding to n
    s = vargaSign(rasi, div, n);
    division = div + 1;
  }
  return { varga: n, rasi: SIGNS[rasi], rasi_index: rasi, sign: SIGNS[s], sign_index: s, division };
}

/** The varga D-n of a body (default the Moon) at jd, in a sidereal zodiac. */
export function vargaAt(
  engine: Engine, jdUt: number, n: number, body: BodyId = "moon", zodiac: Zodiac = "sidereal:lahiri",
): Varga {
  return varga(engine.longitude(body, jdUt, { zodiac }), n);
}

/** The full divisional chart D-n at jd: the varga sign of each body. */
export function vargaChart(
  engine: Engine, jdUt: number, n: number, bodies: BodyId[] = BODIES as unknown as BodyId[],
  zodiac: Zodiac = "sidereal:lahiri",
): Record<string, Varga> {
  const out: Record<string, Varga> = {};
  for (const b of bodies) out[b] = varga(engine.longitude(b, jdUt, { zodiac }), n);
  return out;
}
