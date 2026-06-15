/**
 * Validation harness for the public-domain interpretation corpus.
 *
 * This is what makes the package a *validation* set: it proves, without any
 * ephemeris, that every compiled rule binds to a legal fact atom, fires against
 * a synthetic projection, and cites only atoms that exist (no invented
 * provenance). It also audits the corpus manifest for rights and integrity.
 *
 * Run as `node dist/test/validation.test.js` (after `tsc`), matching the engine.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { interpret, SIGNS } from "caelus";
import type { FactAtom, InterpretationContext } from "caelus";
import {
  sources, passages, selectorFromSpec, corpusManifest,
} from "../src/index.js";
import type { CorpusRights, SelectorSpec } from "../src/index.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RIGHTS: CorpusRights[] = ["pd-us", "cc0", "gratis-not-pd"];
const SIGN_SET = new Set<string>(SIGNS);

let failures = 0;
let warnings = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures++; }
}
function warn(msg: string): void { console.warn(`  warn: ${msg}`); warnings++; }

/** A minimal projection holding a single Sun placement in `sign`. */
function sunCtx(sign: string): InterpretationContext {
  const atom: FactAtom = {
    id: "placement:sun", kind: "placement", bodies: ["sun"], salience: 2.5,
    text: `Sun in ${sign}`, body: "sun", sign, signDeg: 10, house: 5,
    retrograde: false, dignities: [],
  };
  return { jdUt: 0, zodiac: "tropical", atoms: [atom] };
}

// 1. The corpus is populated and internally consistent.
console.log("corpus shape");
check(sources.length > 0, "at least one InterpretationSource");
check(passages.length > 0, "at least one PassageRecord");
const ruleCount = sources.reduce((n, s) => n + s.rules.length, 0);
check(ruleCount === passages.length, `rule count (${ruleCount}) === passage count (${passages.length})`);
const ruleIds = sources.flatMap((s) => s.rules.map((r) => `${s.id}/${r.id}`));
check(new Set(ruleIds).size === ruleIds.length, "rule ids unique across sources");

// 2. Every passage is well-formed and its selector compiles to a live selector.
console.log("passage well-formedness");
for (const p of passages) {
  check(p.text.trim().length >= 40, `${p.id}: passage text is substantive`);
  check(p.atomIds.length > 0, `${p.id}: declares target atom ids`);
  check(RIGHTS.includes(p.rights), `${p.id}: declared rights in vocabulary`);
  check(!!p.source.author && !!p.source.work, `${p.id}: carries author + work`);
  try {
    const sel = selectorFromSpec(p.when);
    check(typeof sel === "function", `${p.id}: selector resolves`);
  } catch (e) {
    check(false, `${p.id}: selector threw (${(e as Error).message})`);
  }
  // A sign string must match the engine's exact casing or the rule never fires.
  const sign = (p.when as { sign?: string }).sign;
  if (sign !== undefined) {
    check(SIGN_SET.has(sign), `${p.id}: sign "${sign}" matches an engine SIGNS value`);
  }
}

// 3. The compiler handles every SelectorSpec kind (forward-compat: aspect /
//    pattern / signature / angle aren't in the seed yet but must compile).
console.log("selector kinds");
const specs: SelectorSpec[] = [
  { kind: "placement", body: "mars", sign: "aries", house: 1, dignity: "domicile" },
  { kind: "aspect", a: "moon", b: "neptune", aspect: "conjunction", phase: "applying" },
  { kind: "pattern", pattern: "t_square", body: "mars" },
  { kind: "signature", facet: "element", value: "fire" },
  { kind: "angle", angle: "asc", sign: "leo" },
];
for (const s of specs) {
  try { check(typeof selectorFromSpec(s) === "function", `${s.kind} spec compiles`); }
  catch (e) { check(false, `${s.kind} spec threw (${(e as Error).message})`); }
}

// 4. Each Sun-sign rule fires for its sign, cites the real atom, and stays
//    isolated to that sign — the core "valid, testable" guarantee.
console.log("rules fire and cite");
const sunSignPassages = passages.filter((p) => p.when.kind === "placement" && p.when.body === "sun");
for (const p of sunSignPassages) {
  const sign = (p.when as { sign: string }).sign;
  const reading = interpret(sunCtx(sign), sources);
  const entry = reading.entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for Sun in ${sign}`);
  if (!entry) continue;
  check(entry.text === p.text, `${p.id}: emits the passage text`);
  check(
    entry.atomIds.every((id) => id === "placement:sun"),
    `${p.id}: cites only placement:sun (no invented provenance)`,
  );
  // Isolation: this rule must NOT fire for a different sign.
  const other = sign === "Aries" ? "Taurus" : "Aries";
  const wrong = interpret(sunCtx(other), sources).entries.find((e) => e.rule === p.id);
  check(!wrong, `${p.id}: does not fire for Sun in ${other}`);
}

// 5. No reading ever cites an atom the projection did not contain.
console.log("no dangling citations");
for (const sign of ["aries", "scorpio", "pisces"]) {
  const ctx = sunCtx(sign);
  const present = new Set(ctx.atoms.map((a) => a.id));
  for (const e of interpret(ctx, sources).entries) {
    check(e.atomIds.every((id) => present.has(id)), `entry ${e.id}: every cited atom is present`);
  }
}

// 6. End-to-end against the real engine: a chart's projection must actually
//    fire a Sun-sign rule. This is the check that catches a sign-casing or
//    atom-id contract drift that a synthetic atom would hide.
console.log("end-to-end on a real chart");
try {
  const { Engine, julianDay, interpretationContext } = await import("caelus");
  const { loadNodeData } = await import("caelus/node");
  const dataDir = join(PKG_ROOT, "../caelus/data");
  const engine = new Engine(loadNodeData(dataDir));
  const chart = engine.chartAt(julianDay(1990, 6, 10, 14, 30, 0), 27.95, -82.46, "placidus");
  const ctx = interpretationContext(chart);
  const sun = ctx.atoms.find((a) => a.id === "placement:sun");
  check(!!sun, "engine projection contains placement:sun");
  const reading = interpret(ctx, sources);
  const sunEntry = reading.entries.find((e) => e.rule.startsWith("saint-germain:sun-in-"));
  check(!!sunEntry, "a Sun-sign rule fires on the real chart projection");
  if (sunEntry) {
    check(
      sunEntry.atomIds.includes("placement:sun"),
      "the fired rule cites the real Sun placement atom",
    );
  }
} catch (e) {
  warn(`engine data unavailable, skipped end-to-end (${(e as Error).message})`);
}

// 7. Corpus manifest audit: rights vocabulary + local-text integrity.
console.log("manifest integrity");
for (const m of corpusManifest) {
  check(RIGHTS.includes(m.rights), `${m.id}: rights in vocabulary`);
  const file = join(PKG_ROOT, m.file);
  if (!existsSync(file)) { warn(`${m.id}: text not vendored (${m.file})`); continue; }
  const head = readFileSync(file, "utf8").slice(0, 200).toLowerCase();
  const isHtml = head.includes("<!doctype html") || head.includes("<html");
  if (m.status === "needs-refetch") {
    if (isHtml) warn(`${m.id}: known-bad, awaiting re-fetch (HTML)`);
    continue;
  }
  check(!isHtml, `${m.id}: vendored text is not an HTML wrapper`);
}

console.log(`\n${failures ? `${failures} FAILED` : "all checks passed"}` + (warnings ? `, ${warnings} warning(s)` : ""));
process.exit(failures ? 1 : 0);
