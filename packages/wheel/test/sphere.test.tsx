/**
 * ChartSphere render checks: a real chart through renderToStaticMarkup (SSR
 * safe, no DOM), plus a check that ecliptic latitude actually changes the
 * output, i.e. this is a 3D sphere and not a flat wheel in disguise.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Engine } from "caelus";
import { loadNodeData } from "caelus/node";
import { ChartSphere } from "../src/index.js";

let checks = 0;
let failures = 0;
function assert(cond: boolean, msg: string): void {
  checks++;
  if (!cond) { failures++; console.error(`FAIL ${msg}`); }
}

const require_ = createRequire(import.meta.url);
const DATA = join(dirname(require_.resolve("caelus/package.json")), "data");
const eng = new Engine(loadNodeData(DATA, "embedded", "full"));
const chart = eng.chart(1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus");

const svg = renderToStaticMarkup(<ChartSphere chart={chart} size={500} />);
assert(svg.startsWith("<svg") && svg.includes("</svg>"), "renders an <svg> root");
assert(svg.includes("☉") && svg.includes("☽"), "Sun and Moon glyphs are drawn");
assert((svg.match(/<path /g) ?? []).length >= 2, "great-circle ring paths are present");
assert(svg.includes("<line "), "latitude stems are present");
assert(svg.length > 2000, `SVG has real content (length ${svg.length})`);

// Ecliptic latitude must matter: flatten every body to lat 0 and the render
// changes (the Moon's ~5 deg and Pluto's ~17 deg move on the sphere).
const flat = {
  bodies: Object.fromEntries(
    Object.entries(chart.bodies).map(([k, v]) => [k, { ...v!, lat: 0 }]),
  ),
};
const svgFlat = renderToStaticMarkup(<ChartSphere chart={flat} size={500} />);
assert(svg !== svgFlat, "ecliptic latitude changes the rendering (3D, not a flat wheel)");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
