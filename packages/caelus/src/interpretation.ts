/**
 * astroengine interpretation context -- a chart projected into typed, addressable
 * "fact atoms" for an interpretation layer to consume.
 *
 * Caelus stops at validated geometry; this is the seam where interpretation
 * begins. It does NOT interpret. It normalizes a {@link Chart}'s facts --
 * placements, aspects, classical configurations, the structural signature, the
 * angles -- into a flat list of atoms, each with a stable id, a transparent
 * salience score, and a plain-language rendering. Rule-based and LLM-based
 * interpreters alike build on this substrate: a rule corpus matches atoms by
 * `kind`/`id`, and an LLM reads the `text` and cites the `id`.
 *
 * Salience is explicit and overridable (see {@link SalienceWeights}), never a
 * magic number -- it ranks atoms so a reader can lead with what is prominent
 * (luminaries, angular placements, the chart ruler, tight and hard aspects,
 * whole configurations) without the engine asserting meaning.
 *
 * This is TS-side framework code, not ephemeris: there is no Swiss Ephemeris
 * oracle for "which facts matter," so it is unit-tested for structure rather
 * than pinned by a parity golden.
 */
import { mod } from "./core.js";
import { SIGNS, ASPECTS, DEFAULT_ORBS } from "./chart.js";
import type { Chart, Zodiac } from "./chart.js";
import { aspectPhase, AspectPhase } from "./electional.js";
import { detectPatterns, ChartPattern } from "./patterns.js";
import { chartSignature, ChartSignature } from "./signature.js";

const LUMINARIES = new Set(["sun", "moon"]);
const ANGULAR_HOUSES = new Set([1, 4, 7, 10]);
const HARD_ASPECTS = new Set(["conjunction", "square", "opposition"]);

/** Atom kinds in an {@link InterpretationContext}. */
export type FactKind = "placement" | "aspect" | "pattern" | "signature" | "angle";

interface FactAtomBase {
  /** Stable, content-addressable id, e.g. `"placement:mars"` or
   *  `"aspect:mars~saturn:square"`. Interpretations cite this. */
  id: string;
  kind: FactKind;
  /** Body ids this atom concerns (empty for body-less signature facets). */
  bodies: string[];
  /** Transparent salience (higher = more prominent); see {@link SalienceWeights}. */
  salience: number;
  /** Plain-language statement of the fact -- no interpretation. */
  text: string;
}

export interface PlacementAtom extends FactAtomBase {
  kind: "placement";
  body: string;
  sign: string;
  signDeg: number;
  house: number;
  retrograde: boolean;
  dignities: string[];
}

export interface AspectAtom extends FactAtomBase {
  kind: "aspect";
  a: string;
  b: string;
  aspect: string;
  /** Orb from exact, degrees. */
  orb: number;
  /** Applying, separating, or exact -- from the two bodies' speeds. */
  phase: AspectPhase;
  /** Closeness in `[0, 1]`: `1` exact, `0` at the orb limit. */
  strength: number;
}

export interface PatternAtom extends FactAtomBase {
  kind: "pattern";
  /** Configuration kind, e.g. `"t_square"`, `"grand_trine"`. */
  pattern: string;
  /** Focal body for a T-square or yod. */
  apex?: string;
}

export interface SignatureAtom extends FactAtomBase {
  kind: "signature";
  /** Which facet of the structural signature this states. */
  facet: "element" | "modality" | "sign" | "ruler";
  value: string;
}

export interface AngleAtom extends FactAtomBase {
  kind: "angle";
  angle: "asc" | "mc" | "vertex" | "eastPoint";
  sign: string;
  signDeg: number;
}

export type FactAtom =
  | PlacementAtom | AspectAtom | PatternAtom | SignatureAtom | AngleAtom;

/** A chart as a flat, ranked list of {@link FactAtom}s. */
export interface InterpretationContext {
  jdUt: number;
  zodiac: Zodiac;
  /** Atoms sorted by descending {@link FactAtomBase.salience}, then `id`. */
  atoms: FactAtom[];
}

/** Additive salience weights. Each contribution is documented at its use site;
 *  override any subset through {@link ContextOptions.salience}. */
export interface SalienceWeights {
  /** Every atom starts here. */
  base: number;
  /** Added when the Sun or Moon is involved. */
  luminary: number;
  /** Added for an angular house (1/4/7/10) or an angle atom. */
  angular: number;
  /** Added to the placement of the Ascendant ruler. */
  chartRuler: number;
  /** Added per essential dignity a body holds. */
  dignity: number;
  /** Added to a hard aspect (conjunction/square/opposition). */
  hardAspect: number;
  /** Base salience of a whole configuration (T-square, grand trine, ...). */
  pattern: number;
}

export const DEFAULT_SALIENCE: SalienceWeights = {
  base: 1, luminary: 1.5, angular: 1, chartRuler: 1,
  dignity: 0.5, hardAspect: 1, pattern: 4,
};

export interface ContextOptions {
  /** Salience weights to override (merged over {@link DEFAULT_SALIENCE}). */
  salience?: Partial<SalienceWeights>;
  /** Per-aspect orb limits used to normalize aspect strength; defaults to
   *  {@link DEFAULT_ORBS}. */
  orbs?: Record<string, number>;
  /** Precomputed patterns/signature, to avoid recomputing them. */
  patterns?: ChartPattern[];
  signature?: ChartSignature;
}

