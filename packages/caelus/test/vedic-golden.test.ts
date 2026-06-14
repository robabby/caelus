/**
 * Vedic golden: the TS port (nakshatras + Vimshottari dasha) must reproduce the
 * Python reference. Both run the SAME specs (from vedic-golden.json, generated
 * by python/export_vedic_golden.py). Numbers compared with tolerance; strings
 * and structure exact. A closing block checks implementation-independent facts:
 * the nine dasha years total 120, each mahadasha's nine antardashas tile it, the
 * starting dasha is the Moon's nakshatra lord, and 0 deg sidereal is Ashwini /
 * pada 1 / Ketu.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { julianDay } from "../src/core.js";
import { Engine } from "../src/chart.js";
import { loadNodeData } from "../src/node-loader.js";
import * as V from "../src/vedic.js";

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, "../../test/vedic-golden.json"), "utf8"));
const data = loadNodeData(join(here, "../../data"), "embedded", "full");
const eng = new Engine(data);

function jd(date: number[]): number {
  return julianDay(date[0], date[1], date[2], date[3] ?? 0, date[4] ?? 0, date[5] ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compute(spec: any): any {
  switch (spec.type) {
    case "nakshatra": return V.nakshatra(spec.lon);
    case "nakshatra_at": return V.nakshatraAt(eng, jd(spec.natal));
    case "dashas": return V.vimshottariDashas(spec.moon_lon, jd(spec.natal), 2);
    case "active": return V.vimshottariActive(spec.moon_lon, jd(spec.natal), jd(spec.target));
    case "at": return V.vimshottariAt(eng, jd(spec.natal), jd(spec.target));
    default: throw new Error(`unknown vedic type ${spec.type}`);
  }
}

let checks = 0;
let failures = 0;
let worst = 0;
const TOL = 1e-6;

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
    failures++;
    console.error(`FAIL ${id}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepCmp(id: string, got: any, want: any): void {
  if (want !== null && typeof want === "object") {
    if (got === null || typeof got !== "object") {
      checks++; failures++;
      console.error(`FAIL ${id}: ${JSON.stringify(got)} vs object`);
      return;
    }
    for (const k of Object.keys(want)) deepCmp(`${id}.${k}`, got[k], want[k]);
  } else {
    leaf(id, got, want);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const c of G.cases as any[]) deepCmp(c.id, compute(c.spec), c.result);

// --- invariants, independent of the golden ---
const fail = (msg: string) => { checks++; failures++; console.error(`FAIL ${msg}`); };
const ok = () => { checks++; };
{
  const total = V.VIMSHOTTARI_ORDER.reduce((a, l) => a + V.VIMSHOTTARI_YEARS[l], 0);
  if (total !== 120) fail(`vimshottari years total ${total} != 120`); else ok();

  const n0 = V.nakshatra(0);
  if (n0.name !== "Ashwini" || n0.pada !== 1 || n0.lord !== "ketu") fail(`nakshatra(0) = ${JSON.stringify(n0)}`); else ok();

  // antardashas tile each mahadasha and begin with its lord
  const tl = V.vimshottariDashas(45, jd([1990, 6, 10, 14, 30]), 2);
  if (tl.start_lord !== V.nakshatra(45).lord) fail(`start_lord ${tl.start_lord}`); else ok();
  for (const m of tl.dashas) {
    if (m.sub.length !== 9) { fail(`${m.lord}: ${m.sub.length} antardashas`); continue; }
    const tiles = Math.abs(m.sub[0].start - m.start) < 1e-6
      && Math.abs(m.sub[8].end - m.end) < 1e-6
      && m.sub[0].lord === m.lord;
    if (!tiles) fail(`${m.lord}: antardashas do not tile`); else ok();
  }
}

console.log(`\n${checks} checks, ${failures} failures`);
console.log(`worst numeric diff: ${worst.toExponential(2)}`);
process.exit(failures ? 1 : 0);
