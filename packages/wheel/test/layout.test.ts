/**
 * caelus-wheel layout kernel checks: the pure layoutChartWheel() module.
 *
 * Plain .ts on purpose — the kernel must be importable and testable with no
 * React (and no DOM) anywhere in the module graph. Real charts come from the
 * engine exactly as in render.test; synthetic inputs cover the contract edges
 * the engine cannot produce on demand (unknown time, dangling aspect edges,
 * forced label collisions).
 */
import { layoutChartWheel } from "../src/layout.js";
import type { WheelLayoutInput } from "../src/layout.js";

let checks = 0;
let failures = 0;
function assert(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const rounded = (v: number) => Number.isFinite(v) && Math.round(v * 100) / 100 === v;

/** Every px coordinate in a layout: finite and rounded to 2 decimals. */
function eachCoord(layout: ReturnType<typeof layoutChartWheel>): number[] {
  const out: number[] = [];
  const seg = (s: { x1: number; y1: number; x2: number; y2: number }) =>
    out.push(s.x1, s.y1, s.x2, s.y2);
  const box = (b: { cx: number; cy: number; w: number; h: number }) =>
    out.push(b.cx, b.cy, b.w, b.h);
  for (const r of layout.rings) out.push(r.r);
  for (const b of layout.zodiac.boundaries) seg(b.seg);
  for (const g of layout.zodiac.signGlyphs) box(g.box);
  for (const t of layout.zodiac.ticks) seg(t.seg);
  if (layout.houses) {
    for (const cu of layout.houses.cusps) seg(cu.seg);
    for (const n of layout.houses.numbers) box(n.box);
  }
  if (layout.axes) for (const a of layout.axes) { seg(a.seg); box(a.label); }
  for (const p of layout.points) {
    seg(p.tick);
    box(p.glyph);
    if (p.label) box(p.label);
    if (p.connector) seg(p.connector);
  }
  for (const a of layout.aspects) seg(a.seg);
  return out;
}

// ------------------------------------------------- known-time core geometry
const knownTime: WheelLayoutInput = {
  points: [
    { id: "sun", lon: 76.5, glyph: "☉", label: "16°30'" },
    { id: "moon", lon: 156.25, glyph: "☽", label: "6°15'" },
  ],
  aspects: [{ a: "sun", b: "moon", family: "trine", tightness: 0.9 }],
  angles: { asc: 210.4, mc: 120.9 },
  cusps: [210.4, 240, 270, 300, 330, 0, 30.4, 60, 90, 120.9, 150, 180],
};

{
  const layout = layoutChartWheel(knownTime);
  assert(layout.size === 520, "defaults: size 520");
  assert(layout.center.x === 260 && layout.center.y === 260, "defaults: center at size/2");
  assert(layout.outerRadius === 260 * 0.96, "defaults: outer radius 0.96 of half size");
  assert(layout.viewBox.x === -520 * 0.07 && layout.viewBox.width === 520 + 2 * 520 * 0.07,
    "defaults: view box padded for axis labels");
  assert(layout.rings.length === 4, "rings: four circles");
  assert(layout.zodiac.boundaries.length === 12, "zodiac: twelve sign boundaries");
  assert(layout.zodiac.signGlyphs.length === 12, "zodiac: twelve sign glyphs");
  assert(layout.zodiac.ticks.length === 360, "zodiac: 360 degree ticks");
  assert(layout.zodiac.ticks.filter((t) => t.kind === "ten").length === 36,
    "zodiac: 36 ten-degree ticks");
  assert(layout.houses !== null && layout.houses.cusps.length === 12,
    "houses: twelve cusp lines when cusps supplied");
  assert(layout.houses !== null && layout.houses.numbers.length === 12,
    "houses: twelve house numbers when cusps supplied");
  assert(layout.axes !== null && layout.axes.map((a) => a.id).join(",") === "AC,MC,DC,IC",
    "axes: AC, MC, DC, IC when angles supplied");
  assert(layout.applied.anchor === "asc" && layout.applied.anchorLon === 210.4,
    "anchor: defaults to the Ascendant when angles are present");

  // ASC sits at 9 o'clock: x well left of center, y at center height
  const ac = layout.axes!.find((a) => a.id === "AC")!;
  assert(Math.abs(ac.seg.y2 - 260) < 0.01 && ac.seg.x2 < 260,
    "anchor: Ascendant lands at 9 o'clock");

  assert(layout.points.length === 2, "points: one layout entry per input point");
  const sun = layout.points[0];
  assert(sun.id === "sun" && sun.trueLon === 76.5, "points: identity and trueLon preserved");
  assert(sun.displayLon === 76.5, "points: uncrowded display longitude equals true longitude");
  assert(sun.glyph.text === "☉" && sun.glyph.fontSize === 520 * 0.05,
    "points: glyph text and font size");
  assert(sun.label !== undefined && sun.label.text === "16°30'",
    "points: label text carried through");
  assert(sun.glyph.w > 0 && sun.glyph.h > 0, "points: glyph box has measured extent");
  assert(sun.connector === undefined, "points: no connector when not displaced");

  assert(layout.aspects.length === 1, "aspects: one chord per edge");
  const chord = layout.aspects[0];
  assert(chord.a === "sun" && chord.b === "moon" && chord.family === "trine"
    && chord.tightness === 0.9, "aspects: endpoints, family, tightness pass through");

  assert(Array.isArray(layout.crowding) && layout.crowding.length === 0,
    "crowding: empty for a sparse chart");

  const coords = eachCoord(layout);
  assert(coords.length > 1500, `coords: layout is complete (${coords.length} values)`);
  assert(coords.every(rounded), "coords: every coordinate finite and rounded to 2 decimals");
}

// ------------------------------------------------- unknown time + anchoring
{
  const unknown: WheelLayoutInput = {
    points: [
      { id: "sun", lon: 0, glyph: "☉", label: "0°00'" },
      { id: "moon", lon: 200, glyph: "☽", label: "20°00'" },
    ],
    aspects: [],
  };
  const layout = layoutChartWheel(unknown);
  assert(layout.houses === null, "unknown time: no houses");
  assert(layout.axes === null, "unknown time: no axes");
  assert(layout.applied.anchor === "aries0" && layout.applied.anchorLon === 0,
    "unknown time: anchors 0° Aries by default");
  // 0° Aries sits at 9 o'clock: sun at lon 0 → left of center, center height
  const sun = layout.points[0];
  assert(Math.abs(sun.glyph.cy - 260) < 0.01 && sun.glyph.cx < 260,
    "unknown time: 0° Aries lands at 9 o'clock");
  assert(layout.zodiac.boundaries.length === 12 && layout.zodiac.ticks.length === 360,
    "unknown time: zodiac ring still complete");
}
{
  // known time rendered with an explicit Aries-zero anchor: axes still drawn
  const layout = layoutChartWheel(knownTime, { anchor: "aries0" });
  assert(layout.applied.anchor === "aries0" && layout.applied.anchorLon === 0,
    "anchor: explicit aries0 override on a known-time chart");
  assert(layout.axes !== null && layout.houses !== null,
    "anchor: aries0 keeps houses and axes when input has them");
}
{
  // partial optionality: cusps without angles, angles without cusps
  const housesOnly = layoutChartWheel({ ...knownTime, angles: undefined },
    { anchor: "aries0" });
  assert(housesOnly.houses !== null && housesOnly.axes === null,
    "optional: cusps without angles lays out houses only");
  const axesOnly = layoutChartWheel({ ...knownTime, cusps: undefined });
  assert(axesOnly.axes !== null && axesOnly.houses === null,
    "optional: angles without cusps lays out axes only");
}

// ------------------------------------------------- contract violations throw
function throws(fn: () => unknown, type: new (...a: never[]) => Error, msg: string): void {
  try {
    fn();
    assert(false, `${msg} (did not throw)`);
  } catch (e) {
    assert(e instanceof type, `${msg} (threw ${(e as Error).constructor.name})`);
  }
}
{
  const base = { points: [{ id: "sun", lon: 10, glyph: "☉" }], aspects: [] };
  throws(() => layoutChartWheel({ ...base }, { anchor: "asc" }), TypeError,
    "throws: asc anchor without angles");
  throws(() => layoutChartWheel({
    points: [{ id: "sun", lon: 1, glyph: "☉" }, { id: "sun", lon: 2, glyph: "☉" }],
    aspects: [],
  }), TypeError, "throws: duplicate point id");
  throws(() => layoutChartWheel({
    ...base, aspects: [{ a: "sun", b: "pluto", family: "trine", tightness: 1 }],
  }), TypeError, "throws: aspect edge referencing an unknown point");
  throws(() => layoutChartWheel({
    points: [{ id: "sun", lon: Number.NaN, glyph: "☉" }], aspects: [],
  }), RangeError, "throws: non-finite point longitude");
  throws(() => layoutChartWheel({
    ...base, aspects: [{ a: "sun", b: "sun", family: "trine", tightness: Number.NaN }],
  }), RangeError, "throws: non-finite tightness");
  throws(() => layoutChartWheel({ ...base, cusps: [0, 30, 60] }), TypeError,
    "throws: wrong cusp count");
  throws(() => layoutChartWheel(base, { size: 0 }), RangeError, "throws: zero size");
  throws(() => layoutChartWheel(base, { signGlyphs: ["♈"] }), TypeError,
    "throws: wrong signGlyphs length");
  throws(() => layoutChartWheel(base, {
    metrics: { width: () => Number.NaN, height: () => 10 },
  }), RangeError, "throws: metrics returning non-finite widths");
}

// ------------------------------------------------- spreading + connectors
{
  const tight: WheelLayoutInput = {
    points: [
      { id: "a", lon: 100, glyph: "☉", label: "10°00'" },
      { id: "b", lon: 101, glyph: "☽", label: "11°00'" },
    ],
    aspects: [],
  };
  const layout = layoutChartWheel(tight);
  const [a, b] = layout.points;
  assert(a.trueLon === 100 && b.trueLon === 101,
    "spread: true longitudes preserved verbatim");
  assert(mod(b.displayLon - a.displayLon, 360) >= 6.5 - 1e-6,
    "spread: display longitudes fanned to the minimum separation");
  assert(a.connector !== undefined && b.connector !== undefined,
    "spread: displaced points carry connectors");
  assert(mod(b.displayLon - a.displayLon, 360) < 180, "spread: zodiacal order kept");
}
{
  // wrap-around cluster at 358° / 1° / 4°
  const wrap: WheelLayoutInput = {
    points: [
      { id: "a", lon: 358, glyph: "☉" },
      { id: "b", lon: 1, glyph: "☽" },
      { id: "c", lon: 4, glyph: "♂" },
    ],
    aspects: [],
  };
  const layout = layoutChartWheel(wrap);
  const [a, b, c2] = layout.points;
  const seps = [mod(b.displayLon - a.displayLon, 360), mod(c2.displayLon - b.displayLon, 360)];
  assert(seps.every((s) => s >= 6.5 - 1e-6),
    `spread: wrap cluster separations ${seps.map((s) => s.toFixed(1)).join(", ")}`);
  assert(layout.points.every((p) => Number.isFinite(p.displayLon)),
    "spread: wrap cluster display longitudes finite");
}

// ------------------------------------------------- metrics drive text boxes
{
  const input: WheelLayoutInput = {
    points: [{ id: "sun", lon: 40, glyph: "☉", label: "abc" }],
    aspects: [],
  };
  const dflt = layoutChartWheel(input);
  const wide = layoutChartWheel(input, {
    metrics: {
      width: (text, fontSize) => text.length * 2 * fontSize,
      height: (fontSize) => 2 * fontSize,
    },
  });
  assert(wide.points[0].label!.w > dflt.points[0].label!.w,
    "metrics: injected metrics change measured label width");
  assert(wide.applied.metrics === "custom" && dflt.applied.metrics === "default",
    "metrics: applied metadata reports the metrics source");
  const perGlyph = layoutChartWheel({
    points: [
      { id: "one", lon: 40, glyph: "☉", label: "☉☉☉" },
      { id: "two", lon: 200, glyph: "☉", label: "aaa" },
    ],
    aspects: [],
  });
  assert(perGlyph.points[0].label!.w > perGlyph.points[1].label!.w,
    "metrics: default table is per-codepoint, not character count alone");
}

// ------------------------------------------------- collision tier + crowding
{
  // three wide labels forced to the 12 o'clock arc (aries0: top = lon 270)
  const top: WheelLayoutInput = {
    points: [
      { id: "a", lon: 264, glyph: "☉", label: "10°00'" },
      { id: "b", lon: 270, glyph: "☽", label: "11°00'" },
      { id: "c", lon: 276, glyph: "♂", label: "12°00'" },
    ],
    aspects: [],
  };
  const layout = layoutChartWheel(top);
  const [a, b, c2] = layout.points;
  // the middle label dropped to the inner tier (down the screen at 12 o'clock)
  assert(b.label!.cy > a.label!.cy && b.label!.cy > c2.label!.cy,
    "collision: alternate label dropped to the inner tier");
  // outer pair still intersects at this size: reported, not hidden
  assert(layout.crowding.length === 1 && layout.crowding[0].kind === "label",
    "collision: unresolved region reported as label crowding");
  assert(layout.crowding[0].pointIds.join(",") === "a,c",
    `collision: crowding names the still-intersecting points (got ${layout.crowding[0].pointIds.join(",")})`);
  const coords = eachCoord(layout);
  assert(coords.every(rounded), "collision: adjusted layout still finite and rounded");
}
{
  // an unresolvable glyph pileup (tiny separation floor) is reported, never blank
  const pile: WheelLayoutInput = {
    points: [
      { id: "a", lon: 180, glyph: "☉" },
      { id: "b", lon: 180.1, glyph: "☽" },
    ],
    aspects: [],
  };
  const layout = layoutChartWheel(pile, { minAngularSep: 0.5 });
  assert(layout.points.length === 2 && layout.crowding.length === 1
    && layout.crowding[0].kind === "glyph",
    "collision: glyph overlap beyond the bounded strategy reported as crowding");
  assert(layout.crowding[0].pointIds.length === 2,
    "collision: glyph crowding names both points");
}

// ------------------------------------------------- real charts from the engine
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Engine } from "caelus";
import { loadNodeData } from "caelus/node";