function title(body: string): string {
  return body.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function humanizePattern(kind: string): string {
  const special: Record<string, string> = {
    t_square: "T-square", grand_trine: "Grand trine", grand_cross: "Grand cross",
    mystic_rectangle: "Mystic rectangle", stellium_sign: "Stellium",
    stellium_house: "Stellium",
  };
  return special[kind] ?? title(kind);
}

/**
 * Project a {@link Chart} into a ranked list of {@link FactAtom}s -- the
 * substrate an interpretation layer consumes. Pure and deterministic; computes
 * applying/separating and a normalized strength for each aspect that the bare
 * {@link Chart.aspects} list omits.
 *
 * @param chart A chart from {@link Engine.chart} / {@link Engine.chartAt}.
 * @param opts Salience overrides, orb policy, and precomputed reductions.
 * @returns The {@link InterpretationContext}; `atoms` are sorted by salience.
 */
export function interpretationContext(
  chart: Chart, opts: ContextOptions = {},
): InterpretationContext {
  const w = { ...DEFAULT_SALIENCE, ...opts.salience };
  const orbs = opts.orbs ?? DEFAULT_ORBS;
  const sig = opts.signature ?? chartSignature(chart);
  const patterns = opts.patterns ?? detectPatterns(chart);
  const atoms: FactAtom[] = [];

  // Placements: one atom per present body.
  for (const [body, p] of Object.entries(chart.bodies)) {
    if (!p) continue;
    let salience = w.base;
    if (LUMINARIES.has(body)) salience += w.luminary;
    if (ANGULAR_HOUSES.has(p.house)) salience += w.angular;
    if (sig.ruler === body) salience += w.chartRuler;
    salience += w.dignity * p.dignities.length;
    const extra = [
      p.retrograde ? "retrograde" : null,
      ...p.dignities,
    ].filter(Boolean);
    atoms.push({
      id: `placement:${body}`, kind: "placement", bodies: [body], salience,
      body, sign: p.sign, signDeg: p.signDeg, house: p.house,
      retrograde: p.retrograde, dignities: p.dignities,
      text: `${title(body)} in ${p.sign}, house ${p.house}`
        + (extra.length ? ` (${extra.join(", ")})` : ""),
    });
  }

  // Aspects: enriched with phase and strength.
  for (const asp of chart.aspects) {
    const pa = chart.bodies[asp.a]; const pb = chart.bodies[asp.b];
    if (!pa || !pb) continue;
    const phase = aspectPhase(pa.lon, pa.speed, pb.lon, pb.speed, ASPECTS[asp.aspect] ?? 0);
    const limit = orbs[asp.aspect] ?? 8;
    const strength = Math.max(0, 1 - Math.abs(asp.orb) / limit);
    let salience = w.base + strength;
    if (HARD_ASPECTS.has(asp.aspect)) salience += w.hardAspect;
    if (LUMINARIES.has(asp.a) || LUMINARIES.has(asp.b)) salience += w.luminary;
    const [x, y] = [asp.a, asp.b].sort();
    atoms.push({
      id: `aspect:${x}~${y}:${asp.aspect}`, kind: "aspect", bodies: [asp.a, asp.b],
      salience, a: asp.a, b: asp.b, aspect: asp.aspect, orb: asp.orb, phase, strength,
      text: `${title(asp.a)} ${asp.aspect} ${title(asp.b)} `
        + `(${phase}, orb ${Math.abs(asp.orb).toFixed(1)}°)`,
    });
  }

  // Configurations.
  for (const pat of patterns) {
    let salience = w.pattern;
    if (pat.bodies.some((b) => LUMINARIES.has(b))) salience += w.luminary;
    const names = pat.bodies.map(title).join(", ");
    atoms.push({
      id: `pattern:${pat.kind}:${pat.bodies.join("-")}`, kind: "pattern",
      bodies: pat.bodies, salience, pattern: pat.kind, apex: pat.apex,
      text: `${humanizePattern(pat.kind)}: ${names}`
        + (pat.apex ? ` (apex ${title(pat.apex)})` : "")
        + (pat.sign ? ` in ${pat.sign}` : ""),
    });
  }

  // Structural signature: the dominant facets and the chart ruler.
  const sigAtom = (
    facet: SignatureAtom["facet"], value: string | null, text: string,
  ): void => {
    if (value === null) return;
    atoms.push({
      id: `signature:${facet}:${value}`, kind: "signature",
      bodies: facet === "ruler" ? [value] : [], salience: w.base + 1,
      facet, value, text,
    });
  };
  sigAtom("element", sig.dominant.element, `${title(sig.dominant.element)} is the dominant element`);
  sigAtom("modality", sig.dominant.modality, `${title(sig.dominant.modality)} is the dominant modality`);
  sigAtom("sign", sig.dominant.sign, `${sig.dominant.sign} is the most-occupied sign`);
  sigAtom("ruler", sig.ruler, `${title(sig.ruler ?? "")} is the chart ruler`);

  // Angles.
  const angleAtom = (angle: AngleAtom["angle"], lon: number): void => {
    const sign = SIGNS[Math.floor(mod(lon, 360) / 30)];
    const label = { asc: "Ascendant", mc: "Midheaven", vertex: "Vertex", eastPoint: "East Point" }[angle];
    atoms.push({
      id: `angle:${angle}`, kind: "angle", bodies: [], salience: w.base + w.angular,
      angle, sign, signDeg: mod(lon, 30),
      text: `${label} in ${sign}`,
    });
  };
  angleAtom("asc", chart.angles.asc);
  angleAtom("mc", chart.angles.mc);
  angleAtom("vertex", chart.angles.vertex);
  angleAtom("eastPoint", chart.angles.eastPoint);

  atoms.sort((m, n) => n.salience - m.salience || (m.id < n.id ? -1 : 1));
  return { jdUt: chart.jdUt, zodiac: chart.zodiac, atoms };
}
