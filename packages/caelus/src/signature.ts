/**
 * A chart's structural signature, as plain counts.
 *
 * Element / modality distributions (from each body's sign), angularity /
 * quadrant / hemisphere distributions (from its house), the dominant element,
 * modality, and most-occupied sign (argmax of the counts), and the classical
 * chart ruler (the domicile ruler of the Ascendant's sign). No interpretation,
 * no "flavour" labels.
 *
 * The only convention is which bodies are counted and that each counts once: the
 * default is the aspectable bodies (planets and Chiron; nodes and Lilith
 * excluded), each weight 1. Weighted "dominance" schemes are deliberately not the
 * default. Port of the Python reference `astroengine.signature`, pinned by
 * `signature-golden`.
 */
import { mod } from "./core.js";
import { SIGNS, NOT_ASPECTABLE } from "./chart.js";
import type { Chart } from "./chart.js";

export const ELEMENTS = ["fire", "earth", "air", "water"] as const;
export const MODALITIES = ["cardinal", "fixed", "mutable"] as const;
const ANGULARITY = ["angular", "succedent", "cadent"] as const;
/** Classical (domicile) ruler by sign index 0-11, matching the engine's dignities. */
const RULERS = ["mars", "venus", "mercury", "moon", "sun", "mercury",
  "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"];

export interface ChartSignature {
  /** Bodies per element (fire/earth/air/water). */
  elements: Record<string, number>;
  /** Bodies per modality (cardinal/fixed/mutable). */
  modalities: Record<string, number>;
  /** Bodies per angularity (angular/succedent/cadent), house-based. */
  angularity: Record<string, number>;
  /** Bodies per quadrant ("1"-"4"), house-based. */
  quadrants: Record<string, number>;
  /** Bodies above/below the horizon and east/west, house-based. */
  hemispheres: Record<string, number>;
  /** Argmax of the distributions; `sign` is the most-occupied sign (>=2) or null. */
  dominant: { element: string; modality: string; sign: string | null };
  /** Classical ruler of the Ascendant's sign, or null when no Ascendant given. */
  ruler: string | null;
  /** The bodies counted, sorted. */
  bodies: string[];
}

/** A body's longitude (and house) for {@link chartSignatureOf}. */
export interface SignatureBody {
  lon: number;
  house?: number | null;
}

export interface SignatureOptions {
  /** Ascendant sign index 0-11; yields the classical chart ruler. */
  ascSign?: number | null;
  /** Body ids to count; defaults to the aspectable bodies present. */
  bodies?: string[];
}

function argmax(counts: Record<string, number>, order: readonly string[]): string {
  let best = order[0];
  let bestV = -1;
  for (const k of order) if (counts[k] > bestV) { bestV = counts[k]; best = k; }
  return best;
}

/**
 * Structural counts for a body map. Lower-level form of {@link chartSignature}:
 * `bodies` maps a body id to `{ lon, house? }`.
 */
export function chartSignatureOf(
  bodies: Record<string, SignatureBody>, opts: SignatureOptions = {},
): ChartSignature {
  const names = (opts.bodies ?? Object.keys(bodies).filter((b) => !NOT_ASPECTABLE.has(b)))
    .filter((b) => b in bodies);

  const elements: Record<string, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: Record<string, number> = { cardinal: 0, fixed: 0, mutable: 0 };
  const angularity: Record<string, number> = { angular: 0, succedent: 0, cadent: 0 };
  const quadrants: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const hemispheres: Record<string, number> = { above: 0, below: 0, eastern: 0, western: 0 };
  const signCounts: Record<number, number> = {};

  for (const b of names) {
    const sign = Math.floor(mod(bodies[b].lon, 360) / 30) % 12;
    elements[ELEMENTS[sign % 4]]++;
    modalities[MODALITIES[sign % 3]]++;
    signCounts[sign] = (signCounts[sign] ?? 0) + 1;
    const h = bodies[b].house;
    if (h != null) {
      angularity[ANGULARITY[(h - 1) % 3]]++;
      quadrants[String(Math.floor((h - 1) / 3) + 1)]++;
      hemispheres[h >= 7 ? "above" : "below"]++;
      hemispheres[[10, 11, 12, 1, 2, 3].includes(h) ? "eastern" : "western"]++;
    }
  }

  let domSign: number | null = null;
  let best = 1;
  for (const s of Object.keys(signCounts).map(Number).sort((a, b) => a - b)) {
    if (signCounts[s] > best) { best = signCounts[s]; domSign = s; }
  }

  return {
    elements,
    modalities,
    angularity,
    quadrants,
    hemispheres,
    dominant: {
      element: argmax(elements, ELEMENTS),
      modality: argmax(modalities, MODALITIES),
      sign: domSign !== null ? SIGNS[domSign] : null,
    },
    ruler: opts.ascSign != null ? RULERS[opts.ascSign] : null,
    bodies: [...names].sort(),
  };
}

/**
 * The structural signature of a {@link Chart}: element / modality / angularity /
 * quadrant / hemisphere distributions over its bodies, the dominant element,
 * modality, and most-occupied sign, and the classical chart ruler. Counts only,
 * no interpretation. Bodies absent from the chart (outside their fitted range)
 * are skipped.
 *
 * @param chart A {@link Chart} from {@link Engine.chart} / {@link Engine.chartAt}.
 * @param opts An explicit body set, or an Ascendant-sign override.
 * @returns A {@link ChartSignature}.
 * @example
 * ```ts
 * const chart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
 * chartSignature(chart).dominant; // { element: "earth", modality: "cardinal", sign: "Capricorn" }
 * ```
 */
export function chartSignature(chart: Chart, opts: SignatureOptions = {}): ChartSignature {
  const bodies: Record<string, SignatureBody> = {};
  for (const [name, p] of Object.entries(chart.bodies)) if (p) bodies[name] = { lon: p.lon, house: p.house };
  const ascSign = opts.ascSign ?? Math.floor(mod(chart.angles.asc, 360) / 30) % 12;
  return chartSignatureOf(bodies, { ...opts, ascSign });
}
