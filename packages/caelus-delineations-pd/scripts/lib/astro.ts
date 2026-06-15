/**
 * Shared astrological vocabulary for the extractors: the body names and signs
 * as they appear in the texts, mapped to the exact ids/strings the Caelus
 * engine emits (lowercase body ids; title-case signs from `chart.ts` SIGNS).
 */

/** Planet word (as written in the corpus) -> Caelus body id. */
export const PLANET_TO_BODY: Record<string, string> = {
  sun: "sun", moon: "moon", mercury: "mercury", venus: "venus", mars: "mars",
  jupiter: "jupiter", saturn: "saturn", uranus: "uranus", neptune: "neptune",
  pluto: "pluto",
};

export const PLANET_NAMES = Object.keys(PLANET_TO_BODY);

/** Signs in zodiacal order, matching the engine's SIGNS casing. */
export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

/** Lowercased sign -> engine sign string, for normalizing matched text. */
export const SIGN_CANON: Record<string, string> = Object.fromEntries(
  SIGN_NAMES.map((s) => [s.toLowerCase(), s]),
);
