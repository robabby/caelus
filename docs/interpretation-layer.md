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
  -> Matching             selectors over atoms (provenance)               [shipped]
  -> Interpretation       InterpretationSource plugins + resolver         [shipped]
  -> Output               structured reading, or an LLM brief + citations [shipped]
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
- `kind` -- `placement | aspect | pattern | signature | angle | dispositor |
  reception | star | lot | transit | synastry | composite | timelord | dignity |
  nakshatra | varga | yoga`.
- `bodies` -- the body ids involved, for filtering and cross-reference.
- `salience` -- a transparent, overridable score (see below).
- `text` -- a plain-language statement of the fact, no interpretation
  ("Moon conjunction Neptune (applying, orb 0.6°)").

Atom-specific fields fill in the rest: placements add `sign`/`signDeg`/`house`/
`retrograde`/`dignities`; aspects add `aspect`/`orb`/`phase`/`strength`;
patterns add `pattern`/`apex`; signature facets add `facet`/`value`.

Two enrichments every interpreter needs now live on `Chart.aspects` itself (the
engine fills them; the projection just carries them onto the aspect atom):

- **phase** (applying / separating / exact), from the two bodies' speeds (the
  same formula as `aspectPhase` in `electional.ts`, validated equal in the
  golden run).
- **strength** in `[0, 1]` (1 = exact, 0 = at the orb limit), normalized against
  the orb policy actually used to find the aspect.

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
| `dispositor` / `reception` | a dispositor link / a mutual reception |
| `star` / `lot` | a fixed-star conjunction / a Hermetic lot |

No weight is magic; a caller who dislikes the defaults overrides them.

This is TS-side framework code, not ephemeris. There is no Swiss Ephemeris
oracle for "which facts matter," so it is unit-tested for structure (atoms tie
back to the validated chart, strengths are consistent, ids unique, salience
sorted) rather than pinned by a parity golden.

## 2. Matching (shipped)

`src/interpret.ts` provides selectors that evaluate against the projection and
report the atoms that satisfied them (`Match = { matched, atoms }`). Because
they read atoms directly, they express the whole fact model -- house, dignity,
pattern membership, signature dominance, aspect phase and strength -- which the
geometric, time-only `query` predicates cannot.

- atom selectors: `hasPlacement({ body, sign, house, retrograde, dignity })`,
  `hasAspect({ a, b, between, aspect, phase, minStrength })`,
  `hasPattern({ kind, body })`, `hasSignature(facet, value)`,
  `hasAngle(angle, sign)`, `hasDispositor({ body })`, `hasReception({ body })`,
  `hasStar({ body, star })`, `hasLot({ lot, sign, house })`.
- combinators: `matchAll(...)` (every selector; unions atoms), `matchAny(...)`
  (any; unions the matched), `matchNone(sel)` (an absence test; no atoms).

So "Mars in an angular house AND part of a T-square" is
`matchAll(hasPlacement({ body: "mars", house: 10 }), hasPattern({ kind: "t_square", body: "mars" }))`,
and the match carries the atoms that justified it.

## 3. Interpretation sources + resolver (shipped)

```ts
interface Rule {
  id: string;
  when: Selector;
  text: string | ((m: Match, ctx) => string);  // template gets the matched atoms
  weight?: number;
  tags?: string[];
}
interface InterpretationSource { id: string; version: string; rules: Rule[]; }
```

`interpret(ctx, sources)` runs every rule, and for each match emits a
`ReadingEntry` carrying the text, the matched `atomIds` (the audit trail), and a
salience = sum of those atoms' salience x the rule weight. Entries come back
sorted by salience. The engine ships the mechanism; the rule *content* is always
the developer's (a tradition, a house style, a third-party corpus).

`reconcile(reading, { conflicts, dedupe })` goes beyond flat ranking: it groups
entries by the facts they share (so everything said about one placement surfaces
together), drops duplicate text, and marks a group `contested` when a declared
conflicting tag-pair both appear in it. Semantic contradiction is the corpus
author's to declare (`tags` + `conflicts`); the resolver does the bookkeeping,
not the judgement.

## 4. Output: structured reading or LLM brief (shipped)

Two consumers of the projection (and an optional resolved {@link Reading}):

- **Structured reading** -- the ranked `interpret(...)` entries with provenance,
  for a rule-based product.
