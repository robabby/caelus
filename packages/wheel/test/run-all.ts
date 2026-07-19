/**
 * Run every compiled wheel suite. Discovers *.test.js files in this directory
 * at run time (sorted, so the order is deterministic) rather than naming them,
 * so a new suite cannot be silently left out of `npm test`. Each suite runs in
 * its own process and owns its exit code; this runner reports per-suite
 * results and exits non-zero if any suite failed.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(here).filter((f) => f.endsWith(".test.js")).sort();

if (suites.length === 0) {
  console.error("run-all: no compiled *.test.js suites found — build first");
  process.exit(1);
}

const failed: string[] = [];
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const res = spawnSync(process.execPath, [join(here, suite)], { stdio: "inherit" });
  if (res.status !== 0) failed.push(suite);
}

console.log(`\nrun-all: ${suites.length} suites, ${failed.length} failed` +
  (failed.length ? ` (${failed.join(", ")})` : ""));
process.exit(failed.length ? 1 : 0);
