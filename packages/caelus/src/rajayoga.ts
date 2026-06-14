/**
 * astroengine rajayoga -- the lordship-and-aspect layer for Vedic yogas, and the
 * raja/dhana yogas built on it.
 *
 * Layers: house lordship (traditional ruler of each whole-sign house from the
 * Ascendant); graha drishti (every planet aspects the 7th sign; Mars also 4/8,
 * Jupiter 5/9, Saturn 3/10); association (conjunction, mutual aspect, or
 * parivartana exchange); then raja yoga (a kendra lord 1/4/7/10 associated with
 * a trikona lord 1/5/9), dhana yoga (two wealth-house 2/5/9/11 lords), and the
 * yogakaraka (a planet ruling both a pure kendra 4/7/10 and a pure trikona 5/9).
 * Definitions follow BPHS, validated against the named source in
 * `validate_jyotish`. Mirrors the Python reference (astroengine/rajayoga.py).
 */
import { Engine, BodyId, Zodiac } from "./chart.js";
import { SIGN_RULERS } from "./profections.js";

/** Graha drishti: the house-distances (1-based) each planet aspects. */
export const DRISHTI: Record<string, number[]> = {
  sun: [7], moon: [7], mercury: [7], venus: [7],
  mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10],
};
export const KENDRAS = [1, 4, 7, 10];
export const TRIKONAS = [1, 5, 9];
export const DHANA_HOUSES = [2, 5, 9, 11];
const PURE_KENDRAS = [4, 7, 10];
const PURE_TRIKONAS = [5, 9];
const PLANETS: BodyId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** The traditional ruler of a sign index (0 = Aries). */
export function signLord(sign: number): string {
  return SIGN_RULERS[((sign % 12) + 12) % 12];
}

/** The sign on the given whole-sign house (1-12) from the Ascendant. */
export function houseSign(ascSign: number, house: number): number {
  return (ascSign + house - 1) % 12;
}

/** The lord of the given whole-sign house from the Ascendant. */
export function houseLord(ascSign: number, house: number): string {
  return signLord(houseSign(ascSign, house));
}

/** The whole-sign house (1-12) a sign falls in from the Ascendant. */
export function houseFromAsc(ascSign: number, sign: number): number {
  return ((sign - ascSign) % 12 + 12) % 12 + 1;
}

/** Whether `planet` at `planetSign` casts a graha drishti onto `targetSign`. */
export function aspectsSign(planet: string, planetSign: number, targetSign: number): boolean {
  const dist = ((targetSign - planetSign) % 12 + 12) % 12 + 1;
  return (DRISHTI[planet] ?? [7]).includes(dist);
}

/** Sign exchange: a sits in b's sign and b sits in a's sign. */
export function parivartana(planetA: string, signA: number, planetB: string, signB: number): boolean {
  return signLord(signA) === planetB && signLord(signB) === planetA;
}

/** How two planets associate: "conjunction" | "exchange" | "aspect" | null. */
export function associationType(
  planetA: string, signA: number, planetB: string, signB: number,
): string | null {
  if (planetA === planetB) return null;
  if (signA === signB) return "conjunction";
  if (parivartana(planetA, signA, planetB, signB)) return "exchange";
  if (aspectsSign(planetA, signA, signB) && aspectsSign(planetB, signB, signA)) return "aspect";
  return null;
}

/** Planets ruling both a pure kendra (4/7/10) and a pure trikona (5/9), sorted. */
export function yogakarakas(ascSign: number): string[] {
  const out: string[] = [];
  for (const p of PLANETS) {
    const ruled = new Set<number>();
    for (let h = 1; h <= 12; h++) if (houseLord(ascSign, h) === p) ruled.add(h);
    if (PURE_KENDRAS.some((h) => ruled.has(h)) && PURE_TRIKONAS.some((h) => ruled.has(h))) out.push(p);
  }
  return out.sort();
}

export interface LordPairYoga { lords: string[]; via: string; }

function lordPairYogas(
  ascSign: number, signs: Record<string, number>, housesA: number[], housesB: number[],
): LordPairYoga[] {
  const lordsA = [...new Set(housesA.map((h) => houseLord(ascSign, h)))].sort();
  const lordsB = [...new Set(housesB.map((h) => houseLord(ascSign, h)))].sort();
  const seen = new Map<string, string>();
  for (const la of lordsA) {
    for (const lb of lordsB) {
      const via = associationType(la, signs[la], lb, signs[lb]);
      if (via === null) continue;
      const pair = [la, lb].sort().join("|");
      if (!seen.has(pair)) seen.set(pair, via);
    }
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pair, via]) => ({ lords: pair.split("|"), via }));
}

/** Raja yogas: associations between a kendra lord and a trikona lord. */
export function rajaYogas(signs: Record<string, number>, ascSign: number): LordPairYoga[] {
  return lordPairYogas(ascSign, signs, KENDRAS, TRIKONAS);
}

/** Dhana yogas: associations between two wealth-house (2/5/9/11) lords. */
export function dhanaYogas(signs: Record<string, number>, ascSign: number): LordPairYoga[] {
  return lordPairYogas(ascSign, signs, DHANA_HOUSES, DHANA_HOUSES);
}

function signsOf(engine: Engine, natalJd: number, lat: number, lonEast: number, zodiac: Zodiac) {
  const chart = engine.chartAt(natalJd, lat, lonEast, { zodiac });
  const ascSign = Math.floor(chart.angles.asc / 30) % 12;
  const signs: Record<string, number> = {};
  for (const p of PLANETS) signs[p] = Math.floor(chart.bodies[p].lon / 30) % 12;
  return { signs, ascSign };
}

/** Raja yogas of a natal chart, with the chart's yogakarakas. */
export function rajaYogasAt(
  engine: Engine, natalJd: number, lat: number, lonEast: number, zodiac: Zodiac = "sidereal:lahiri",
): { raja: LordPairYoga[]; yogakarakas: string[] } {
  const { signs, ascSign } = signsOf(engine, natalJd, lat, lonEast, zodiac);
  return { raja: rajaYogas(signs, ascSign), yogakarakas: yogakarakas(ascSign) };
}

/** Dhana yogas of a natal chart. */
export function dhanaYogasAt(
  engine: Engine, natalJd: number, lat: number, lonEast: number, zodiac: Zodiac = "sidereal:lahiri",
): LordPairYoga[] {
  const { signs, ascSign } = signsOf(engine, natalJd, lat, lonEast, zodiac);
  return dhanaYogas(signs, ascSign);
}