- **LLM brief** (`src/brief.ts`) -- `chartBrief(ctx, opts)` renders the
  salience-ranked, id-tagged facts (capped, kind-filtered, optionally folding a
  `Reading`'s entries in) into a ready `prompt`. The model writes original prose
  (*novel*) and cites the `[id]` each statement rests on; `auditCitations(claims,
  ctx)` then checks those citations resolve, flagging any that invented a fact
  (*accurate*). The chart math was never the model's to hallucinate. Pairs with
  the MCP app, where the host model is already the interpreter.

## Worked example

End to end, from a chart to a cited reading and an LLM brief. The rule text
below is **illustrative placeholder content**, not authoritative astrology --
the engine ships no interpretation content; a real corpus is the developer's.

```ts
import {
  Engine, julianDay,
  interpretationContext,
  hasPlacement, hasAspect, hasPattern, hasReception, matchAll,
  interpret, reconcile,
  chartBrief, auditCitations,
} from "caelus";
import { loadNodeData } from "caelus/node";

const engine = new Engine(loadNodeData(dataDir));
const chart = engine.chartAt(julianDay(1990, 6, 10, 14, 30, 0), 27.95, -82.46, "placidus");

// 1. Project the validated chart into ranked, citable fact atoms.
const ctx = interpretationContext(chart);

// 2. A developer's pluggable corpus (illustrative).
const source = {
  id: "example", version: "0.1",
  rules: [
    { id: "lunar-stellium",
      when: matchAll(hasPlacement({ body: "moon" }), hasPattern({ kind: "stellium_sign", body: "moon" })),
      text: "The Moon sits inside a sign stellium.", tags: ["emphasis"] },
    { id: "moon-neptune",
      when: hasAspect({ between: ["moon", "neptune"], aspect: "conjunction" }),
      text: "Feeling and imagination blur together.", weight: 1.5 },
    { id: "saturn-domicile",
      when: hasPlacement({ body: "saturn", dignity: "domicile" }),
      text: "Saturn is structurally strong.", tags: ["affirming"] },
    { id: "venus-saturn-reception",
      when: hasReception({ body: "venus" }),
      text: "Venus and its dispositor exchange signs." },
  ],
};

// 3. Resolve -> ranked entries, each citing the atom ids it rests on.
const reading = interpret(ctx, [source]);
const groups = reconcile(reading, { dedupe: true });

// 4a. Rule-based output: reading.entries / groups, with provenance.
// 4b. LLM output: a citable brief, then an audit of what the model cited.
const brief = chartBrief(ctx, { limit: 20, reading });
//   ...model writes prose citing [ids]...
const audit = auditCitations(modelClaims, ctx); // audit.ok === false flags invented facts
```

## MCP exposure (shipped)

The `chart_facts` tool (`caelus-mcp`) returns a chart's ranked, citable atoms
plus a ready `brief`, so an LLM host interprets from correct math and cites the
`[id]` each statement rests on instead of re-deriving (and hallucinating)
positions. It is `realize`-backed and provenance-aware: alongside `date`+`lat`+
`lon` it takes a `realm`, an uncertain `earliest`+`latest` range (the brief then
frames it provisionally and damps the time-sensitive atoms), or `constraints`
for an archetypal chart with no time (compiler synthesis). This is the
interpretation seam wired into the chat product.

Atom kinds now also include **dispositor** (the classical ruler of each
classical planet's sign, with the final-dispositor terminus flagged) and
**reception** (mutual reception by domicile, exaltation, or the chart's sect
triplicity ruler -- `by` names the dignities, salience scales with the weaker
link), with `hasDispositor` / `hasReception` selectors.

A **star** atom (`hasStar`) records a body's conjunction with a catalog fixed
star. The bare projection cannot compute it -- the star catalog lives in the
data pack, not on the `Chart` -- so a caller supplies the conjunctions via
`ContextOptions.stars`, typically from `Engine.starConjunctions(chart, { orb })`,
and the projection turns each into a `star:<body>:<name>` atom.

A **lot** atom (`hasLot`) records a Hermetic lot -- the Part of Fortune and its
six companions -- placed by sign and house. Supply them via `ContextOptions.lots`
from `Engine.lots(chart)`; the projection emits a `lot:<name>` atom for each.
Lots are time-sensitive (they derive from the Ascendant and Moon), so an inexact
instant damps them like the angles.

### Diachronic and relational atoms (shipped)

The natal projection is extended via `ContextOptions` and the helpers in
`relational.ts`:

- **Transit** (`transit:saturn~natal_moon:square`, ...): transiting body aspecting
  a natal point, with phase, strength, and natal house. Supply
  `transits` from {@link transitAspects}.
- **Synastry** (`synastry:mars~b_venus:square`, `synastry:overlay:a:mars:house:7`):
  inter-chart aspects and house overlays from {@link synastryAspects} /
  {@link synastryOverlays}.
- **Composite** (`composite:mars`, ...): midpoint placements from
  {@link compositePlacements}.
- **Time-lords** (`profection:year:scorpio:mars`, `zr:l1:…`, `firdaria:major:…`,
  `dasha:maha:…`): active profection, zodiacal releasing, firdaria, and
  Vimshottari dasha periods via `timelords` (caller runs `profectionAt`, `zrAt`,
  `firdariaAt`, `vimshottariAt`).
- **Finer dignities** (`term:moon:saturn`, `face:…`, `triplicity:…`,
  `almuten:moon:jupiter`): Egyptian terms, faces, sect triplicity, and almuten
  of each classical planet's degree -- projected automatically from the chart.
- **Vedic structure** (`nakshatra:moon:…`, `varga:d9:moon:…`, `yoga:Gajakesari`):
  nakshatras, divisional placements, and yogas via `vedic` options (often from
  a sidereal chart and `yogasAt`).

Selectors: `hasTransit`, `hasSynastry`, `hasComposite`, `hasTimelord`,
`hasDignityFine`, `hasNakshatra`, `hasVarga`, `hasYoga`. All ids resolve in
{@link auditCitations} like natal atoms.

Helpers: {@link enrichContextOptions} (transits + time-lords + Vedic at a target
instant), {@link enrichSynastryOptions} (synastry + composite for two charts).
The Playground Reading tab and MCP `chart_facts` / `synastry` tools use these.

## Reference corpus (shipped separately)

**`caelus-delineations-pd`** (`packages/caelus-delineations-pd`) is a
public-domain interpretation corpus and validation set: passages decomposed into
`PassageRecord` JSON, compiled to `InterpretationSource`s, and gated by
`npm test`. Site guide: [/docs/corpus](https://www.ephemengine.com/docs/corpus).

## Follow-ons

Remaining corpus gaps (not engine gaps): dignity and lot passages from PD texts,
Vedic verse-level extraction (Brihat Jataka vendored), and broader fixed-star
coverage beyond the curated Robson set. Regenerate `golden.json` when aspect
phase/strength fields should be stored in the golden fixtures (the TS engine
fills them now; the golden run pins aspect count, so nothing is red in the
meantime).
