/**
 * astroengine interpretation brief -- a chart as compact, citable LLM input,
 * and an audit that the model cited real facts.
 *
 * This is the "novel and accurate" seam. An LLM writes fluent, original prose
 * (novel); to keep it honest (accurate) it is given only the validated fact
 * atoms, each tagged with a stable id, and asked to cite the id(s) every
 * statement rests on. {@link auditCitations} then checks those citations
 * resolve -- a claim that cites an id not in the brief invented its provenance
 * and is flagged. The chart math was never the model's to hallucinate.
 *
 * Pairs with the MCP app, where the host model is already the interpreter:
 * feed it {@link Brief.prompt} instead of raw positions it would guess at.
 */
import type { FactKind, InterpretationContext } from "./interpretation.js";
import type { Reading } from "./interpret.js";
import type { Zodiac } from "./chart.js";
import type { Realm, Certainty } from "./provenance.js";

/** Default instruction header prepended to {@link Brief.prompt}. */
export const BRIEF_INSTRUCTIONS =
  "Natal chart facts follow, each with a stable id in [brackets]. Interpret them "
  + "in your own words; after each statement, cite the id(s) it rests on as [id]. "
  + "Do not introduce astrological facts that are not listed here.";

/** How to frame an interpretation given what the chart is. */
const REALM_FRAMING: Record<Realm, string> = {
  observed: "", reported: "",
  planned: "This is a planned future moment; frame statements as potentials, not settled facts.",
  forecast: "This is a forecast moment; frame statements as tendencies, not certainties.",
  fictional: "This is a fictional subject; interpret the symbolism, not a real person's life.",
  mythic: "This is a mythic subject; read it as a symbol or story, not a biography.",
  counterfactual: "This is a hypothetical variant of a real event; keep it conditional.",
  archetypal: "This is an archetype, not a person; interpret the configuration's meaning itself.",
  conceptual: "This is a concept or organization, not a person; interpret it as such.",
};

/** A one-line framing for the realm and certainty, or `""` when neither needs it. */
export function realmFraming(realm?: Realm, certainty?: Certainty): string {
  const parts: string[] = [];
  if (realm && REALM_FRAMING[realm]) parts.push(REALM_FRAMING[realm]);
  if (certainty && certainty !== "exact") {
    parts.push(
      `The time is ${certainty}, so the Moon, the angles, and the houses are uncertain`
      + " -- lean on the slower planets and sign-level statements.",
    );
  }
  return parts.join(" ");
}

export interface BriefOptions {
  /** Keep only the top-N facts by salience. Default: all. */
  limit?: number;
  /** Restrict to certain atom kinds. */
  kinds?: FactKind[];
  /** Drop facts below this salience. */
  minSalience?: number;
  /** Fold a resolved {@link Reading}'s entries in as suggested readings. */
  reading?: Reading;
  /** Prepend {@link BRIEF_INSTRUCTIONS}. Default `true`. */
  header?: boolean;
}

/** A salience-ranked fact in a {@link Brief}. */
export interface BriefFact {
  id: string;
  kind: FactKind;
  text: string;
  salience: number;
}

/** A chart rendered as citable LLM input. */
export interface Brief {
  jdUt: number;
  zodiac: Zodiac;
  /** The facts offered, ranked by salience. */
  facts: BriefFact[];
  /** A prompt-ready, id-tagged rendering of {@link Brief.facts}. */
  prompt: string;
}

/**
 * Render an {@link InterpretationContext} as a compact, id-tagged {@link Brief}
 * for an LLM to interpret and cite.
 *
 * @param ctx A projection from {@link interpretationContext}.
 * @param opts Capping, kind filter, an optional {@link Reading} to fold in, and
 *   whether to prepend {@link BRIEF_INSTRUCTIONS}.
 * @returns The {@link Brief}: a ranked `facts` list and a ready `prompt`.
 */
export function chartBrief(
  ctx: InterpretationContext, opts: BriefOptions = {},
): Brief {
  let atoms = ctx.atoms;
  if (opts.kinds) atoms = atoms.filter((a) => opts.kinds!.includes(a.kind));
  if (opts.minSalience !== undefined) atoms = atoms.filter((a) => a.salience >= opts.minSalience!);
  if (opts.limit !== undefined) atoms = atoms.slice(0, opts.limit);
  const facts: BriefFact[] = atoms.map((a) => ({
    id: a.id, kind: a.kind, text: a.text, salience: a.salience,
  }));

  const lines = facts.map((f) => `[${f.id}] ${f.text}`);
  const framing = realmFraming(ctx.realm, ctx.certainty);
  let prompt = (opts.header === false ? "" : `${BRIEF_INSTRUCTIONS}\n\n`)
    + (framing ? `${framing}\n\n` : "")
    + lines.join("\n");
  if (opts.reading && opts.reading.entries.length) {
    prompt += "\n\nSuggested readings (cite the same fact ids):\n"
      + opts.reading.entries
        .map((e) => `${e.atomIds.map((id) => `[${id}]`).join("")} ${e.text}`)
        .join("\n");
  }
  return { jdUt: ctx.jdUt, zodiac: ctx.zodiac, facts, prompt };
}

/** A model-produced statement and the fact ids it claims to rest on. */
export interface Claim {
  text: string;
  cites: string[];
}

/** The result of {@link auditCitations}. */
export interface CitationAudit {
  /** True when every cited id resolves to a fact in the context. */
  ok: boolean;
  /** Total claims examined. */
  claims: number;
  /** Claims that cited at least one fact. */
  cited: number;
  /** Claims with no citation. */
  uncited: number;
  /** Distinct cited ids that resolve to a real atom. */
  valid: string[];
  /** Distinct cited ids with no matching atom -- invented provenance. */
  unknown: string[];
}

/**
 * Check that a model's claims cite only facts that exist in the context -- the
 * accuracy half of "novel and accurate". A claim citing an id not in `ctx`
 * fabricated its provenance, so `ok` is false and the id lands in `unknown`.
 *
 * @param claims The model's statements with their cited ids.
 * @param ctx The {@link InterpretationContext} the brief was built from.
 * @returns A {@link CitationAudit}.
 */
export function auditCitations(
  claims: Claim[], ctx: InterpretationContext,
): CitationAudit {
  const ids = new Set(ctx.atoms.map((a) => a.id));
  const valid = new Set<string>();
  const unknown = new Set<string>();
  let cited = 0;
  for (const c of claims) {
    if (c.cites.length) cited++;
    for (const id of c.cites) (ids.has(id) ? valid : unknown).add(id);
  }
  return {
    ok: unknown.size === 0,
    claims: claims.length, cited, uncited: claims.length - cited,
    valid: [...valid], unknown: [...unknown],
  };
}