const require_ = createRequire(import.meta.url);
const DATA = join(dirname(require_.resolve("caelus/package.json")), "data");
const eng = new Engine(loadNodeData(DATA, "embedded", "full"));

const GLYPHS_: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃",
  saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇", chiron: "⚷", true_node: "☊",
};
const MAX_ORB_: Record<string, number> = {
  conjunction: 8, sextile: 4, square: 7, trine: 7, opposition: 8,
};

/** The compatibility mapping a legacy-chart adapter performs, made explicit. */
function toInput(chart: {
  bodies: Record<string, { lon: number; retrograde?: boolean; signDeg?: number } | undefined>;
  angles: { asc: number; mc: number };
  cusps: number[];
  aspects: Array<{ a: string; b: string; aspect: string; orb: number }>;
}): WheelLayoutInput {
  const names = Object.keys(chart.bodies)
    .filter((b) => b !== "mean_node" && chart.bodies[b] !== undefined);
  const drawn = new Set(names);
  return {
    points: names.map((id) => {
      const p = chart.bodies[id]!;
      const signDeg = p.signDeg ?? mod(p.lon, 30);
      const deg = Math.floor(signDeg);
      const min = String(Math.floor(mod(signDeg, 1) * 60)).padStart(2, "0");
      return {
        id, lon: p.lon, glyph: GLYPHS_[id] ?? id.slice(0, 2).toUpperCase(),
        label: `${deg}°${min}'${p.retrograde ? "℞" : ""}`,
      };
    }),
    aspects: chart.aspects
      .filter((a) => drawn.has(a.a) && drawn.has(a.b))
      .map((a) => ({
        a: a.a, b: a.b, family: a.aspect,
        tightness: Math.max(0, 1 - a.orb / (MAX_ORB_[a.aspect] ?? 8)),
      })),
    angles: chart.angles,
    cusps: chart.cusps,
  };
}

