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
import { TRIPLICITY, dignityScore, almuten, type Sect } from "./dignity-score.js";
import type { Realm, Certainty } from "./provenance.js";
import type { Profection } from "./profections.js";
import type {
  CompositePlacement, SynastryAspectHit, SynastryOverlays, TransitHit,
} from "./relational.js";
import { nakshatra } from "./vedic.js";
import { varga } from "./vargas.js";

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
  | "dispositor" | "reception" | "star" | "lot"
  | "transit" | "synastry" | "composite" | "timelord" | "dignity"
  | "nakshatra" | "varga" | "yoga";

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

export interface StarAtom extends FactAtomBase {
  kind: "star";
  /** The body conjunct the fixed star. */
  body: string;
  /** Catalog star name (see {@link Engine.starNames}). */
  star: string;
  /** Orb from exact conjunction, degrees. */
  orb: number;
}

export interface LotAtom extends FactAtomBase {
  kind: "lot";
  /** Hermetic lot name, e.g. `"fortune"` (see {@link HERMETIC_LOTS}). */
  lot: string;
  sign: string;
  signDeg: number;
  house: number;
}

export interface TransitAtom extends FactAtomBase {
  kind: "transit";
  transit: string;
  natal: string;
  aspect: string;
  orb: number;
  phase: AspectPhase;
  strength: number;
  natalHouse: number;
}

export interface SynastryAtom extends FactAtomBase {
  kind: "synastry";
  mode: "aspect" | "overlay";
  a?: string;
  b?: string;
  aspect?: string;
  orb?: number;
  strength?: number;
  body?: string;
  partner?: "a" | "b";
  house?: number;
}

export interface CompositeAtom extends FactAtomBase {
  kind: "composite";
  body: string;
  sign: string;
  signDeg: number;
}

export interface TimelordAtom extends FactAtomBase {
  kind: "timelord";
  system: "profection" | "zr" | "firdaria" | "dasha";
  level: string;
  lord: string;
  sign?: string;
}

export interface DignityAtom extends FactAtomBase {
  kind: "dignity";
  facet: "term" | "face" | "triplicity" | "almuten";
  body: string;
  ruler?: string;
}

export interface NakshatraAtom extends FactAtomBase {
  kind: "nakshatra";
  body: string;
  name: string;
  pada: number;
  lord: string;
}

export interface VargaAtom extends FactAtomBase {
  kind: "varga";
  division: number;
  body: string;
  sign: string;
}

export interface YogaAtom extends FactAtomBase {
  kind: "yoga";
  yoga: string;
  planets: string[];
}

export type FactAtom =
  | PlacementAtom | AspectAtom | PatternAtom | SignatureAtom | AngleAtom
  | DispositorAtom | ReceptionAtom | StarAtom | LotAtom
  | TransitAtom | SynastryAtom | CompositeAtom | TimelordAtom | DignityAtom
  | NakshatraAtom | VargaAtom | YogaAtom;

/** A chart as a flat, ranked list of {@link FactAtom}s. */
export interface InterpretationContext {
  jdUt: number;
  zodiac: Zodiac;
  /** Atoms sorted by descending {@link FactAtomBase.salience}, then `id`. */
  atoms: FactAtom[];
  /** What the chart is, when supplied via {@link ContextOptions.provenance} --
   *  framing for an interpreter (a forecast is provisional, a mythic chart is a
   *  symbol, not a biography). */
  realm?: Realm;
  /** How firmly the instant is known. When not `"exact"`, time-sensitive atoms
   *  (the Moon, the angles) are damped, since their positions are less certain. */
  certainty?: Certainty;
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
  /** Added to a body's conjunction with a fixed star. */
  star: number;
  /** Added to a Hermetic lot (the Part of Fortune and its companions). */
  lot: number;
  /** Added to a transit-to-natal aspect. */
  transit: number;
  /** Added to a synastry aspect or house overlay. */
  synastry: number;
  /** Added to a composite midpoint placement. */
  composite: number;
  /** Added to an active time-lord period. */
  timelord: number;
  /** Added to a finer essential-dignity fact. */
  dignityFine: number;
  /** Added to a nakshatra / varga / yoga fact. */
  vedic: number;
}

