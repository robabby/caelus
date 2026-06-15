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
import { SIGNS, DOMICILE, EXALTATION } from "./chart.js";
import type { Chart, Zodiac } from "./chart.js";
import type { AspectPhase } from "./electional.js";
import { detectPatterns, ChartPattern } from "./patterns.js";
import { chartSignature, ChartSignature } from "./signature.js";
import { TRIPLICITY } from "./dignity-score.js";

const LUMINARIES = new Set(["sun", "moon"]);
const ANGULAR_HOUSES = new Set([1, 4, 7, 10]);
const HARD_ASPECTS = new Set(["conjunction", "square", "opposition"]);

/** The seven classical planets that participate in the dispositor scheme. */
const CLASSICAL = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

/** Traditional domicile ruler of each sign (index 0-11), inverted from
 *  {@link DOMICILE}: the body that rules a body's sign disposits it. */
const SIGN_RULER: string[] = (() => {
  const r: string[] = new Array(12);
  for (const [body, signs] of Object.entries(DOMICILE)) {
    for (const s of signs) r[s] = body;
  }
  return r;
})();

/** Body exalted in each sign (index 0-11), or undefined; inverted from
 *  {@link EXALTATION}. */
const SIGN_EXALT: (string | undefined)[] = (() => {
  const r: (string | undefined)[] = new Array(12);
  for (const [body, sign] of Object.entries(EXALTATION)) r[sign] = body;
  return r;
})();

/** How a reception's dignities rank (stronger = larger), for the salience
 *  scaling and the `by` summary. */
const DIGNITY_RANK: Record<string, number> = { domicile: 3, exaltation: 2, triplicity: 1 };

/** Atom kinds in an {@link InterpretationContext}. */
export type FactKind =
  | "placement" | "aspect" | "pattern" | "signature" | "angle"
  | "dispositor" | "reception";

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

export interface DispositorAtom extends FactAtomBase {
  kind: "dispositor";
  body: string;
  /** The classical ruler of the body's sign (equals `body` when in domicile). */
  dispositor: string;
  /** The body occupies its own domicile -- a chain terminus / final dispositor. */
  final: boolean;
}

export interface ReceptionAtom extends FactAtomBase {
  kind: "reception";
  /** The dignities the reception runs through: a single dignity when both
   *  bodies receive by the same (`"domicile"`, `"exaltation"`, `"triplicity"`),
   *  else a sorted pair for a mixed reception (e.g. `"domicile-exaltation"`). */
  by: string;
}

export type FactAtom =
  | PlacementAtom | AspectAtom | PatternAtom | SignatureAtom | AngleAtom
  | DispositorAtom | ReceptionAtom;

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
  /** Added to a dispositor link (and again when it is a final dispositor). */
  dispositor: number;
  /** Added to a mutual reception. */
  reception: number;
}

export const DEFAULT_SALIENCE: SalienceWeights = {
  base: 1, luminary: 1.5, angular: 1, chartRuler: 1,
  dignity: 0.5, hardAspect: 1, pattern: 4, dispositor: 0.5, reception: 2,
};

export interface ContextOptions {
  /** Salience weights to override (merged over {@link DEFAULT_SALIENCE}). */
  salience?: Partial<SalienceWeights>;
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

  // Aspects: phase and strength come straight from the enriched chart aspect.
  for (const asp of chart.aspects) {
    let salience = w.base + asp.strength;
    if (HARD_ASPECTS.has(asp.aspect)) salience += w.hardAspect;
    if (LUMINARIES.has(asp.a) || LUMINARIES.has(asp.b)) salience += w.luminary;
    const [x, y] = [asp.a, asp.b].sort();
    atoms.push({
      id: `aspect:${x}~${y}:${asp.aspect}`, kind: "aspect", bodies: [asp.a, asp.b],
      salience, a: asp.a, b: asp.b, aspect: asp.aspect, orb: asp.orb,
      phase: asp.phase, strength: asp.strength,
      text: `${title(asp.a)} ${asp.aspect} ${title(asp.b)} `
        + `(${asp.phase}, orb ${Math.abs(asp.orb).toFixed(1)}°)`,
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

  // Dispositors: the classical ruler of each classical planet's sign, plus any
  // mutual receptions (a disposits b and b disposits a) among them.
  const dispositorOf = (body: string): string | null => {
    const p = chart.bodies[body];
    return p ? SIGN_RULER[Math.floor(mod(p.lon, 360) / 30)] : null;
  };
  for (const body of CLASSICAL) {
    if (!chart.bodies[body]) continue;
    const disp = dispositorOf(body)!;
    const final = disp === body;
    let salience = w.base + w.dispositor + (final ? w.dispositor : 0);
    if (LUMINARIES.has(body)) salience += w.luminary;
    atoms.push({
      id: `dispositor:${body}`, kind: "dispositor", bodies: [body], salience,
      body, dispositor: disp, final,
      text: final
        ? `${title(body)} is in its own domicile (final dispositor)`
        : `${title(body)} is disposited by ${title(disp)}`,
    });
  }
  // Reception (mutual): each body holds a dignity in the other's sign. Checked
  // by domicile, exaltation, and the sect's triplicity ruler (sect = day when
  // the Sun is above the horizon, houses 7-12). `by` names the strongest
  // dignity each direction; salience scales with the weaker link.
  const sunHouse = chart.bodies.sun?.house;
  const sect = sunHouse !== undefined && sunHouse >= 7 ? 0 : 1; // 0 day, 1 night
  const signOf = (body: string): number => Math.floor(mod(chart.bodies[body]!.lon, 360) / 30);
  const receives = (a: string, otherSign: number): string[] => {
    const ds: string[] = [];
    if (SIGN_RULER[otherSign] === a) ds.push("domicile");
    if (SIGN_EXALT[otherSign] === a) ds.push("exaltation");
    if (TRIPLICITY[otherSign % 4][sect] === a) ds.push("triplicity");
    return ds;
  };
  const strongest = (ds: string[]): string =>
    ds.reduce((best, d) => (DIGNITY_RANK[d] > DIGNITY_RANK[best] ? d : best), ds[0]);
  for (let i = 0; i < CLASSICAL.length; i++) {
    for (let j = i + 1; j < CLASSICAL.length; j++) {
      const a = CLASSICAL[i]; const b = CLASSICAL[j];
      if (!chart.bodies[a] || !chart.bodies[b]) continue;
      const aRec = receives(a, signOf(b));
      const bRec = receives(b, signOf(a));
      if (!aRec.length || !bRec.length) continue;
      const da = strongest(aRec); const db = strongest(bRec);
      const by = da === db ? da : [da, db].sort().join("-");
      let salience = w.base + w.reception * (Math.min(DIGNITY_RANK[da], DIGNITY_RANK[db]) / 3);
      if (LUMINARIES.has(a) || LUMINARIES.has(b)) salience += w.luminary;
      atoms.push({
        id: `reception:${a}~${b}`, kind: "reception", bodies: [a, b], salience, by,
        text: `Mutual reception: ${title(a)} and ${title(b)} (${by})`,
      });
    }
  }

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
