/**
 * astroengine interpretation matching + resolver -- the plug for a content layer.
 *
 * The {@link interpretationContext} projection turns a chart into ranked fact
 * atoms; this layer lets a developer plug in *meaning*. A {@link Selector}
 * matches atoms (and reports which ones, so a claim carries its provenance); a
 * {@link Rule} pairs a selector with text; an {@link InterpretationSource}
 * bundles rules (a tradition, a house style, a third-party corpus). The engine
 * ships the contract and the resolver, never the content: {@link interpret}
 * runs sources against a context and returns a ranked {@link Reading}, each
 * entry tagged with the atom ids it rests on.
 *
 * Selectors read the projection directly, so they express the whole fact model
 * -- house, dignity, pattern membership, signature dominance, aspect phase and
 * strength -- which the geometric, time-only `query` predicates cannot.
 */
import type { FactAtom, InterpretationContext } from "./interpretation.js";

/** The result of a {@link Selector}: did it match, and on which atoms. */
export interface Match {
  matched: boolean;
  /** The atoms that satisfied the selector (the provenance). Empty for a
   *  satisfied absence test ({@link matchNone}). */
  atoms: FactAtom[];
}

/** Tests a whole {@link InterpretationContext} and reports the matching atoms. */
export type Selector = (ctx: InterpretationContext) => Match;

const hit = (atoms: FactAtom[]): Match => ({ matched: atoms.length > 0, atoms });

// ------------------------------------------------------------- atom selectors

/** Matches placement atoms by any subset of body / sign / house / retrograde /
 *  a held dignity. */
export function hasPlacement(filter: {
  body?: string; sign?: string; house?: number;
  retrograde?: boolean; dignity?: string;
} = {}): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "placement"
    && (filter.body === undefined || a.body === filter.body)
    && (filter.sign === undefined || a.sign === filter.sign)
    && (filter.house === undefined || a.house === filter.house)
    && (filter.retrograde === undefined || a.retrograde === filter.retrograde)
    && (filter.dignity === undefined || a.dignities.includes(filter.dignity))));
}

/** Matches aspect atoms. `between` is an unordered pair; `minStrength` filters
 *  loose aspects; `phase` filters applying/separating. */
export function hasAspect(filter: {
  a?: string; b?: string; between?: [string, string];
  aspect?: string; phase?: string; minStrength?: number;
} = {}): Selector {
  const pair = filter.between ? [...filter.between].sort() : null;
  return (ctx) => hit(ctx.atoms.filter((at) => {
    if (at.kind !== "aspect") return false;
    if (filter.a !== undefined && at.a !== filter.a) return false;
    if (filter.b !== undefined && at.b !== filter.b) return false;
    if (pair && [at.a, at.b].sort().join() !== pair.join()) return false;
    if (filter.aspect !== undefined && at.aspect !== filter.aspect) return false;
    if (filter.phase !== undefined && at.phase !== filter.phase) return false;
    if (filter.minStrength !== undefined && at.strength < filter.minStrength) return false;
    return true;
  }));
}

/** Matches configuration atoms by kind and/or a participating body. */
export function hasPattern(filter: { kind?: string; body?: string } = {}): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "pattern"
    && (filter.kind === undefined || a.pattern === filter.kind)
    && (filter.body === undefined || a.bodies.includes(filter.body))));
}

/** Matches a structural-signature facet, e.g. `("element", "fire")`. */
export function hasSignature(facet: string, value?: string): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "signature" && a.facet === facet
    && (value === undefined || a.value === value)));
}

/** Matches an angle atom by which angle and/or its sign. */
export function hasAngle(angle: string, sign?: string): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "angle" && a.angle === angle
    && (sign === undefined || a.sign === sign)));
}

/** Matches dispositor atoms by body, its dispositor, and/or the final flag
 *  (a body in its own domicile that terminates a dispositor chain). */
export function hasDispositor(filter: {
  body?: string; dispositor?: string; final?: boolean;
} = {}): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "dispositor"
    && (filter.body === undefined || a.body === filter.body)
    && (filter.dispositor === undefined || a.dispositor === filter.dispositor)
    && (filter.final === undefined || a.final === filter.final)));
}

