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
2. **Routing:** an `AnchoredChart` envelope (`{ realm, when, where }`) and a
   `resolve(engine, frame, registry)` that runs the ephemeris-vs-compiler split.
3. **Interpretation integration:** thread `realm` + certainty into
   `interpretationContext` / `chartBrief` -- framing notes, auto-widened orbs,
   down-weighted time-sensitive atoms.
