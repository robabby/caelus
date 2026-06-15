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

The fact model is finite and enumerable, so the target is *cell coverage*. 111
passages across four sources today:

| Cell | Selector | Status |
|---|---|---|
| Sun in sign | `placement{ body, sign }` | Saint-Germain 12/12; Alan Leo 12/12 |
| Moon in sign | `placement{ body, sign }` | Alan Leo 3/12 (partial) |
| Planet in house | `placement{ body, house }` | Alan Leo Key 21 + How to Judge 63 |
| Other planet in sign | `placement{ body, sign }` | pending |
| Planet aspect planet | `aspect{ between, aspect }` | pending (Heindel) |
| Rising sign | `angle{ asc, sign }` | pending (Heindel, Alan Leo) |
| Dignities | `placement{ dignity }` | pending |

Coverage is partial by design: an extractor emits only the cells it can lift
cleanly from the OCR, and the harness reports the rest. Vedic
planet-in-rashi / planet-in-bhava map onto the same `placement` atoms, but the
Brihat Jataka translation uses Sanskrit rashi names, so its extractor needs a
rashi-name map (pending). Varga, yoga, dasha, fixed-star, and lot delineations
have **no atom kind yet** — binding them needs a Caelus-core extension to
`FactKind`.

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