/** Matches a mutual reception, optionally involving a given body. */
export function hasReception(filter: { body?: string } = {}): Selector {
  return (ctx) => hit(ctx.atoms.filter((a) =>
    a.kind === "reception"
    && (filter.body === undefined || a.bodies.includes(filter.body))));
}

// ----------------------------------------------------------------- combinators

/** Matches only when every selector matches; returns the union of their atoms. */
export function matchAll(...sels: Selector[]): Selector {
  return (ctx) => {
    const parts = sels.map((s) => s(ctx));
    return parts.every((p) => p.matched)
      ? { matched: true, atoms: dedupe(parts.flatMap((p) => p.atoms)) }
      : { matched: false, atoms: [] };
  };
}

/** Matches when any selector matches; returns the atoms from those that did. */
export function matchAny(...sels: Selector[]): Selector {
  return (ctx) => {
    const matched = sels.map((s) => s(ctx)).filter((p) => p.matched);
    return matched.length
      ? { matched: true, atoms: dedupe(matched.flatMap((p) => p.atoms)) }
      : { matched: false, atoms: [] };
  };
}

/** Matches when the selector does NOT match (an absence test); no atoms. */
export function matchNone(sel: Selector): Selector {
  return (ctx) => ({ matched: !sel(ctx).matched, atoms: [] });
}

function dedupe(atoms: FactAtom[]): FactAtom[] {
  const seen = new Set<string>();
  return atoms.filter((a) => (seen.has(a.id) ? false : seen.add(a.id)));
}

// --------------------------------------------------------------- rules + source

/** One interpretation: a condition and the text it licenses. */
export interface Rule {
  /** Stable id, unique within its source. */
  id: string;
  /** The condition over the fact projection. */
  when: Selector;
  /** The interpretation text, or a function of the match for templating. */
  text: string | ((match: Match, ctx: InterpretationContext) => string);
  /** Multiplies the matched atoms' salience when ranking (default 1). */
  weight?: number;
  /** Free-form labels (theme, polarity, ...) carried through to the entry. */
  tags?: string[];
}

/** A pluggable corpus of rules: a tradition, a house style, a third party. */
export interface InterpretationSource {
  id: string;
  version: string;
  rules: Rule[];
}

/** One licensed statement in a {@link Reading}, with its provenance. */
export interface ReadingEntry {
  /** `"<source>/<rule>"`. */
  id: string;
  source: string;
  rule: string;
  text: string;
  /** Ids of the fact atoms this entry rests on -- the audit trail. */
  atomIds: string[];
  /** Sum of the matched atoms' salience times the rule weight. */
  salience: number;
  tags?: string[];
}

/** A resolved interpretation: ranked entries, each citing its facts. */
export interface Reading {
  jdUt: number;
  entries: ReadingEntry[];
}

/**
 * Run interpretation sources against a fact projection and return a ranked
 * {@link Reading}. Each rule whose selector matches emits an entry carrying the
 * matched atom ids (provenance) and a salience = sum of those atoms' salience x
 * the rule weight. The engine never ships the content: the sources are the
 * caller's.
 *
 * @param ctx A projection from {@link interpretationContext}.
 * @param sources One or more {@link InterpretationSource} corpora.
 * @returns The {@link Reading}; entries are sorted by descending salience.
 */
export function interpret(
  ctx: InterpretationContext, sources: InterpretationSource[],
): Reading {
  const entries: ReadingEntry[] = [];
  for (const src of sources) {
    for (const rule of src.rules) {
      const m = rule.when(ctx);
      if (!m.matched) continue;
      const text = typeof rule.text === "function" ? rule.text(m, ctx) : rule.text;
      const salience = m.atoms.reduce((s, a) => s + a.salience, 0) * (rule.weight ?? 1);
      entries.push({
        id: `${src.id}/${rule.id}`, source: src.id, rule: rule.id, text,
        atomIds: m.atoms.map((a) => a.id), salience, tags: rule.tags,
      });
    }
  }
  entries.sort((p, q) => q.salience - p.salience || (p.id < q.id ? -1 : 1));
  return { jdUt: ctx.jdUt, entries };
}
