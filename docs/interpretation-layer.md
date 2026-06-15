# Interpretation layer

Caelus is an interpretation-free fact engine: every module stops at validated
geometry and says so ("no interpretation, no flavour labels"). That is a
feature -- the numbers are correct and auditable -- but it leaves a developer
who wants to *generate* interpretations with no defined seam. This document
describes that seam: how a chart's validated facts become the substrate an
interpretation layer (rule-based or LLM-based) plugs into, what is built, and
what comes next.

The guiding split: the engine owns **facts**, a plugged-in layer owns
**meaning**, and the framework owns the **contract** between them -- never the
content.

## Layers

```
Engine (validated)        chart(): bodies, aspects, angles, cusps        [shipped]
  -> Fact projection      interpretationContext(chart): ranked atoms      [shipped]
  -> Matching             select/condition over atoms (provenance)        [next]
  -> Interpretation       InterpretationSource plugins + resolver         [next]
  -> Output               structured reading, or an LLM brief + citations [next]
```

Each layer is independently useful and consumes only the layer below.

## 1. Fact projection (shipped)

`interpretationContext(chart)` (`src/interpretation.ts`) flattens a `Chart` into
a ranked list of typed **fact atoms**. Each atom is the unit an interpreter
reasons about and cites.

Every atom carries:

- `id` -- a stable, content-addressable string (`placement:mars`,
  `aspect:mars~saturn:square`, `pattern:t_square:mars-moon-saturn`,
  `signature:element:fire`, `angle:asc`). Interpretations reference this id, so a
  generated claim can point at the fact it rests on.
- `kind` -- `placement | aspect | pattern | signature | angle`.
- `bodies` -- the body ids involved, for filtering and cross-reference.
- `salience` -- a transparent, overridable score (see below).
- `text` -- a plain-language statement of the fact, no interpretation
  ("Moon conjunction Neptune (applying, orb 0.6°)").

Atom-specific fields fill in the rest: placements add `sign`/`signDeg`/`house`/
`retrograde`/`dignities`; aspects add `aspect`/`orb`/`phase`/`strength`;
patterns add `pattern`/`apex`; signature facets add `facet`/`value`.

Two enrichments live here rather than on the bare `Chart`, because every
interpreter needs them and neither is in `Chart.aspects`:

- **phase** (applying / separating / exact), from the two bodies' speeds via the
  validated `aspectPhase` in `electional.ts`.
- **strength** in `[0, 1]` (1 = exact, 0 = at the orb limit), normalized against
  the orb policy.

### Salience

Salience ranks atoms so a reader leads with what is prominent without the engine
asserting meaning. It is a sum of explicit, documented contributions
(`SalienceWeights`, all overridable through `ContextOptions.salience`):

| Contribution | Applies to |
|---|---|
| `base` | every atom |
| `luminary` | Sun/Moon involved |
| `angular` | angular house (1/4/7/10), or an angle atom |
| `chartRuler` | the Ascendant ruler's placement |
| `dignity` | per essential dignity |
| `hardAspect` | conjunction / square / opposition |
| `pattern` | a whole configuration |

No weight is magic; a caller who dislikes the defaults overrides them.

This is TS-side framework code, not ephemeris. There is no Swiss Ephemeris
oracle for "which facts matter," so it is unit-tested for structure (atoms tie
back to the validated chart, strengths are consistent, ids unique, salience
sorted) rather than pinned by a parity golden.

## 2. Matching (next)

A selector/condition language that evaluates against the projection at one
instant and returns the atoms that satisfied each condition. Today's `query`
predicates are time-margin functions (`(engine, t) => number`) and geometric
only; they cannot express house, dignity, pattern membership, or signature
dominance, and they do not report which facts matched. The matching layer reads
atoms directly, so a rule like "Mars in an angular house AND part of a T-square"
is expressible and returns its supporting atoms for provenance.

## 3. Interpretation sources + resolver (next)

A typed plugin contract, sketch:

```ts
interface InterpretationSource {
  id: string;            // "traditional", "modern-psychological", a third party
  version: string;
  match(ctx: InterpretationContext): InterpretationEntry[];
}
interface InterpretationEntry {
  atomIds: string[];     // the facts this entry speaks to (provenance)
  text: string;          // or a template
  weight?: number;       // for ranking / conflict resolution
  source: string;        // attribution
}
```

A resolver runs registered sources against the projection, collects entries with
their atom provenance, ranks by salience x weight, reconciles contradictions,
and returns a structured reading. The engine ships the contract and perhaps one
reference source; the *content* is always the developer's.

## 4. Output: structured reading or LLM brief (next)

Two consumers of the resolved reading:

- **Structured reading** -- the ranked entries with provenance, for a
  rule-based product.
- **LLM brief** -- a compact, salience-ranked, provenance-tagged rendering of
  the atoms (and any matched entries) built as model input, plus a citation
  schema so each generated sentence references the atom ids it rests on. The
  citation loop is what makes a *novel* (LLM-written) interpretation also
  *accurate* (auditable against validated facts). Pairs with the MCP app, where
  the host LLM is already today's de-facto interpreter.

## Follow-ons

- Expose `interpretationContext` through the MCP server (a `chart_facts`-style
  tool, or as an optional block on `natal_chart`) so LLM hosts consume the
  ranked atoms directly instead of re-deriving them.
- Promote `phase` and `strength` onto `Chart.aspects` itself (needs the Python
  reference + golden regenerated, so it is a maintainer-environment change).
- Reception and dispositor chains as additional atom kinds.