export const DEFAULT_SALIENCE: SalienceWeights = {
  base: 1, luminary: 1.5, angular: 1, chartRuler: 1,
  dignity: 0.5, hardAspect: 1, pattern: 4, dispositor: 0.5, reception: 2,
  star: 2, lot: 2, transit: 1.5, synastry: 1, composite: 0.8, timelord: 2,
  dignityFine: 0.4, vedic: 1,
};

export interface ContextOptions {
  /** Salience weights to override (merged over {@link DEFAULT_SALIENCE}). */
  salience?: Partial<SalienceWeights>;
  /** Precomputed patterns/signature, to avoid recomputing them. */
  patterns?: ChartPattern[];
  signature?: ChartSignature;
  /** The chart's grounding. Carried onto the context; an inexact `certainty`
   *  damps time-sensitive atoms. Wire from {@link realize}'s result. */
  provenance?: { realm?: Realm; certainty?: Certainty };
  /** Fixed-star conjunctions to project as `star` atoms. The engine does not
   *  compute these from a bare {@link Chart} (the star catalog lives in the
   *  data pack), so a caller supplies them, e.g. from
   *  {@link Engine.starConjunctions}. */
  stars?: { body: string; star: string; orb: number }[];
  /** Hermetic lots to project as `lot` atoms, e.g. from {@link Engine.lots}. */
  lots?: { lot: string; sign: string; signDeg: number; house: number }[];
  /** Transit-to-natal hits, e.g. from {@link transitAspects}. */
  transits?: TransitHit[];
  /** Synastry aspects and/or house overlays between two charts. */
  synastry?: { aspects?: SynastryAspectHit[]; overlays?: SynastryOverlays };
  /** Composite midpoint placements, e.g. from {@link compositePlacements}. */
  composite?: CompositePlacement[];
  /** Active time-lord periods at a target instant (caller-supplied). */
  timelords?: {
    profection?: Profection;
    zr?: { l1: string; l2: string; l3: string; l4: string; lot?: string };
    firdaria?: { major: string | null; sub: string | null; day?: boolean };
    dasha?: { maha: string; antar?: string | null; pratyantar?: string | null; moon_nakshatra?: string };
  };
  /** Vedic structure facts (caller-supplied or auto from sidereal chart). */
  vedic?: {
    /** Project nakshatras for these bodies from the chart longitudes. */
    nakshatraBodies?: string[];
    /** Project varga D-n for these bodies (default `[9]` when set true). */
    vargas?: number[] | true;
    yogas?: { yoga: string; planets: string[] }[];
  };
}

/** How much to keep of a time-sensitive atom's salience at each certainty -- the
 *  Moon and the angles move fastest, so an uncertain instant trusts them least. */
const TIME_SENSITIVE_KEEP: Record<Certainty, number> = {
  exact: 1, approximate: 0.7, representative: 0.6, none: 0.5,
};

/** Time-sensitive atoms: the angles (rotate ~15°/h) and anything about the Moon
 *  (~13°/day), the fastest-shifting facts under a time error. */
