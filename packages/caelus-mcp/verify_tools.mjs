/**
 * MCP-layer oracle suite: one section per tool, asserted against the engine
 * imported in-process. The golden conformance suite cannot see server.ts;
 * this suite exists to catch wiring bugs in the MCP layer (wrong body loop,
 * stale natal data, orb misuse, missed retrograde re-hits, silent fallbacks).
 *
 * Grown from verify_aspects.mjs (PATCHES.md finding #2).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import {
  Engine, BODIES, julianDay, mod, aspectPhase, solarPhase, ASPECTS,
  solarReturn, progressedLongitude, directedLongitude, solarArc,
  compositeLongitudes, davisonParams, dignityOf, isDayChart, planetarySect, inSect,
} from "caelus";
import { loadNodeData } from "caelus/node";

const require = createRequire(import.meta.url);
const DATA_DIR = join(dirname(require.resolve("caelus/package.json")), "data");
const eng = new Engine(loadNodeData(DATA_DIR, "embedded", "full"));

let checks = 0;
let failures = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}
const r2 = (x) => Math.round(x * 100) / 100;
const jdFromIso = (iso) => {
  const d = new Date(iso);
  return julianDay(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  );
};
const houseFromCusps = (cusps, lon) => {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
};

const serverPath = fileURLToPath(new URL("./dist/src/server.js", import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "verify", version: "0.0.1" });
await client.connect(transport);
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`${name}: ${res.content[0].text}`);
  return JSON.parse(res.content[0].text);
};

// ---------------------------------------------------------------- natal_chart
{
  const iso = "1990-06-10T14:30:00Z";
  const c = await call("natal_chart", { date: iso, lat: 27.95, lon: -82.46 });
  const g = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");

  assert(c.houses === "placidus", "natal_chart: house system");
  assert(c.houses_requested === undefined, "natal_chart: no fallback fields at non-polar latitude");
  assert(Math.abs(c.angles.asc - r2(g.angles.asc)) < 1e-9, `natal_chart: asc ${c.angles.asc} vs ${g.angles.asc}`);
  assert(Math.abs(c.angles.mc - r2(g.angles.mc)) < 1e-9, `natal_chart: mc ${c.angles.mc} vs ${g.angles.mc}`);
  for (let i = 0; i < 12; i++) {
    assert(Math.abs(c.cusps[i] - r2(g.cusps[i])) < 1e-9, `natal_chart: cusp ${i + 1}`);
  }
  for (const b of BODIES) {
    const p = g.bodies[b];
    assert(Math.abs(c.bodies[b].lon - r2(p.lon)) < 1e-9, `natal_chart: ${b} lon ${c.bodies[b].lon} vs ${p.lon}`);
    assert(Math.abs(c.bodies[b].speed - r2(p.speed)) < 1e-9, `natal_chart: ${b} speed`);
    assert((c.bodies[b].rx === true) === p.retrograde, `natal_chart: ${b} retrograde flag`);
    assert(c.bodies[b].house === houseFromCusps(g.cusps, p.lon), `natal_chart: ${b} house`);
  }
  // Aspect core fields ({a,b,aspect,orb}) still pass the engine objects through
  // unchanged; the MCP layer adds an applying/separating phase on top.
  const coreOnly = c.aspects.map(({ phase, ...rest }) => rest);
  assert(JSON.stringify(coreOnly) === JSON.stringify(g.aspects),
    "natal_chart: aspect core fields pass the engine Aspect objects through unchanged");
  const jd = jdFromIso(iso);
  for (const a of c.aspects) {
    const expected = aspectPhase(
      g.bodies[a.a].lon, g.bodies[a.a].speed,
      g.bodies[a.b].lon, g.bodies[a.b].speed, ASPECTS[a.aspect]);
    assert(a.phase === expected, `natal_chart: aspect ${a.a} ${a.aspect} ${a.b} phase ${a.phase} vs ${expected}`);
  }
  // Solar phase per body matches the engine primitive (omitted when far from Sun).
  for (const b of BODIES) {
    const expected = solarPhase(eng, b, jd);
    assert((c.bodies[b].solar ?? null) === expected, `natal_chart: ${b} solar phase ${c.bodies[b].solar ?? null} vs ${expected}`);
  }
}

// polar Placidus fallback must be reported, never silent
{
  const c = await call("natal_chart", { date: "1985-12-01T09:00:00Z", lat: 78.2, lon: 15.6 });
  assert(c.houses === "whole_sign", `natal_chart polar: fell back to ${c.houses}`);
  assert(c.houses_requested === "placidus", "natal_chart polar: reports requested system");
  assert(typeof c.houses_fallback_reason === "string", "natal_chart polar: reports fallback reason");
}

// ---------------------------------------------------------------- current_sky
{
  const args = { date: "2026-03-20T14:46:00Z", lat: 51.5, lon: -0.12 };
  const sky = await call("current_sky", args);
  const natal = await call("natal_chart", { ...args });
  assert(JSON.stringify(sky) === JSON.stringify(natal),
    "current_sky: identical payload to natal_chart for the same instant");
}

// ---------------------------------------------------------------- transits
{
  const orb = 3;
  const natalArgs = { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 };
  const tIso = "2026-06-01T00:00:00Z";
  const t = await call("transits", { ...natalArgs, transit_date: tIso, orb });
  const natal = await call("natal_chart", natalArgs);
  const jdT = jdFromIso(tIso);
  const ASP = [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]];

  // oracle: rebuild the expected hit set from engine positions + the natal payload
  const expected = new Set();
  for (const tb of BODIES) {
    const tp = eng.position(tb, jdT);
    assert(t.transiting[tb].natal_house === houseFromCusps(natal.cusps, tp.lon),
      `transits: ${tb} natal house`);
    assert((t.transiting[tb].rx === true) === tp.retrograde, `transits: ${tb} rx flag`);
    for (const nb of BODIES) {
      const sep = Math.abs(mod(tp.lon - natal.bodies[nb].lon + 180, 360) - 180);
      for (const [name, angle] of ASP) {
        if (Math.abs(sep - angle) <= orb) expected.add(`t.${tb} ${name} n.${nb}`);
      }
    }
  }
  const got = new Set(t.aspects_to_natal.map((h) => `t.${h.t} ${h.aspect} n.${h.n}`));
  assert(got.size === expected.size && [...expected].every((e) => got.has(e)),
    `transits: aspect set ${got.size} vs oracle ${expected.size}`);
  for (const h of t.aspects_to_natal) {
    assert(typeof h.orb === "number" && h.orb >= 0 && h.orb <= orb
      && typeof h.applying === "boolean",
      `transits: hit shape ${JSON.stringify(h)}`);
  }
}

// ---------------------------------------------------------------- synastry
{
  const a = { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 };
  const b = { date: "1987-11-02T06:15:00Z", lat: 40.71, lon: -74.0 };
  const orb = 4;
  const s = await call("synastry", { a, b, orb });
  const ASP = [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]];

  const expected = [];
  for (const ba of BODIES) {
    assert(s.a_planets_in_b_houses[ba] === houseFromCusps(s.b.cusps, s.a.bodies[ba].lon),
      `synastry: A.${ba} house in B`);
    assert(s.b_planets_in_a_houses[ba] === houseFromCusps(s.a.cusps, s.b.bodies[ba].lon),
      `synastry: B.${ba} house in A`);
    for (const bb of BODIES) {
      const sep = Math.abs(mod(s.a.bodies[ba].lon - s.b.bodies[bb].lon + 180, 360) - 180);
      for (const [name, angle] of ASP) {
        if (Math.abs(sep - angle) <= orb) expected.push(`A.${ba} ${name} B.${bb}`);
      }
    }
  }
  const got = s.inter_aspects.map((x) => `A.${x.a} ${x.aspect} B.${x.b}`);
  assert(got.length === expected.length && expected.every((e) => got.includes(e)),
    `synastry: inter-aspect set ${got.length} vs oracle ${expected.length}`);
}

// ---------------------------------------------------------------- find_aspect_dates
const assertExactHits = (hits, body, targetLonAt, angle, label, tolDeg = 0.02) => {
  for (const iso of hits) {
    const jd = jdFromIso(iso);
    const sep = Math.abs(mod(eng.longitude(body, jd) - targetLonAt(jd) + 180, 360) - 180);
    assert(Math.abs(sep - angle) < tolDeg, `${label}: hit ${iso} off by ${(sep - angle).toFixed(4)}°`);
  }
  const jds = hits.map(jdFromIso);
  assert(jds.every((v, i) => i === 0 || v > jds[i - 1]), `${label}: hits sorted`);
};

// fixed target through a Mars retrograde loop: must root-find BOTH offsets
// and report retrograde re-hits (3 crossings, not 1)
{
  // locate the Mars retrograde loop nearest 2027 and aim at its midpoint
  let jd = jdFromIso("2026-06-01T00:00:00Z");
  while (eng.position("mars", jd).speed > 0) jd += 1;
  const jd0 = jd;
  while (eng.position("mars", jd).speed < 0) jd += 1;
  const midLon = eng.longitude("mars", (jd0 + jd) / 2);

  const res = await call("find_aspect_dates", {
    body: "mars", aspect: "conjunction", target_lon: midLon,
    start: "2026-06-01T00:00:00Z", end: "2028-06-01T00:00:00Z",
  });
  assert(res.hits.length === 3, `find_aspect_dates: mars retro conj expected 3 hits, got ${res.hits.length}`);
  assertExactHits(res.hits, "mars", () => midLon, 0, "find_aspect_dates mars conj");
}

// non-axial aspect: exact at +60 AND -60 (both geometries must appear)
{
  const target = 283.283;
  const res = await call("find_aspect_dates", {
    body: "sun", aspect: "sextile", target_lon: target,
    start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z",
  });
  assert(res.hits.length === 2, `find_aspect_dates: sun sextile expected 2 hits/yr, got ${res.hits.length}`);
  assertExactHits(res.hits, "sun", () => target, 60, "find_aspect_dates sun sextile");
  const signs = new Set(res.hits.map((iso) =>
    Math.sign(mod(eng.longitude("sun", jdFromIso(iso)) - target + 180, 360) - 180)));
  assert(signs.has(1) && signs.has(-1), "find_aspect_dates: both ±60° geometries found");
}

// body-to-body: new moons, ~29.5 days apart
{
  const res = await call("find_aspect_dates", {
    body: "moon", aspect: "conjunction", target_body: "sun",
    start: "2026-01-01T00:00:00Z", end: "2026-04-01T00:00:00Z",
  });
  assert(res.hits.length === 3, `find_aspect_dates: expected 3 new moons in Q1, got ${res.hits.length}`);
  assertExactHits(res.hits, "moon", (jd) => eng.longitude("sun", jd), 0, "find_aspect_dates new moons");
}

// contract errors must be errors, not empty results
{
  const tooBig = await client.callTool({ name: "find_aspect_dates", arguments: {
    body: "pluto", aspect: "conjunction", target_lon: 0,
    start: "1900-01-01T00:00:00Z", end: "2099-01-01T00:00:00Z" } });
  assert(tooBig.isError === true, "find_aspect_dates: >50yr range rejected");
  const noTarget = await client.callTool({ name: "find_aspect_dates", arguments: {
    body: "mars", aspect: "square",
    start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" } });
  assert(noTarget.isError === true, "find_aspect_dates: missing target rejected");
}

// ---------------------------------------------------------------- rectification_grid
{
  const res = await call("rectification_grid", {
    date: "1990-06-10T00:00:00Z", lat: 27.95, lon: -82.46, step_minutes: 20,
  });
  assert(res.grid.length === 73, `rectification_grid: 73 rows for 24h/20min, got ${res.grid.length}`);
  // ASC sweeps the full zodiac in ~24h: every sign boundary must be reported
  assert(res.asc_sign_changes.length >= 11 && res.asc_sign_changes.length <= 13,
    `rectification_grid: ${res.asc_sign_changes.length} sign changes (expected ~12)`);
  // cross-check a grid row against current_sky at the same instant
  const row = res.grid[36]; // 12:00
  const sky = await call("current_sky", {
    date: `1990-06-10T${row.utc}:00Z`, lat: 27.95, lon: -82.46, house_system: "whole_sign",
  });
  assert(row.asc === sky.angles.ascPos && row.mc === sky.angles.mcPos,
    `rectification_grid: row ${row.utc} matches current_sky (${row.asc}/${row.mc} vs ${sky.angles.ascPos}/${sky.angles.mcPos})`);
}

// ---------------------------------------------------------------- returns
{
  const natal = { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 };
  const res = await call("returns", {
    ...natal, body: "sun",
    search_start: "2025-01-01T00:00:00Z", search_end: "2026-01-01T00:00:00Z",
  });
  const natalJd = jdFromIso(natal.date);
  const expected = solarReturn(eng, natalJd, jdFromIso("2025-01-01T00:00:00Z"), jdFromIso("2026-01-01T00:00:00Z"));
  assert(res.returns.length === expected.length, `returns: count ${res.returns.length} vs ${expected.length}`);
  // defining property: the Sun is back at its natal longitude at each return instant
  const natalSun = eng.longitude("sun", natalJd);
  for (const iso of res.returns) {
    const d = Math.abs(mod(eng.longitude("sun", jdFromIso(iso)) - natalSun + 180, 360) - 180);
    assert(d < 0.01, `returns: sun back to natal lon at ${iso} (off ${d.toFixed(4)}°)`);
  }
  assert(res.return_lat === natal.lat && res.return_lon === natal.lon, "returns: return place defaults to birthplace");
  // the return chart is a real chart at that instant+place: identical to current_sky there
  const sky = await call("current_sky", { date: res.returns[0], lat: res.return_lat, lon: res.return_lon });
  assert(JSON.stringify(res.chart) === JSON.stringify(sky), "returns: chart matches current_sky at the return instant");
}

// ---------------------------------------------------------------- progressions
{
  const res = await call("progressions", { date: "1990-06-10T14:30:00Z", target_date: "2025-06-10T00:00:00Z" });
  const natalJd = jdFromIso("1990-06-10T14:30:00Z");
  const targetJd = jdFromIso("2025-06-10T00:00:00Z");
  assert(Math.abs(res.solar_arc - r2(solarArc(eng, natalJd, targetJd))) < 1e-9, "progressions: solar arc");
  for (const b of BODIES) {
    assert(Math.abs(res.bodies[b].secondary - r2(progressedLongitude(eng, b, natalJd, targetJd))) < 1e-9,
      `progressions: ${b} secondary`);
    assert(Math.abs(res.bodies[b].directed - r2(directedLongitude(eng, b, natalJd, targetJd))) < 1e-9,
      `progressions: ${b} directed`);
  }
}

// ---------------------------------------------------------------- composite
{
  const a = { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 };
  const b = { date: "1988-03-21T06:00:00Z", lat: 40.71, lon: -74.01 };
  const res = await call("composite", { a, b });
  const jdA = jdFromIso(a.date);
  const jdB = jdFromIso(b.date);
  const comp = compositeLongitudes(eng, jdA, jdB, BODIES);
  for (const body of BODIES) {
    assert(Math.abs(res.composite.bodies[body].lon - r2(comp[body])) < 1e-9, `composite: ${body} midpoint`);
  }
  // davison: a real chart at the temporal+geographic midpoint; equals current_sky there
  const [, midLat, midLon] = davisonParams(jdA, jdB, a.lat, a.lon, b.lat, b.lon);
  const sky = await call("current_sky", { date: res.davison.utc, lat: midLat, lon: midLon });
  assert(JSON.stringify(res.davison) === JSON.stringify(sky), "composite: davison matches current_sky at the midpoint");
}

// ---------------------------------------------------------------- dignities
{
  const args = { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 };
  const res = await call("dignities", args);
  const jd = jdFromIso(args.date);
  const day = isDayChart(eng, jd, args.lat, args.lon);
  assert(res.sect === (day ? "day" : "night"), "dignities: chart sect");
  for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) {
    assert(JSON.stringify(res.bodies[b].dignity) === JSON.stringify(dignityOf(eng, b, jd)), `dignities: ${b} dignity`);
    assert(res.bodies[b].planetary_sect === planetarySect(b), `dignities: ${b} planetary sect`);
    assert(res.bodies[b].in_sect === inSect(b, day), `dignities: ${b} in sect`);
  }
}

await client.close();
console.log(`\n${checks} checks, ${failures} failures`);

if (process.env.CAELUS_STATS_OUT) {
  writeFileSync(process.env.CAELUS_STATS_OUT, JSON.stringify({
    suite: "mcp",
    checks,
    failures,
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

process.exit(failures ? 1 : 0);
