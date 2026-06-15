# caelus-delineations-pd

A public-domain astrology **interpretation corpus** for the Caelus
interpretation layer, and the default validation set for any interpreter built
on it.

Caelus is an interpretation-free fact engine: it stops at validated geometry and
projects a chart into ranked, citable [fact atoms](../../docs/interpretation-layer.md).
The engine ships the *contract* (`interpret()`, selectors), never the *content*.
This package is content: public-domain delineations decomposed, working backward
from that contract, into `InterpretationSource`s you drop straight into
`interpret(ctx, sources)`.

## Use

```ts
import { Engine, julianDay, interpretationContext, interpret } from "caelus";
import { loadNodeData } from "caelus/node";
import { sources } from "caelus-delineations-pd";

const engine = new Engine(loadNodeData(dataDir));
const chart = engine.chartAt(julianDay(1990, 6, 10, 14, 30, 0), 27.95, -82.46, "placidus");

const reading = interpret(interpretationContext(chart), sources);
// reading.entries: ranked, each citing the atom ids it rests on, tagged with
// its tradition and source work.
```

Also exported: `corpusManifest` (the source bibliography), `correspondences`
(a Liber 777 table), `passages` / `passageSets` (the raw records), and
`selectorFromSpec` / `compileSource` (the compiler) for building your own
sources.

## How it is built

The corpus is data, not hand-written code, so every claim stays traceable:

```
sources/text/*.txt          public-domain scans (manifest-driven fetch)
  -> scripts/extract/*.ts    parse enumerated delineations into PassageRecords
  -> data/passages/*.json    a passage + a serializable SelectorSpec + provenance
  -> src/compile.ts          SelectorSpec -> live Caelus Selector -> Rule
  -> src/sources.ts          one InterpretationSource per work  ->  `sources`
```

A `PassageRecord` names the fact it speaks to with a serializable `SelectorSpec`
(`placement` / `aspect` / `pattern` / `signature` / `angle`), so the corpus
ships as JSON and the binding to the engine is auditable. The atom-id and sign
strings it targets must match the engine's exact output (e.g. `"Aries"`, not
`"aries"`); `npm test` enforces this.

Scripts:

- `npm run fetch` — (re)acquire the source texts from the manifest.
- `npm run extract` — parse texts into `data/passages/*.json`.
- `npm run build:correspondences` — rebuild the Liber 777 table.
- `npm run build` / `npm test` — compile, then validate the corpus.

## Validation

`npm test` (`test/validation.test.ts`) is what makes this a *validation set*. With
no ephemeris it proves every compiled rule binds to a legal atom, fires for its
condition and only that condition, and cites only atoms that exist (no invented
provenance); it then runs the corpus against a real engine projection end to end,
and audits the manifest for rights and text integrity.

## Coverage

The fact model is finite and enumerable, so the target is *cell coverage*. 241
passages across five sources today:

| Cell | Selector | Status |
|---|---|---|
| Sun in sign | `placement{ body, sign }` | Saint-Germain 12 + Alan Leo 12 |
| Moon in sign | `placement{ body, sign }` | Alan Leo 3 (the scan's extent) |
| Planet in house | `placement{ body, house }` | Alan Leo Key 21 + How to Judge 63 |
| Planet aspect planet | `aspect{ between, aspect }` | Heindel 118 (5 Ptolemaic aspects) |
| Rising sign | `angle{ asc, sign }` | Heindel 12/12 |
| Fixed-star conjunction | `star{ body, star }` | Robson 20 (curated) |
| Mercury–Saturn in sign | `placement{ body, sign }` | pending (no clean PD scan in set) |
| Dignities | `placement{ dignity }` | pending |
| Hermetic lots | `lot{ lot, sign, house }` | selector ready; corpus pending |

The `lot` selector compiles, but no public-domain source in the set delineates
the Part of Fortune by house or sign (Sepharial: it "has no qualities of its
own"), so there are no lot rules yet. The lot atom is still useful on its own:
fed via `Engine.lots(chart)`, it enriches the fact projection an LLM brief or
the MCP `chart_facts` tool reads.

Fixed-star rules need `star` atoms, which the bare projection cannot compute
(the catalog lives in the data pack). Supply them when projecting:

```ts
const stars = engine.starConjunctions(chart, { orb: 1 });
const reading = interpret(interpretationContext(chart, { stars }), sources);
```

The Robson star set is **hand-curated** from his documented attributions: his
scan's star catalog is a garbled OCR table, so unlike every other source these
records are transcribed, not auto-extracted (`data/passages/robson-stars.json`).

Coverage is partial by design: an extractor emits only the cells it can lift
cleanly from the OCR, and the harness reports the rest. Known gaps and why:

- **Mercury–Saturn in sign**: the richest enumerated scan (Llewellyn George's
  *A to Z*) is `gratis-not-pd`; the public-domain scans in the set don't head
  these cells cleanly. Needs a cleaner PD source.
- **Vedic** (Brihat Jataka): the translation is verse/sloka-structured with no
  "planet in rashi" headings, so it needs a verse-level parser, not heading
  extraction. Text is vendored.
- **Fixed-star, lot, varga, yoga, dasha**: these have **no atom kind yet** —
  binding them needs a Caelus-core extension to `FactKind` *and* a cleanly
  enumerable corpus (Robson's star catalog, the one PD candidate in the set, is
  a garbled OCR table). Both are required, so they remain follow-ons.

## Corpus and licensing

`sources/manifest.json` is the bibliography; `rights` is one of `pd-us`, `cc0`,
`gratis-not-pd`. Each text carries a `status`; `needs-refetch` flags a file the
fetch pipeline captured corrupt (an HTML wrapper) or only partially, awaiting a
clean re-acquisition. The `data/correspondences.json` table is derived from the
[open_777](https://github.com/adamblvck/open_777) transcription of Crowley's
(public-domain) Liber 777 and attributed in `derivedFrom`.

Verify rights before relying on any entry: a "public-domain scan" is only PD for
the specific *edition/translation* cited (e.g. Ptolemy here is Ashmand 1822, not
the in-copyright Robbins 1940). One source — Llewellyn George's *A to Z* — is
vendored as `gratis-not-pd` (the available scan is a 1960 reprint of unconfirmed
status); it is **not** drawn on for any shipped rule. The full source texts are
vendored to the repo but **not** published to npm; only the manifest, compiled
passages, and correspondence data ship.

MIT (this package's code and data wiring; the source texts are public domain).
