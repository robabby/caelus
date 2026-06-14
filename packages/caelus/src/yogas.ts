/**
 * astroengine yogas -- classical Vedic yogas (planetary combinations) judged on
 * the sidereal rasi (D1) chart.
 *
 * Covers the well-defined, placement-based yogas with no textual variation: the
 * five Pancha Mahapurusha yogas (a non-luminary in its own sign or exaltation
 * AND in a kendra from the Ascendant -- Ruchaka/Mars, Bhadra/Mercury,
 * Hamsa/Jupiter, Malavya/Venus, Shasha/Saturn); Gajakesari (Jupiter in a kendra
 * from the Moon); Budha-Aditya (Sun and Mercury in one sign); and
 * Chandra-Mangala (Moon and Mars in one sign). Own-sign/exaltation use the
 * engine's `dignities`; houses are whole-sign from the Ascendant. The
 * variant-laden yogas (Kemadruma, lordship-based raja/dhana) are left to a later
 * step. Mirrors the Python reference (astroengine/yogas.py).
 */
import { Engine, Zodiac, AlwaysBody, dignities } from "./chart.js";

/** Pancha Mahapurusha: [yoga name, planet]. */
const MAHAPURUSHA: Array<[string, string]> = [
  ["Ruchaka", "mars"], ["Bhadra", "mercury"], ["Hamsa", "jupiter"],
  ["Malavya", "venus"], ["Shasha", "saturn"],
];
const KENDRA = new Set([1, 4, 7, 10]);
// The seven classical grahas: all analytic, so always present in a chart.
export const YOGA_PLANETS: readonly AlwaysBody[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

export interface Yoga { yoga: string; planets: string[]; }

/** The placement yogas present in a chart. `signs` maps each of the seven
 *  classical planets to its 0-based sign index; `ascSign` is the Ascendant's
 *  sign index. */
export function detectYogas(signs: Record<string, number>, ascSign: number): Yoga[] {
  const house = (sign: number) => ((sign - ascSign) % 12 + 12) % 12 + 1;
  const out: Yoga[] = [];
  for (const [name, p] of MAHAPURUSHA) {
    const dig = dignities(p, signs[p]);
    if ((dig.includes("domicile") || dig.includes("exaltation")) && KENDRA.has(house(signs[p]))) {
      out.push({ yoga: name, planets: [p] });
    }
  }
  const jkFromMoon = ((signs.jupiter - signs.moon) % 12 + 12) % 12;
  if (jkFromMoon === 0 || jkFromMoon === 3 || jkFromMoon === 6 || jkFromMoon === 9) {
    out.push({ yoga: "Gajakesari", planets: ["jupiter", "moon"] });
  }
  if (signs.sun === signs.mercury) out.push({ yoga: "Budha-Aditya", planets: ["sun", "mercury"] });
  if (signs.moon === signs.mars) out.push({ yoga: "Chandra-Mangala", planets: ["moon", "mars"] });
  return out;
}

export interface Kemadruma { present: boolean; planets_checked: string[]; }

/** Kemadruma yoga: the Moon is isolated -- no planet in the 2nd or 12th sign
 *  from it, nor conjunct it. The planet set is parameterized (texts vary): the
 *  default is the five tara grahas, `includeSun` adds the Sun, `includeNodes`
 *  adds Rahu/Ketu when present in `signs`. */
export function kemadruma(
  signs: Record<string, number>, includeSun = false, includeNodes = false,
): Kemadruma {
  let planets = ["mars", "mercury", "jupiter", "venus", "saturn"];
  if (includeSun) planets = ["sun", ...planets];
  if (includeNodes) planets = [...planets, "rahu", "ketu"];
  planets = planets.filter((p) => p in signs);
  const moon = signs.moon;
  const occupied = new Set([((moon - 1) % 12 + 12) % 12, moon, (moon + 1) % 12]);
  const present = !planets.some((p) => occupied.has(signs[p]));
  return { present, planets_checked: planets };
}

/** Kemadruma yoga of a natal chart, from the sidereal rasi positions. */
export function kemadrumaAt(
  engine: Engine, natalJd: number, lat: number, lonEast: number,
  includeSun = false, includeNodes = false, zodiac: Zodiac = "sidereal:lahiri",
): Kemadruma {
  const chart = engine.chartAt(natalJd, lat, lonEast, { zodiac });
  const bodies: readonly AlwaysBody[] = includeNodes ? [...YOGA_PLANETS, "mean_node"] : YOGA_PLANETS;
  const signs: Record<string, number> = {};
  for (const b of bodies) signs[b] = Math.floor(chart.bodies[b].lon / 30) % 12;
  if (includeNodes) { signs.rahu = signs.mean_node; signs.ketu = (signs.mean_node + 6) % 12; }
  return kemadruma(signs, includeSun, includeNodes);
}

/** The placement yogas of a natal chart, from the sidereal rasi positions. */
export function yogasAt(
  engine: Engine, natalJd: number, lat: number, lonEast: number,
  zodiac: Zodiac = "sidereal:lahiri",
): Yoga[] {
  const chart = engine.chartAt(natalJd, lat, lonEast, { zodiac });
  const ascSign = Math.floor(chart.angles.asc / 30) % 12;
  const signs: Record<string, number> = {};
  for (const b of YOGA_PLANETS) signs[b] = Math.floor(chart.bodies[b].lon / 30) % 12;
  return detectYogas(signs, ascSign);
}
