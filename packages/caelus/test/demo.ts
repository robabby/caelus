import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine, BODIES, Body, fmtLon } from "../src/chart.js";
import { loadNodeData } from "../src/node-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = loadNodeData(join(here, "../../data"), "embedded", "full");
const eng = new Engine(data);

const c = eng.chart(2026, 6, 10, 16, 0, 0, 27.94, -82.46, "placidus");
console.log("Today's sky over Brandon, FL (16:00 UT):\n");
for (const b of BODIES) {
  const p = c.bodies[b];
  console.log(`${b.padEnd(10)} ${fmtLon(p.lon)}${p.retrograde ? " R" : ""}`);
}
console.log(`\nASC ${fmtLon(c.angles.asc)}   MC ${fmtLon(c.angles.mc)}`);
console.log(`aspects: ${c.aspects.length}`);

const t0 = performance.now();
const N = 500;
for (let i = 0; i < N; i++) {
  eng.chart(1990, 6, (i % 28) + 1, 14, 30, 0, 27.95, -82.46, "placidus");
}
const ms = (performance.now() - t0) / N;
console.log(`\nbenchmark: ${ms.toFixed(2)} ms/chart (${(1000 / ms).toFixed(0)} charts/sec)`);
