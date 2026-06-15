# Provenance layer: realms and anchors

A chart silently asserts "a real instant at a real place." That is wrong for
most interesting cases -- forecasts, fictional or mythic subjects, archetypes,
counterfactuals, charts with only an approximate or relative time. The
provenance layer (`src/provenance.ts`) makes the chart's grounding first-class:
what it *is* (`Realm`), and how its time and place are known (`TemporalAnchor`,
`SpatialAnchor`). It does three jobs.

## 1. Routing: which generator runs

Caelus has two chart generators -- `chartAt(instant, place)` (ephemeris) and
`compileForm(constraints)` (symbolic synthesis, the inverse). `Realm` is the
switch between them:

- `observed` / `reported` / `planned` / `forecast` / `counterfactual` are
  **time-anchored**: resolve the `TemporalAnchor` to an instant, then `chartAt`.
- `archetypal` / `conceptual` / `mythic` have **no instant** ("the chart of
  Aries" is a constraint set, not a moment), so they are generated from the
  compiler. `isTimeAnchored(realm)` reports the split.

`counterfactual` is the bridge: a real instant, then perturbed.

## 2. The temporal algebra

`TemporalAnchor` is not just a tagged value; `relative` and `narrative` make it
a small constraint graph -- the temporal cousin of the compiler. `resolveTime`
turns an anchor into a usable instant, always reporting a `Certainty`
(`exact` | `approximate` | `representative` | `none`) and a `note`:

| kind | resolves to | certainty |
|---|---|---|
| `instant` | the parsed UT JD | exact |
| `range` | the midpoint (+ bounds) | representative |
| `relative` | a registry instant ± parsed offset | approximate |
| `narrative` | a pluggable calendar resolver's output | approximate |
| `symbolic` / `none` | null (rationale/reason kept) | none |

Offsets accept a compact unit (`"3d"`, `"-2h"`, `"6mo"`) or an ISO-8601 duration
(`"P1Y2M10DT2H30M"`); calendar units use mean lengths. A `relative` anchor reads
its reference from the `AnchorRegistry` (`anchorId -> instant`); a `narrative`
anchor reads a calendar resolver (`value -> jd`) -- Stardate, regnal years, a
game epoch. Unknown reference or calendar resolves to `null` with a note, and
`narrative.sequence` preserves order when no absolute time exists.

## 3. The spatial twin

`SpatialAnchor` mirrors the temporal one (`geo` / `named` / `region` /
`relative` / `fictional` / `none`), resolved by `resolvePlace` against the same
registry (a `gazetteer` resolves `named`; `places` resolves `relative`).
`none` place is exactly the heliocentric / archetypal case (no houses, no
angles).

## Counterfactuals

The `counterfactual` realm -- a real chart, perturbed -- has its own operator
(`src/counterfactual.ts`). `counterfactual(engine, base, edit, registry, opts)`
realizes the base, applies a `CounterfactualEdit`, and `chartDiff`s the result:

- `shiftTime` (`"1h"`, `"-30m"`, `"P1D"`) or `place` -- a real ephemeris
  recompute. "Born an hour later" leaves the planets in their signs but rotates
  every house and the angles.
- `setLongitudes` -- a geometry what-if ("Mars in the next sign"): the body is
  spliced to a new longitude, its house and the aspects it touches are
  recomputed, and everything else (the angles, the other bodies) stays.

`chartDiff` returns only what changed -- bodies that shifted sign/house, aspects
gained/lost, angles that changed sign -- so the perturbation is legible. The MCP
`counterfactual_chart` tool exposes it.

## Why it matters for interpretation

Realm and certainty are an **accuracy guardrail**, extending the interpretation
layer's "novel and accurate" loop from "the facts are right" to "the chart's
status is right." An interpreter must know it is reading a forecast (provisional)
or a mythic chart (a symbol, not a biography), and an `approximate` / `range`
anchor should widen orbs and down-weight the time-sensitive atoms (Moon, angles,
houses) automatically.

## Build sequence

1. **Foundation (shipped):** the types, `AnchorRegistry`, `resolveTime` /
   `resolvePlace` with offset parsing and per-kind certainty.
2. **Routing (shipped):** `src/anchored.ts` -- an `AnchoredChart` envelope
   (`{ realm, when, where, constraints? }`) and `realize(engine, anchored,
   registry, opts)`. A resolvable instant runs the ephemeris (`chartAt`); failing
   that, constraints run the compiler (`compileForm`); failing both, it returns
   `via: "none"` with the reason. The result carries the realm, the resolved
   time/place, and the `chart` or `form`.
3. **Interpretation integration (shipped):** `interpretationContext(chart, {
   provenance: { realm, certainty } })` carries both onto the context and damps
   time-sensitive atoms (the Moon, the angles) when the instant is inexact
   (`approximate` 0.7, `representative` 0.6) while leaving the slow planets
   alone. `chartBrief` prepends a realm + certainty framing line
   (`realmFraming`), so a forecast reads as provisional and a mythic chart as a
   symbol, not a biography -- the accuracy guardrail extended from "the facts are
   right" to "the chart's status is right." Wire it from `realize`'s result:
   `interpretationContext(realized.chart, { provenance: { realm: realized.realm,
   certainty: realized.time.certainty } })`.
4. **MCP exposure (shipped):** the `chart_facts` tool is `realize`-backed and
   takes `realm`, an `earliest`+`latest` range, or `constraints` (compiler path)
   beside the plain `date`/`lat`/`lon`, so a host gets the framed, damped brief
   for forecast / fictional / archetypal charts -- not just verified births.