/** Adjacent display separations in circular display order. */
function displayGaps(layout: ReturnType<typeof layoutChartWheel>): number[] {
  const lons = layout.points.map((p) => mod(p.displayLon, 360)).sort((a, b) => a - b);
  return lons.map((lon, i) => mod(lons[(i + 1) % lons.length] - lon, 360));
}

const chicago1990 = eng.chart(1990, 7, 4, 16, 20, 0, 41.88, -87.63, "placidus");
const stellium1962 = eng.chart(1962, 2, 5, 0, 0, 0, 27.95, -82.46, "placidus");
const southern = eng.chart(1975, 3, 15, 12, 0, 0, -33.87, 151.21, "placidus");

for (const [label, chart] of [
  ["chicago 1990", chicago1990],
  ["stellium 1962", stellium1962],
  ["southern 1975", southern],
] as const) {
  const layout = layoutChartWheel(toInput(chart));
  assert(layout.points.length >= 11, `${label}: all display points laid out`);
  assert(layout.houses !== null && layout.axes !== null, `${label}: known-time chart complete`);
  assert(eachCoord(layout).every(rounded), `${label}: coordinates finite and rounded`);
  const ids = new Set(layout.points.map((p) => p.id));
  assert(layout.aspects.every((a) => ids.has(a.a) && ids.has(a.b)),
    `${label}: every chord references laid-out points`);
  const sep = Math.min(6.5, 360 / layout.points.length);
  assert(displayGaps(layout).every((g) => g >= sep - 1e-6),
    `${label}: adjacent display separations respect the minimum`);
  assert(layout.points.every((p) => Math.abs(mod(p.displayLon - p.trueLon + 180, 360) - 180) < 30),
    `${label}: no display point strays far from its true longitude`);
  assert(layout.crowding.every((r) => r.pointIds.length >= 2
    && r.pointIds.every((id) => ids.has(id))),
    `${label}: crowding entries, if any, are structured and reference real points`);
}

