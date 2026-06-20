/**
 * caelus-wheel render checks: real charts from the engine through
 * renderToStaticMarkup (also proves SSR safety — this is Node, no DOM),
 * plus unit checks on the collision-avoidance fan.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Engine } from "caelus";
import { loadNodeData } from "caelus/node";
import { ChartWheel, spreadAngles } from "../src/index.js";

let checks = 0;
let failures = 0;
function assert(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const require_ = createRequire(import.meta.url);
const DATA = join(dirname(require_.resolve("caelus/package.json")), "data");
const eng = new Engine(loadNodeData(DATA, "embedded", "full"));

// ---------------------------------------------------------------- spreadAngles
{
  // well-separated input is returned unchanged
  const lons = [10, 100, 200, 300];
  const out = spreadAngles(lons, 6.5);
  assert(out.every((v, i) => Math.abs(v - lons[i]) < 1e-9), "spread: identity when separated");
}
{
  // a tight stellium fans to >= minSep, order preserved, centered
  const lons = [315.71, 315.61, 316.93, 317.77, 318.61]; // 1962-02-05 cluster
  const out = spreadAngles(lons, 6.5);
  const sorted = [...out].sort((a, b) => mod(a - 300, 360) - mod(b - 300, 360));
  for (let i = 1; i < sorted.length; i++) {
    assert(mod(sorted[i] - sorted[i - 1], 360) >= 6.5 - 1e-6,
      `spread: stellium pair ${i} separation ${mod(sorted[i] - sorted[i - 1], 360).toFixed(2)}`);
  }
  // zodiacal order preserved (moon < sun < mercury < venus < jupiter)
  const order = [1, 0, 2, 3, 4]; // indices sorted by true lon
  for (let k = 1; k < order.length; k++) {
    assert(mod(out[order[k]] - out[order[k - 1]], 360) < 180,
      "spread: stellium order preserved");
  }
}
{
  // cluster across the 0° wrap
  const lons = [358, 1, 4];
  const out = spreadAngles(lons, 6.5);
  const seps = [mod(out[1] - out[0], 360), mod(out[2] - out[1], 360)];
  assert(seps.every((s) => s >= 6.5 - 1e-6), `spread: wrap cluster seps ${seps.map((s) => s.toFixed(1))}`);
}
{
  // more bodies than the circle can hold at minSep: falls back to 360/n
  const lons = Array.from({ length: 80 }, (_, i) => mod(i * 1.3, 360));
  const out = spreadAngles(lons, 6.5);
  assert(out.every((v) => Number.isFinite(v)), "spread: dense input stays finite");
}

// ---------------------------------------------------------------- rendering
function render(chart: Parameters<typeof ChartWheel>[0]["chart"], props = {}) {
  return renderToStaticMarkup(<ChartWheel chart={chart} {...props} />);
}

const fixture = eng.chart(1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus");
const polar = eng.chart(1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus"); // whole_sign fallback
const stellium = eng.chart(1962, 2, 5, 0, 0, 0, 27.95, -82.46, "placidus");

for (const [label, chart] of [
  ["fixture", fixture], ["polar", polar], ["stellium", stellium],
] as const) {
  const svg = render(chart);
  assert(svg.startsWith("<svg"), `${label}: renders svg`);
  assert(!svg.includes("NaN"), `${label}: no NaN coordinates`);
  assert(svg.includes("☉") && svg.includes("☽") && svg.includes("⚷"),
    `${label}: planet glyphs present`);
  assert(svg.includes("♈") && svg.includes("♓"), `${label}: sign glyphs present`);
  assert((svg.match(/AC|MC|DC|IC/g) ?? []).length >= 4, `${label}: axes labeled`);
}

// retrograde mark appears for the fixture chart (saturn is retrograde)
assert(fixture.bodies.saturn.retrograde === true, "fixture: saturn retrograde (precondition)");
assert(render(fixture).includes("℞"), "fixture: retrograde mark rendered");

// aspect toggle: hiding aspects removes line elements
{
  const withA = (render(fixture).match(/<line/g) ?? []).length;
  const without = (render(fixture, { showAspects: false }).match(/<line/g) ?? []).length;
  assert(withA - without === fixture.aspects.length,
    `aspects: ${withA - without} lines for ${fixture.aspects.length} aspects`);
}

// aspectTypes filter
{
  const only = render(fixture, { aspectTypes: ["trine"] });
  const trines = fixture.aspects.filter((a) => a.aspect === "trine").length;
  const base = (render(fixture, { showAspects: false }).match(/<line/g) ?? []).length;
  assert((only.match(/<line/g) ?? []).length === base + trines,
    "aspects: aspectTypes filters to trines only");
}

// mean_node hidden by default, shown when requested
{
  const dflt = render(fixture);
  const both = render(fixture, { bodies: Object.keys(fixture.bodies) });
  assert((both.match(/☊/g) ?? []).length === 2 && (dflt.match(/☊/g) ?? []).length === 1,
    "bodies: mean_node opt-in");
}

// MCP payload shape: rx instead of retrograde, no signDeg — renders identically
// to the engine chart it mirrors (caelus-mcp natal_chart pipes in as-is)
{
  const mcpShaped = {
    bodies: Object.fromEntries(Object.entries(fixture.bodies).map(([id, p]) => [
      id,
      {
        lon: Math.round(p!.lon * 100) / 100,
        ...(p!.retrograde ? { rx: true } : {}),
      },
    ])),
    angles: { asc: fixture.angles.asc, mc: fixture.angles.mc },
    cusps: fixture.cusps,
    aspects: fixture.aspects,
  };
  const svg = render(mcpShaped);
  assert(svg.startsWith("<svg") && !svg.includes("NaN"), "mcp shape: renders without NaN");
  assert(svg.includes("℞"), "mcp shape: rx flag renders the retrograde mark");
  // note: react escapes the trailing apostrophe in text content, so match without it
  const sd = mod(mcpShaped.bodies.sun.lon, 30);
  const label = `${Math.floor(sd)}°${String(Math.floor(mod(sd, 1) * 60)).padStart(2, "0")}`;
  assert(svg.includes(label), `mcp shape: sun degree label ${label} derived from lon`);
}

// theme override propagates
assert(render(fixture, { theme: { axis: "#ff0000" } }).includes("#ff0000"),
  "theme: override applied");

// planetColors tints glyph + position tick; label/connector stay on labelText
{
  const svg = render(fixture, {
    theme: {
      planetText: "#cccccc",
      labelText: "#888888",
      planetColors: { sun: "#ffaa00", moon: "#aabbcc" },
    },
  });
  assert(svg.includes('fill="#ffaa00"'), "planetColors: sun glyph fill");
  assert(svg.includes('stroke="#ffaa00"'), "planetColors: sun position tick");
  assert(svg.includes('fill="#aabbcc"'), "planetColors: moon glyph fill");
  assert(!svg.includes('fill="#cccccc"') || svg.includes('fill="#888888"'),
    "planetColors: unlisted bodies fall back to planetText or use labelText for labels");
}

// size prop
assert(render(fixture, { size: 300 }).includes('width="300"'), "size: applied");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
