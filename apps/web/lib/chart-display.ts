/**
 * Shared chart-display helpers for the playground components (SkyNow, the
 * synastry panel, the bi-wheel). Pure presentation: aspect glyphs and colours,
 * the inter-chart aspect test, the aspectable body order, and pattern labels.
 */
import { ASPECTS, DEFAULT_ORBS, mod } from "caelus";

/** Aspectable planets in a fixed display order (nodes and Lilith excluded). */
export const ASPECTABLE_ORDER = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto", "chiron",
];

/** Unicode glyphs for the five Ptolemaic aspects. */
export const ASPECT_GLYPH: Record<string, string> = {
  conjunction: "☌", sextile: "⚹", square: "□", trine: "△", opposition: "☍",
};

/** Red for hard aspects, green for soft, muted for conjunction. */
export function aspectColor(aspect?: string): string {
  if (aspect === "square" || aspect === "opposition") return "var(--bad)";
  if (aspect === "trine" || aspect === "sextile") return "var(--good)";
  return "var(--text-mute)";
}

/** The single aspect two longitudes form within the engine's default orbs, or null. */
export function crossAspect(lonA: number, lonB: number): { aspect: string; orb: number } | null {
  const sep = Math.abs(mod(lonA - lonB + 180, 360) - 180);
  let best: { aspect: string; orb: number } | null = null;
  for (const [name, angle] of Object.entries(ASPECTS)) {
    const orb = Math.abs(sep - angle);
    if (orb <= (DEFAULT_ORBS[name] ?? 0) && (!best || orb < best.orb)) {
      best = { aspect: name, orb: Math.round(orb * 100) / 100 };
    }
  }
  return best;
}

/** Human labels for the configuration kinds from detectPatterns(). */
export const PATTERN_LABEL: Record<string, string> = {
  grand_cross: "Grand cross", mystic_rectangle: "Mystic rectangle", kite: "Kite",
  t_square: "T-square", grand_trine: "Grand trine", yod: "Yod",
  stellium_sign: "Stellium (sign)", stellium_house: "Stellium (house)",
};
