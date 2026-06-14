/**
 * Spherical-geometry golden: the TS port must reproduce the Python reference on
 * the same specs (spherical-golden.json, from export_spherical_golden.py).
 * Numbers compared with tolerance; structure exact.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { julianDay } from "../src/core.js";
import { Engine } from "../src/chart.js";
import { loadNodeData } from "../src/node-loader.js";
import { unitVector, angularSeparation3d } from "../src/spherical.js";

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, "../../test/spherical-golden.json"), "utf8"));
const eng = new Engine(loadNodeData(join(here, "../../data"), "embedded", "full"));

function jd(date: number[]): number {
  return julianDay(date[0], date[1], date[2], date[3] ?? 0, date[4] ?? 0, date[5] ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compute(spec: any): any {
  switch (spec.type) {
    case "sep":
      return angularSeparation3d(spec.a[0], spec.a[1], spec.b[0], spec.b[1]);
    case "unit":
      return unitVector(spec.lon, spec.lat);
    case "sep_bodies": {
      const j = jd(spec.jd);
      const pa = eng.position(spec.a, j);
      const pb = eng.position(spec.b, j);
      return angularSeparation3d(pa.lon, pa.lat, pb.lon, pb.lat);
    }
    default: throw new Error(`unknown spherical type ${spec.type}`);
  }
}

let checks = 0;
let failures = 0;
let worst = 0;
const TOL = 1e-9;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leaf(id: string, got: any, want: any): void {
  checks++;
  if (typeof want === "number") {
    const d = Math.abs(got - want);
    if (d > worst) worst = d;
    if (typeof got !== "number" || d > TOL) {
      failures++; console.error(`FAIL ${id}: ${got} vs ${want} (diff ${d})`);
    }
  } else if (got !== want) {
    failures++; console.error(`FAIL ${id}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepCmp(id: string, got: any, want: any): void {
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) {
      checks++; failures++;
      console.error(`FAIL ${id}: length ${got?.length} vs ${want.length}`);
      return;
    }
    for (let i = 0; i < want.length; i++) deepCmp(`${id}[${i}]`, got[i], want[i]);
  } else {
    leaf(id, got, want);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const c of G.cases as any[]) deepCmp(c.id, compute(c.spec), c.result);

console.log(`\n${checks} checks, ${failures} failures`);
console.log(`worst numeric diff: ${worst.toExponential(2)}`);
process.exit(failures ? 1 : 0);
