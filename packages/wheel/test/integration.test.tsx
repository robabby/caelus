/**
 * Cross-package integration: the real developer journey end to end,
 * local time + place -> UT (caelus-birth) -> chart (caelus) -> SVG wheel
 * (caelus-wheel) through renderToStaticMarkup. The per-package suites test each
 * layer in isolation; this protects the seam between them (e.g. a shape change
 * in the chart object that the wheel consumes).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Engine } from "caelus";
import { loadNodeData } from "caelus/node";
import { localToChart } from "caelus-birth";
import { ChartWheel } from "../src/index.js";

let checks = 0;
let failures = 0;
function assert(cond: boolean, msg: string): void {
  checks++;
  if (!cond) { failures++; console.error(`FAIL ${msg}`); }
}

const require_ = createRequire(import.meta.url);
const DATA = join(dirname(require_.resolve("caelus/package.json")), "data");
const eng = new Engine(loadNodeData(DATA, "embedded", "full"));

// A known birth: 1990-06-10 14:30 local in Tampa, with an explicit IANA zone so
// the journey is offline and deterministic (EDT = UTC-4 on that date).
const res = localToChart(
  {
    year: 1990, month: 6, day: 10, hour: 14, minute: 30,
    lat: 27.95, lon: -82.46, zone: "America/New_York",
  },
  eng,
);

// 1) caelus-birth resolved local -> UT.
assert(res.status === "ok", `birth status ok (got ${res.status})`);
assert(res.offsetMinutes === -240, `EDT is -240 min (got ${res.offsetMinutes})`);
assert(res.utc.hour === 18 && res.utc.minute === 30,
  `14:30 EDT -> 18:30 UT (got ${res.utc.hour}:${res.utc.minute})`);

// 2) caelus produced a usable chart from the resolved instant.
const chart = res.chart;
assert(chart.bodies.sun !== undefined && chart.bodies.moon !== undefined,
  "chart carries Sun and Moon");
assert(chart.cusps.length === 12, "chart has twelve house cusps");
const sunSign = chart.bodies.sun.sign;
assert(sunSign === "Gemini", `1990-06-10 Sun is in Gemini (got ${sunSign})`);

// 3) caelus-wheel rendered the chart to SVG, SSR-safe (Node, no DOM).
const svg = renderToStaticMarkup(<ChartWheel chart={chart} size={480} showAspects />);
assert(svg.startsWith("<svg") && svg.includes("</svg>"), "renders an <svg> root");
assert(svg.length > 2000, `SVG has real content (length ${svg.length})`);
assert(svg.includes("☉") && svg.includes("☽"),
  "the Sun and Moon glyphs reach the rendered wheel");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
