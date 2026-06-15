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
  sources, publicDomainSources, passages, selectorFromSpec, corpusManifest,
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

/** A minimal projection holding a single placement atom. */
function placeCtx(body: string, sign: string, house: number): InterpretationContext {
  const atom: FactAtom = {
    id: `placement:${body}`, kind: "placement", bodies: [body], salience: 2.5,
    text: `${body} in ${sign}`, body, sign, signDeg: 10, house,
    retrograde: false, dignities: [],
  };
  return { jdUt: 0, zodiac: "tropical", atoms: [atom] };
}
const sunCtx = (sign: string): InterpretationContext => placeCtx("sun", sign, 5);

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
  { kind: "star", body: "mars", star: "Aldebaran" },
  { kind: "lot", lot: "fortune", sign: "Leo", house: 5 },
];
for (const s of specs) {
  try { check(typeof selectorFromSpec(s) === "function", `${s.kind} spec compiles`); }
  catch (e) { check(false, `${s.kind} spec threw (${(e as Error).message})`); }
}

// 4. Each planet-in-sign rule (any body) fires for its sign, cites the real
//    atom, and stays isolated to that sign — the core "valid, testable"
//    guarantee.
console.log("rules fire and cite");
const signPassages = passages.filter(
  (p) => p.when.kind === "placement" && (p.when as { sign?: string }).sign !== undefined,
);
for (const p of signPassages) {
  const { body, sign } = p.when as { body: string; sign: string };
  const entry = interpret(placeCtx(body, sign, 5), sources).entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for ${body} in ${sign}`);
  if (!entry) continue;
  check(entry.text === p.text, `${p.id}: emits the passage text`);
  check(
    entry.atomIds.every((id) => id === `placement:${body}`),
    `${p.id}: cites only placement:${body} (no invented provenance)`,
  );
  // Isolation: this rule must NOT fire for a different sign.
  const other = sign === "Aries" ? "Taurus" : "Aries";
  const wrong = interpret(placeCtx(body, other, 5), sources).entries.find((e) => e.rule === p.id);
  check(!wrong, `${p.id}: does not fire for ${body} in ${other}`);
}

// 4b. Each planet-in-house rule fires for its body+house and cites the atom.
console.log("planet-in-house rules fire");
const housePassages = passages.filter(
  (p) => p.when.kind === "placement" && typeof (p.when as { house?: number }).house === "number",
);
check(housePassages.length > 0, "corpus has planet-in-house passages");
for (const p of housePassages) {
  const w = p.when as { body: string; house: number };
  const reading = interpret(placeCtx(w.body, "Aries", w.house), sources);
  const entry = reading.entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for ${w.body} in house ${w.house}`);
  if (entry) {
    // Wrong house must not fire it.
    const otherHouse = w.house === 1 ? 2 : 1;
    const wrong = interpret(placeCtx(w.body, "Aries", otherHouse), sources)
      .entries.find((e) => e.rule === p.id);
    check(!wrong, `${p.id}: does not fire for house ${otherHouse}`);
  }
}

// 4c. Each planet-aspect-planet rule fires for its configuration and cites the
//     real aspect atom (pair order must not matter).
console.log("planet-aspect-planet rules fire");
function aspectCtx(a: string, b: string, aspect: string): InterpretationContext {
  const [x, y] = [a, b].sort();
  const atom: FactAtom = {
    id: `aspect:${x}~${y}:${aspect}`, kind: "aspect", bodies: [a, b], salience: 2,
    text: `${a} ${aspect} ${b}`, a, b, aspect, orb: 1, phase: "applying", strength: 0.8,
  };
  return { jdUt: 0, zodiac: "tropical", atoms: [atom] };
}
const aspectPassages = passages.filter((p) => p.when.kind === "aspect");
check(aspectPassages.length > 0, "corpus has planet-aspect-planet passages");
for (const p of aspectPassages) {
  const w = p.when as { a: string; b: string; aspect: string };
  const entry = interpret(aspectCtx(w.a, w.b, w.aspect), sources).entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for ${w.a} ${w.aspect} ${w.b}`);
  if (entry) {
    const [x, y] = [w.a, w.b].sort();
    check(entry.atomIds.includes(`aspect:${x}~${y}:${w.aspect}`), `${p.id}: cites the aspect atom`);
  }
}

// 4d. Each rising-sign rule fires for its ascendant sign and only that sign.
console.log("rising-sign rules fire");
function ascCtx(sign: string): InterpretationContext {
  const atom: FactAtom = {
    id: "angle:asc", kind: "angle", bodies: [], salience: 2,
    text: `Ascendant in ${sign}`, angle: "asc", sign, signDeg: 10,
  };
  return { jdUt: 0, zodiac: "tropical", atoms: [atom] };
}
const anglePassages = passages.filter((p) => p.when.kind === "angle");
check(anglePassages.length > 0, "corpus has rising-sign passages");
for (const p of anglePassages) {
  const w = p.when as { sign: string };
  const entry = interpret(ascCtx(w.sign), sources).entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for Ascendant in ${w.sign}`);
  const other = w.sign === "Aries" ? "Taurus" : "Aries";
  const wrong = interpret(ascCtx(other), sources).entries.find((e) => e.rule === p.id);
  check(!wrong, `${p.id}: does not fire for Ascendant in ${other}`);
}