function timeSensitive(atom: FactAtom): boolean {
  return atom.kind === "angle" || atom.kind === "lot" || atom.bodies.includes("moon");
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

  // Fixed-star conjunctions (caller-supplied; the catalog is not on the Chart).
  for (const sc of opts.stars ?? []) {
    let salience = w.base + w.star;
    if (LUMINARIES.has(sc.body)) salience += w.luminary;
    atoms.push({
      id: `star:${sc.body}:${sc.star}`, kind: "star", bodies: [sc.body], salience,
      body: sc.body, star: sc.star, orb: sc.orb,
      text: `${title(sc.body)} conjunct ${sc.star} (orb ${sc.orb.toFixed(1)}°)`,
    });
  }

  // Hermetic lots (caller-supplied; computed from the chart's points + sect).
  for (const l of opts.lots ?? []) {
    atoms.push({
      id: `lot:${l.lot}`, kind: "lot", bodies: [], salience: w.base + w.lot,
      lot: l.lot, sign: l.sign, signDeg: l.signDeg, house: l.house,
      text: `Lot of ${title(l.lot)} in ${l.sign}, house ${l.house}`,
    });
  }

  // Finer essential dignities: term, face, triplicity held, almuten of each degree.
  const chartSect: Sect = sunHouse !== undefined && sunHouse >= 7 ? "day" : "night";
  for (const body of CLASSICAL) {
    const p = chart.bodies[body];
    if (!p) continue;
    const ds = dignityScore(body, p.lon, chartSect);
    const alm = almuten(p.lon, chartSect);
    let sal = w.base + w.dignityFine;
    if (LUMINARIES.has(body)) sal += w.luminary;
    atoms.push({
      id: `term:${body}:${ds.term_ruler}`, kind: "dignity", bodies: [body], salience: sal,
      facet: "term", body, ruler: ds.term_ruler,
      text: `${title(body)} in the term of ${title(ds.term_ruler)}`
        + (ds.term > 0 ? " (holds term dignity)" : ""),
    });
    atoms.push({
      id: `face:${body}:${ds.face_ruler}`, kind: "dignity", bodies: [body], salience: sal,
      facet: "face", body, ruler: ds.face_ruler,
      text: `${title(body)} in the face of ${title(ds.face_ruler)}`
        + (ds.face > 0 ? " (holds face dignity)" : ""),
    });
    if (ds.triplicity > 0) {
      atoms.push({
        id: `triplicity:${body}`, kind: "dignity", bodies: [body],
        salience: sal + w.dignity, facet: "triplicity", body,
        text: `${title(body)} holds ${chartSect} triplicity`,
      });
    }
    atoms.push({
      id: `almuten:${body}:${alm.planet}`, kind: "dignity", bodies: [body],
      salience: sal + (alm.planet === body ? w.dignity : 0),
      facet: "almuten", body, ruler: alm.planet,
      text: `${title(alm.planet)} is almuten of ${title(body)}'s degree`,
    });
  }

  // Transit-to-natal aspects (caller-supplied).
  for (const t of opts.transits ?? []) {
    let salience = w.base + w.transit + t.strength;
    if (HARD_ASPECTS.has(t.aspect)) salience += w.hardAspect;
    if (LUMINARIES.has(t.transit) || LUMINARIES.has(t.natal)) salience += w.luminary;
    atoms.push({
      id: `transit:${t.transit}~natal_${t.natal}:${t.aspect}`, kind: "transit",
      bodies: [t.transit, t.natal], salience,
      transit: t.transit, natal: t.natal, aspect: t.aspect, orb: t.orb,
      phase: t.phase, strength: t.strength, natalHouse: t.natalHouse,
      text: `Transiting ${title(t.transit)} ${t.aspect} natal ${title(t.natal)} `
        + `(${t.phase}, orb ${t.orb.toFixed(1)}°, natal house ${t.natalHouse})`,
    });
  }

  // Synastry: inter-chart aspects and house overlays.
  for (const s of opts.synastry?.aspects ?? []) {
    let salience = w.base + w.synastry + s.strength;
    if (HARD_ASPECTS.has(s.aspect)) salience += w.hardAspect;
    if (LUMINARIES.has(s.a) || LUMINARIES.has(s.b)) salience += w.luminary;
    atoms.push({
      id: `synastry:${s.a}~b_${s.b}:${s.aspect}`, kind: "synastry",
      bodies: [s.a, s.b], salience, mode: "aspect",
      a: s.a, b: s.b, aspect: s.aspect, orb: s.orb, strength: s.strength,
      text: `${title(s.a)} ${s.aspect} partner's ${title(s.b)} (orb ${s.orb.toFixed(1)}°)`,
    });
  }
  const overlays = opts.synastry?.overlays;
  if (overlays) {
    for (const [body, house] of Object.entries(overlays.aInB)) {
      atoms.push({
        id: `synastry:overlay:a:${body}:house:${house}`, kind: "synastry",
        bodies: [body], salience: w.base + w.synastry, mode: "overlay",
        body, partner: "a", house,
        text: `${title(body)} falls in partner's house ${house}`,
      });
    }
    for (const [body, house] of Object.entries(overlays.bInA)) {
      atoms.push({
        id: `synastry:overlay:b:${body}:house:${house}`, kind: "synastry",
        bodies: [body], salience: w.base + w.synastry, mode: "overlay",
        body, partner: "b", house,
        text: `Partner's ${title(body)} falls in house ${house}`,
      });
    }
  }

  // Composite midpoint placements.
  for (const c of opts.composite ?? []) {
    atoms.push({
      id: `composite:${c.body}`, kind: "composite", bodies: [c.body],
      salience: w.base + w.composite + (LUMINARIES.has(c.body) ? w.luminary : 0),
      body: c.body, sign: c.sign, signDeg: c.signDeg,
      text: `Composite ${title(c.body)} in ${c.sign}`,
    });
  }

  // Time-lords: profection, zodiacal releasing, firdaria, dasha.
  const tl = opts.timelords;
  if (tl?.profection) {
    const pf = tl.profection;
    atoms.push({
      id: `profection:year:${pf.annual.sign.toLowerCase()}:${pf.annual.lord}`, kind: "timelord",
      bodies: [pf.annual.lord], salience: w.base + w.timelord, system: "profection",
      level: "year", lord: pf.annual.lord, sign: pf.annual.sign,
      text: `Annual profection: ${pf.annual.sign} (house ${pf.annual.house}), lord ${title(pf.annual.lord)}`,
    });
    atoms.push({
      id: `profection:month:${pf.monthly.sign.toLowerCase()}:${pf.monthly.lord}`, kind: "timelord",
      bodies: [pf.monthly.lord], salience: w.base + w.timelord * 0.7, system: "profection",
      level: "month", lord: pf.monthly.lord, sign: pf.monthly.sign,
      text: `Monthly profection: ${pf.monthly.sign} (house ${pf.monthly.house}), lord ${title(pf.monthly.lord)}`,
    });
  }
  if (tl?.zr) {
    const zrWeight: Record<string, number> = { l1: 1, l2: 0.75, l3: 0.5, l4: 0.35 };
    const zrLevels: Array<[string, string]> = [
      ["l1", tl.zr.l1], ["l2", tl.zr.l2], ["l3", tl.zr.l3], ["l4", tl.zr.l4],
    ];
    for (const [level, sign] of zrLevels) {
      if (!sign) continue; // deeper levels (l3/l4) can be absent when the period does not subdivide
      const signIdx = SIGNS.indexOf(sign);
      const lord = signIdx >= 0 ? SIGN_RULER[signIdx] : "";
      atoms.push({
        id: `zr:${level}:${sign.toLowerCase()}:${lord}`, kind: "timelord",
        bodies: lord ? [lord] : [], salience: w.base + w.timelord * (zrWeight[level] ?? 0.5),
        system: "zr", level, lord, sign,
        text: `Zodiacal releasing ${level.toUpperCase()}: ${sign}`
          + (lord ? `, lord ${title(lord)}` : "")
          + (tl.zr.lot ? ` (from Lot of ${title(tl.zr.lot)})` : ""),
      });
    }
  }
  if (tl?.firdaria?.major) {
    atoms.push({
      id: `firdaria:major:${tl.firdaria.major}`, kind: "timelord",
      bodies: [tl.firdaria.major], salience: w.base + w.timelord, system: "firdaria",
      level: "major", lord: tl.firdaria.major,
      text: `Firdaria major period: ${title(tl.firdaria.major)}`
        + (tl.firdaria.day !== undefined ? ` (${tl.firdaria.day ? "day" : "night"} chart)` : ""),
    });
    if (tl.firdaria.sub) {
      atoms.push({
        id: `firdaria:sub:${tl.firdaria.sub}`, kind: "timelord",
        bodies: [tl.firdaria.sub], salience: w.base + w.timelord * 0.7, system: "firdaria",
        level: "sub", lord: tl.firdaria.sub,
        text: `Firdaria sub-period: ${title(tl.firdaria.sub)}`,
      });
    }
  }
  if (tl?.dasha?.maha) {
    const d = tl.dasha;
    atoms.push({
      id: `dasha:maha:${d.maha}`, kind: "timelord", bodies: [d.maha],
      salience: w.base + w.timelord, system: "dasha", level: "maha", lord: d.maha,
      text: `Vimshottari mahadasha: ${title(d.maha)}`
        + (d.moon_nakshatra ? ` (Moon in ${d.moon_nakshatra})` : ""),
    });
    if (d.antar) {
      atoms.push({
        id: `dasha:antar:${d.antar}`, kind: "timelord", bodies: [d.antar],
        salience: w.base + w.timelord * 0.8, system: "dasha", level: "antar", lord: d.antar,
        text: `Vimshottari antardasha: ${title(d.antar)}`,
      });
    }
    if (d.pratyantar) {
      atoms.push({
        id: `dasha:pratyantar:${d.pratyantar}`, kind: "timelord", bodies: [d.pratyantar],
        salience: w.base + w.timelord * 0.6, system: "dasha", level: "pratyantar", lord: d.pratyantar,
        text: `Vimshottari pratyantardasha: ${title(d.pratyantar)}`,
      });
    }
  }

  // Vedic: nakshatras, vargas, yogas.
  const vedic = opts.vedic;
  if (vedic) {
    const nakBodies = vedic.nakshatraBodies
      ?? ["moon", "sun", "mars", "mercury", "jupiter", "venus", "saturn"];
    for (const body of nakBodies) {
      const p = chart.bodies[body];
      if (!p) continue;
      const nak = nakshatra(p.lon);
      let salience = w.base + w.vedic;
      if (body === "moon") salience += w.luminary;
      atoms.push({
        id: `nakshatra:${body}:${nak.name.replace(/\s+/g, "_")}`, kind: "nakshatra",
        bodies: [body], salience, body, name: nak.name, pada: nak.pada, lord: nak.lord,
        text: `${title(body)} in ${nak.name} (pada ${nak.pada}, lord ${title(nak.lord)})`,
      });
    }
    const vargaDivs = vedic.vargas === true ? [9] : (vedic.vargas ?? []);
    for (const n of vargaDivs) {
      for (const body of nakBodies) {
        const p = chart.bodies[body];
        if (!p) continue;
        const v = varga(p.lon, n);
        atoms.push({
          id: `varga:d${n}:${body}:${v.sign.toLowerCase()}`, kind: "varga",
          bodies: [body], salience: w.base + w.vedic, division: n, body, sign: v.sign,
          text: `${title(body)} D${n} (${v.sign})`,
        });
      }
    }
    for (const y of vedic.yogas ?? []) {
      atoms.push({
        id: `yoga:${y.yoga.replace(/\s+/g, "_")}`, kind: "yoga",
        bodies: y.planets, salience: w.base + w.timelord * 0.5 + w.vedic,
        yoga: y.yoga, planets: y.planets,
        text: `Yoga ${y.yoga} (${y.planets.map(title).join(", ")})`,
      });
    }
  }

  // An inexact instant trusts the fast-moving facts least.
  const prov = opts.provenance;
  if (prov?.certainty && prov.certainty !== "exact") {
    const keep = TIME_SENSITIVE_KEEP[prov.certainty];
    for (const a of atoms) if (timeSensitive(a)) a.salience *= keep;
  }
  atoms.sort((m, n) => n.salience - m.salience || (m.id < n.id ? -1 : 1));
  return {
    jdUt: chart.jdUt, zodiac: chart.zodiac, atoms,
    realm: prov?.realm, certainty: prov?.certainty,
  };
}
