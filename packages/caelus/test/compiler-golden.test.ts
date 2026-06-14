/**
 * Compiler golden + behaviour. The loss math (formLoss) must reproduce the
 * Python reference bit-for-bit (compiler-golden.json). The optimizer
 * (compileForm) is checked by behaviour: a satisfiable form solves, an
 * impossible one is flagged, and the result is deterministic.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formLoss, compileForm, constraintLoss, Constraint } from "../src/compiler.js";

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, "../../test/compiler-golden.json"), "utf8"));

let checks = 0;
let failures = 0;
let worst = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { failures++; console.error(`FAIL ${m}`); } };

// --- golden: formLoss must match the Python reference ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const c of G.cases as any[]) {
  const got = formLoss(c.spec.lons, c.spec.constraints);
  const d = Math.abs(got - c.result);
  if (d > worst) worst = d;
  checks++;
  if (d > 1e-12) { failures++; console.error(`FAIL ${c.id}: ${got} vs ${c.result} (diff ${d})`); }
}

// --- behaviour: a satisfiable form solves to ~0 ---
const sat: Constraint[] = [
  { kind: "aspect", a: "venus", b: "pluto", angle: 180, weight: 0.91 },
  { kind: "aspect", a: "venus", b: "mars", angle: 0, weight: 0.84 },
  { kind: "sign", body: "venus", sign: 1, weight: 0.95 }, // Taurus
];
const r = compileForm(sat);
ok(!r.impossible, "satisfiable form is not flagged impossible");
ok(r.maxConstraintLoss < 0.5, `satisfiable form solves tightly (max loss ${r.maxConstraintLoss.toFixed(3)})`);
for (const c of r.constraints) ok(c.loss < 0.5, `each constraint met (${c.kind} loss ${c.loss.toFixed(3)})`);
const venus = r.longitudes.venus;
ok(venus >= 30 && venus < 60, `Venus lands in Taurus (${venus.toFixed(2)})`);
ok(constraintLoss(r.longitudes, { kind: "aspect", a: "venus", b: "pluto", angle: 180 }) < 0.5,
   "Venus and Pluto are opposed in the solution");

// --- behaviour: an impossible form is flagged ---
const imp: Constraint[] = [
  { kind: "aspect", a: "venus", b: "mars", angle: 0 },
  { kind: "aspect", a: "venus", b: "mars", angle: 180 },
];
const ri = compileForm(imp);
ok(ri.impossible, "contradictory form is flagged impossible");
ok(ri.maxConstraintLoss > 30, `impossible form has a large residual (${ri.maxConstraintLoss.toFixed(1)})`);

// --- behaviour: deterministic ---
const a = compileForm(sat).longitudes;
const b = compileForm(sat).longitudes;
ok(Object.keys(a).every((k) => a[k] === b[k]), "compileForm is deterministic");

console.log(`\n${checks} checks, ${failures} failures`);
console.log(`worst golden diff: ${worst.toExponential(2)}`);
process.exit(failures ? 1 : 0);