// 4e. Each fixed-star rule fires for a body conjunct its star, and only that star.
console.log("fixed-star rules fire");
function starCtx(body: string, star: string): InterpretationContext {
  const atom: FactAtom = {
    id: `star:${body}:${star}`, kind: "star", bodies: [body], salience: 3,
    text: `${body} conjunct ${star}`, body, star, orb: 0.3,
  };
  return { jdUt: 0, zodiac: "tropical", atoms: [atom] };
}
const starPassages = passages.filter((p) => p.when.kind === "star");
check(starPassages.length > 0, "corpus has fixed-star passages");
for (const p of starPassages) {
  const w = p.when as { star: string };
  const entry = interpret(starCtx("mars", w.star), sources).entries.find((e) => e.rule === p.id);
  check(!!entry, `${p.id}: fires for a body conjunct ${w.star}`);
  const other = w.star === "Algol" ? "Spica" : "Algol";
  const wrong = interpret(starCtx("mars", other), sources).entries.find((e) => e.rule === p.id);
  check(!wrong, `${p.id}: does not fire for ${other}`);
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
  const stars = engine.starConjunctions(chart, { orb: 1.0 });
  const ctx = interpretationContext(chart, { stars });
  const sun = ctx.atoms.find((a) => a.id === "placement:sun");
  check(!!sun, "engine projection contains placement:sun");
  const reading = interpret(ctx, sources);
  const signEntry = reading.entries.find((e) => /:[a-z]+-in-[a-z]+$/.test(e.rule));
  const houseEntry = reading.entries.find((e) => /-in-house-\d+$/.test(e.rule));
  const starEntry = reading.entries.find((e) => e.rule.startsWith("robson-stars:"));
  check(!!signEntry, "a planet-in-sign rule fires on the real chart projection");
  check(!!houseEntry, "a planet-in-house rule fires on the real chart projection");
  check(!!starEntry, "a fixed-star rule fires on the real chart projection (Jupiter on Sirius)");
  for (const e of reading.entries) {
    check(
      e.atomIds.every((id) => ctx.atoms.some((a) => a.id === id)),
      `${e.rule}: cites only atoms in the real projection`,
    );
  }
} catch (e) {
  warn(`engine data unavailable, skipped end-to-end (${(e as Error).message})`);
}

// 6b. publicDomainSources drops every gratis-not-pd passage but keeps the rest.
console.log("public-domain filter");
const pdRuleIds = new Set(publicDomainSources.flatMap((s) => s.rules.map((r) => r.id)));
const gratisIds = new Set(passages.filter((p) => p.rights === "gratis-not-pd").map((p) => p.id));
const pdIds = new Set(passages.filter((p) => p.rights !== "gratis-not-pd").map((p) => p.id));
check(gratisIds.size > 0, "corpus has at least one gratis-not-pd passage to exclude");
check([...gratisIds].every((id) => !pdRuleIds.has(id)), "publicDomainSources excludes every gratis-not-pd rule");
check([...pdIds].every((id) => pdRuleIds.has(id)), "publicDomainSources keeps every public-domain rule");

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
