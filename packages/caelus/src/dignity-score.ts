/**
 * Weighted essential dignities (Ptolemaic / Lilly).
 *
 * Extends the qualitative {@link dignities} to the five-fold essential-dignity
 * scoring of traditional astrology, with William Lilly's classical weights
 * (*Christian Astrology*, 1647): rulership +5, exaltation +4, triplicity +3,
 * term +2, face +1; detriment -5, fall -4.
 *
 * Tables, each pinned to a named authority and selectable where they vary:
 * triplicity by the Dorothean rulers (day / night / participating); terms by the
 * Egyptian bounds (Ptolemy, *Tetrabiblos* I.21); faces by the Chaldean order
 * from 0 Aries. Peregrine (none of the five dignities present) is reported as a
 * flag, not auto-scored, so `total` is a pure dignity sum. Port of the Python
 * reference `astroengine.dignity_score`, pinned by `dignity-golden`.
 */
import { mod } from "./core.js";
import { DOMICILE, EXALTATION } from "./chart.js";

export const PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

export const DIGNITY_WEIGHTS: Record<string, number> = {
  rulership: 5, exaltation: 4, triplicity: 3, term: 2, face: 1, detriment: -5, fall: -4,
};

/** Dorothean triplicity rulers by element (sign%4), as [day, night, participating]. */
export const TRIPLICITY: string[][] = [
  ["sun", "jupiter", "saturn"],     // fire
  ["venus", "moon", "mars"],        // earth
  ["saturn", "mercury", "jupiter"], // air
  ["venus", "mars", "moon"],        // water
];

/** Egyptian terms (Ptolemy I.21): per sign, [ruler, upper-degree] segments. */
export const TERMS_EGYPTIAN: Array<Array<[string, number]>> = [
  [["jupiter", 6], ["venus", 12], ["mercury", 20], ["mars", 25], ["saturn", 30]],   // Aries
  [["venus", 8], ["mercury", 14], ["jupiter", 22], ["saturn", 27], ["mars", 30]],    // Taurus
  [["mercury", 6], ["jupiter", 12], ["venus", 17], ["mars", 24], ["saturn", 30]],    // Gemini
  [["mars", 7], ["venus", 13], ["mercury", 19], ["jupiter", 26], ["saturn", 30]],    // Cancer
  [["jupiter", 6], ["venus", 11], ["saturn", 18], ["mercury", 24], ["mars", 30]],    // Leo
  [["mercury", 7], ["venus", 17], ["jupiter", 21], ["mars", 28], ["saturn", 30]],    // Virgo
  [["saturn", 6], ["mercury", 14], ["jupiter", 21], ["venus", 28], ["mars", 30]],    // Libra
  [["mars", 7], ["venus", 11], ["mercury", 19], ["jupiter", 24], ["saturn", 30]],    // Scorpio
  [["jupiter", 12], ["venus", 17], ["mercury", 21], ["saturn", 26], ["mars", 30]],   // Sagittarius
  [["mercury", 7], ["jupiter", 14], ["venus", 22], ["saturn", 26], ["mars", 30]],    // Capricorn
  [["mercury", 7], ["venus", 13], ["jupiter", 20], ["mars", 25], ["saturn", 30]],    // Aquarius
  [["venus", 12], ["jupiter", 16], ["mercury", 19], ["mars", 28], ["saturn", 30]],   // Pisces
];

/** Faces (decans): Chaldean order from Mars at 0 Aries; floor(lon/10) selects. */
export const FACE_CYCLE = ["mars", "sun", "venus", "mercury", "moon", "saturn", "jupiter"];

export type Sect = "day" | "night";

export function termRuler(sign: number, degInSign: number, terms = TERMS_EGYPTIAN): string {
  for (const [ruler, upper] of terms[sign]) if (degInSign < upper) return ruler;
  return terms[sign][terms[sign].length - 1][0];
}

export function faceRuler(lon: number): string {
  return FACE_CYCLE[Math.floor(mod(lon, 360) / 10) % 7];
}

/** The essential-dignity breakdown of a planet at a longitude. */
export interface DignityScore {
  planet: string;
  rulership: number;
  exaltation: number;
  triplicity: number;
  term: number;
  face: number;
  detriment: number;
  fall: number;
  /** Pure dignity sum (peregrine is not auto-scored). */
  total: number;
  /** True when none of the five dignities is held. */
  peregrine: boolean;
  term_ruler: string;
  face_ruler: string;
}

/**
 * The weighted essential dignities of `planet` at ecliptic longitude `lon`
 * (degrees) in a day or night chart. Only the seven classical planets score.
 *
 * @param planet One of {@link PLANETS}.
 * @param lon Ecliptic longitude in degrees.
 * @param sect `"day"` or `"night"`, selecting the triplicity ruler.
 * @param terms A term table; defaults to the Egyptian bounds.
 * @returns A {@link DignityScore}.
 */
export function dignityScore(planet: string, lon: number, sect: Sect = "day", terms = TERMS_EGYPTIAN): DignityScore {
  const L = mod(lon, 360);
  const sign = Math.floor(L / 30) % 12;
  const deg = L - sign * 30;

  const held: Record<string, number> = {};
  if (DOMICILE[planet]?.includes(sign)) held.rulership = DIGNITY_WEIGHTS.rulership;
  if (EXALTATION[planet] === sign) held.exaltation = DIGNITY_WEIGHTS.exaltation;
  const trip = TRIPLICITY[sign % 4][sect === "day" ? 0 : 1];
  if (planet === trip) held.triplicity = DIGNITY_WEIGHTS.triplicity;
  const tr = termRuler(sign, deg, terms);
  if (planet === tr) held.term = DIGNITY_WEIGHTS.term;
  const fr = faceRuler(L);
  if (planet === fr) held.face = DIGNITY_WEIGHTS.face;
  if (DOMICILE[planet]?.some((d) => (d + 6) % 12 === sign)) held.detriment = DIGNITY_WEIGHTS.detriment;
  if (planet in EXALTATION && (EXALTATION[planet] + 6) % 12 === sign) held.fall = DIGNITY_WEIGHTS.fall;

  const positive = ["rulership", "exaltation", "triplicity", "term", "face"].some((k) => k in held);
  return {
    planet,
    rulership: held.rulership ?? 0,
    exaltation: held.exaltation ?? 0,
    triplicity: held.triplicity ?? 0,
    term: held.term ?? 0,
    face: held.face ?? 0,
    detriment: held.detriment ?? 0,
    fall: held.fall ?? 0,
    total: Object.values(held).reduce((a, b) => a + b, 0),
    peregrine: !positive,
    term_ruler: tr,
    face_ruler: fr,
  };
}

/**
 * The almuten of a degree: the classical planet with the greatest positive
 * essential dignity (rulership + exaltation + triplicity + term + face) at `lon`.
 * Ties broken by the canonical planet order.
 *
 * @returns `{ planet, score }`.
 */
export function almuten(lon: number, sect: Sect = "day", terms = TERMS_EGYPTIAN): { planet: string; score: number } {
  let best: string | null = null;
  let bestScore = -1;
  for (const p of PLANETS) {
    const d = dignityScore(p, lon, sect, terms);
    const score = d.rulership + d.exaltation + d.triplicity + d.term + d.face;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return { planet: best as string, score: bestScore };
}
