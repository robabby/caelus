/**
 * Turbo golden: the TS turbo evaluator must reproduce the Python evaluator on
 * the same pack (data/turbo.json). The golden (turbo-golden.json, from
 * python/export_turbo_golden.py) is the Python evaluator's longitudes; the TS
 * evaluator must match them bit-for-bit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Turbo, TurboPack } from "../src/turbo.js";

const here = dirname(fileURLToPath(import.meta.url));
const pack: TurboPack = JSON.parse(readFileSync(join(here, "../../data/turbo.json"), "utf8"));
const G = JSON.parse(readFileSync(join(here, "../../test/turbo-golden.json"), "utf8"));
const tb = new Turbo(pack);

let checks = 0;
let failures = 0;
let worst = 0;
const TOL = 1e-9; // same algorithm both sides; expect bit-identical

// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const c of G.cases as any[]) {
  checks++;
  const got = tb.longitude(c.body, c.jd);
  const d = Math.abs(got - c.lon);
  if (d > worst) worst = d;
  if (d > TOL) {
    failures++;
    console.error(`FAIL ${c.body} @ ${c.jd}: ${got} vs ${c.lon} (diff ${d})`);
  }
}

console.log(`\n${checks} checks, ${failures} failures`);
console.log(`worst diff: ${worst.toExponential(2)} deg`);
process.exit(failures ? 1 : 0);