// determinism: byte-identical layouts for the same input
{
  const a = JSON.stringify(layoutChartWheel(toInput(stellium1962)));
  const b = JSON.stringify(layoutChartWheel(toInput(stellium1962)));
  assert(a === b, "determinism: identical input yields an identical layout");
}

// the 1962 stellium keeps zodiacal order after spreading
{
  const input = toInput(stellium1962);
  const layout = layoutChartWheel(input);
  const cluster = ["moon", "sun", "mercury", "venus", "jupiter"];
  const disp = new Map(layout.points.map((p) => [p.id, p.displayLon]));
  for (let i = 1; i < cluster.length; i++) {
    assert(mod(disp.get(cluster[i])! - disp.get(cluster[i - 1])!, 360) < 180,
      `stellium: ${cluster[i - 1]} stays before ${cluster[i]}`);
  }
}

// house systems: cusps differ, zodiac and points do not
{
  const wholeSign = eng.chart(1990, 7, 4, 16, 20, 0, 41.88, -87.63, "whole_sign");
  const a = layoutChartWheel(toInput(chicago1990));
  const b = layoutChartWheel(toInput(wholeSign));
  assert(JSON.stringify(a.zodiac) === JSON.stringify(b.zodiac),
    "house systems: zodiac ring independent of house system");
  assert(JSON.stringify(a.houses) !== JSON.stringify(b.houses),
    "house systems: placidus and whole-sign cusp geometry differ");
  assert(JSON.stringify(a.points.map((p) => [p.id, p.trueLon])) ===
    JSON.stringify(b.points.map((p) => [p.id, p.trueLon])),
    "house systems: point longitudes independent of house system");
}

// unknown time on a real chart: strip angles and cusps, anchor on Aries
{
  const { angles: _a, cusps: _c, ...rest } = toInput(chicago1990);
  const layout = layoutChartWheel(rest);
  assert(layout.houses === null && layout.axes === null
    && layout.applied.anchor === "aries0",
    "unknown time: real chart lays out point ring only");
  assert(eachCoord(layout).every(rounded), "unknown time: coordinates finite and rounded");
}

// the kernel must not depend on React anywhere in its compiled source
{
  const src = readFileSync(new URL("../src/layout.js", import.meta.url), "utf8");
  assert(!/["']react/.test(src), "purity: compiled layout module never imports react");
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
