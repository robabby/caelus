/**
 * Compile serializable PassageRecords into a Caelus {@link InterpretationSource}.
 *
 * A {@link PassageRecord} is data: a public-domain passage, a serializable
 * {@link SelectorSpec} naming the fact it speaks to, and its provenance. This
 * module resolves each spec into a live Caelus {@link Selector} and packages a
 * set of records into an {@link InterpretationSource} that `interpret()` runs.
 * Keeping selectors as data (not code) is what lets the corpus ship as JSON and
 * stay auditable.
 */
import {
  hasPlacement, hasAspect, hasPattern, hasSignature, hasAngle,
} from "caelus";
import type {
  Selector, Rule, InterpretationSource, AngleAtom,
} from "caelus";
import type { PassageRecord, SelectorSpec } from "./types.js";

/** Resolve a serializable {@link SelectorSpec} into a live {@link Selector}. */
export function selectorFromSpec(spec: SelectorSpec): Selector {
  switch (spec.kind) {
    case "placement":
      return hasPlacement({
        body: spec.body, sign: spec.sign, house: spec.house, dignity: spec.dignity,
      });
    case "aspect":
      return hasAspect({ between: [spec.a, spec.b], aspect: spec.aspect, phase: spec.phase });
    case "pattern":
      return hasPattern({ kind: spec.pattern, body: spec.body });
    case "signature":
      return hasSignature(spec.facet, spec.value);
    case "angle":
      return hasAngle(spec.angle as AngleAtom["angle"], spec.sign);
  }
}

/** Turn one {@link PassageRecord} into a {@link Rule}, carrying its tradition
 *  and a short provenance string through to the reading as tags. */
export function ruleFromPassage(p: PassageRecord): Rule {
  return {
    id: p.id,
    when: selectorFromSpec(p.when),
    text: p.text,
    tags: [p.tradition, `source:${p.source.work}`],
  };
}

/** Compile a set of records into an {@link InterpretationSource}. */
export function compileSource(
  id: string, version: string, passages: PassageRecord[],
): InterpretationSource {
  return { id, version, rules: passages.map(ruleFromPassage) };
}
