/**
 * Claims linter: every numeric/factual claim in prose must match a single
 * generated source of truth. Catches the class of drift where a number copied
 * from a transient console line (golden check count, worst diff) silently moves
 * and the prose is never updated.
 *
 * Sources of truth:
 *   - conformance-stats.json: emitted by the golden suite (CAELUS_STATS_OUT).
 *     If absent, this script regenerates it by running the built suite.
 *   - packages/caelus/accuracy.json: canonical per-body accuracy table.
 *
 * Zero dependencies. Exits non-zero with a file:line report on any mismatch.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const rel = (p) => ROOT + p;

const STATS_PATH = process.env.CAELUS_STATS_OUT || rel("conformance-stats.json");
const GOLDEN_JS = rel("packages/caelus/dist/test/golden.test.js");

function loadStats() {
  if (existsSync(STATS_PATH)) return JSON.parse(readFileSync(STATS_PATH, "utf8"));
  if (!existsSync(GOLDEN_JS)) {
    console.error(
      `check-claims: no stats at ${STATS_PATH} and the golden suite is not built.\n` +
      `Run: npm run build -w caelus && CAELUS_STATS_OUT=conformance-stats.json node ${GOLDEN_JS}`,
    );
    process.exit(2);
  }
  // Regenerate stats from the built suite.
  execFileSync("node", [GOLDEN_JS], { env: { ...process.env, CAELUS_STATS_OUT: STATS_PATH }, stdio: "ignore" });
  return JSON.parse(readFileSync(STATS_PATH, "utf8"));
}

const accuracy = JSON.parse(readFileSync(rel("packages/caelus/accuracy.json"), "utf8"));

function resolveSource(spec, stats) {
  // spec like "stats.worst.nano_arcsec", "stats.checks", or "accuracy.<key>"
  const [root, ...path] = spec.split(".");
  let cur = root === "stats" ? stats : root === "accuracy" ? accuracy : null;
  if (cur === null) throw new Error(`unknown source root: ${root}`);
  for (const k of path) cur = cur?.[k];
  return cur;
}

function renderValue(claim, raw) {
  let v = raw;
  if (typeof claim.round === "number" && typeof v === "number") {
    v = Number(v.toFixed(claim.round));
  }
  return v;
}

const registry = JSON.parse(readFileSync(rel("scripts/claims-registry.json"), "utf8"));
const stats = loadStats();

const problems = [];

function lineOf(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

for (const claim of registry.claims) {
  const raw = resolveSource(claim.source, stats);
  if (raw === undefined || raw === null) {
    problems.push(`[${claim.id}] source "${claim.source}" resolved to ${raw}`);
    continue;
  }
  const value = renderValue(claim, raw);
  const expected = claim.render.map((r) => r.replaceAll("{value}", String(value)));

  for (const file of claim.appearsIn) {
    const fpath = rel(file);
    if (!existsSync(fpath)) {
      problems.push(`[${claim.id}] missing file: ${file}`);
      continue;
    }
    const text = readFileSync(fpath, "utf8");

    // 1. The expected rendered value must be present (any one render form).
    const present = expected.some((e) => text.includes(e));
    if (!present) {
      problems.push(
        `[${claim.id}] ${file}: expected one of [${expected.join(" | ")}] (from ${claim.source}=${value}) — not found`,
      );
    }

    // 2. No competing value of the same shape may appear.
    if (claim.competing) {
      const re = new RegExp(claim.competing, "g");
      let m;
      while ((m = re.exec(text)) !== null) {
        const matched = m[0];
        // The match is OK only if it is (or contains) one of the expected renders.
        const ok = expected.some((e) => matched.includes(e) || e.includes(matched));
        if (!ok) {
          problems.push(
            `[${claim.id}] ${file}:${lineOf(text, m.index)}: competing value "${matched.trim()}" — expected ${value}`,
          );
        }
      }
    }
  }
}

if (problems.length) {
  console.error("claims check FAILED:\n" + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`claims check passed (${registry.claims.length} claims, stats from ${stats.suite} suite: ${stats.checks} checks)`);
