/**
 * MCP integration test: spawns the real server over stdio and asserts, for
 * every call, that (1) the response validates against the exported output
 * schema in server.ts and (2) canonical inputs deep-equal the committed
 * golden payloads. Adds an edge-case matrix (polar, historical, southern,
 * equator, default-time paths) and an invalid-input matrix (out-of-range
 * lat/lon, bad ISO, >50yr range, missing target) that must return isError.
 *
 * Complements verify_tools.mjs: that suite checks MCP-vs-engine *values*
 * against the in-process oracle; this suite checks payload *shape* and frozen
 * *format* so the two drift sources are independently gated.
 *
 * Emits {suite, checks, failures} to CAELUS_STATS_OUT when set.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { OUTPUT_SCHEMAS } from "./dist/src/server.js";
import { GOLDEN_CASES } from "../../scripts/export-mcp-golden.mjs";

let checks = 0;
let failures = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error(`FAIL ${msg}`); }
}

const goldenPath = fileURLToPath(new URL("./test/golden-mcp.json", import.meta.url));
const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

const serverPath = fileURLToPath(new URL("./dist/src/server.js", import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "integration", version: "0.0.1" });
await client.connect(transport);

const raw = async (name, args) => client.callTool({ name, arguments: args });
const call = async (name, args) => {
  const res = await raw(name, args);
  if (res.isError) throw new Error(`${name}: ${res.content[0].text}`);
  return JSON.parse(res.content[0].text);
};

// --------------------------------------------------------- schema validation
// Every golden case: response must validate against the tool's output schema.
for (const c of GOLDEN_CASES) {
  const payload = await call(c.tool, c.args);
  const schema = OUTPUT_SCHEMAS[c.tool];
  const parsed = schema.safeParse(payload);
  assert(parsed.success, `schema ${c.id} (${c.tool}): ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
}

// --------------------------------------------------------- frozen golden format
// Same inputs must deep-equal the committed payloads (catches key renames,
// rounding changes, fallback-string drift the engine oracle can't see).
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const c of GOLDEN_CASES) {
  const payload = await call(c.tool, c.args);
  assert(deepEq(payload, golden[c.id].payload), `golden format ${c.id} (${c.tool})`);
}

// --------------------------------------------------------- edge-case behavior
{
  // Polar: Placidus falls back to whole_sign with a reported reason.
  const p = await call("natal_chart", { date: "1985-12-01T09:00:00Z", lat: 78.2, lon: 15.6 });
  assert(p.houses === "whole_sign", "polar: houses == whole_sign");
  assert(p.houses_requested === "placidus", "polar: houses_requested == placidus");
  assert(typeof p.houses_fallback_reason === "string", "polar: fallback reason present");

  // Non-polar: no fallback fields.
  const np = await call("natal_chart", { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 });
  assert(np.houses_requested === undefined, "non-polar: no houses_requested");
  assert(np.houses_fallback_reason === undefined, "non-polar: no fallback reason");

  // Historical (1855): within engine range, full valid payload.
  const hist = await call("natal_chart", { date: "1855-07-04T12:00:00Z", lat: 48.85, lon: 2.35 });
  assert(Object.keys(hist.bodies).length === 13, "historical 1855: 13 bodies");
  assert(hist.cusps.length === 12, "historical 1855: 12 cusps");

  // Southern hemisphere sanity.
  const south = await call("natal_chart", { date: "1995-09-15T03:20:00Z", lat: -33.87, lon: 151.21 });
  assert(south.houses === "placidus", "southern: placidus computed");

  // Equator (lat 0) sanity.
  const eq = await call("current_sky", { date: "2010-03-20T17:32:00Z", lat: 0, lon: -78.45, house_system: "whole_sign" });
  assert(eq.houses === "whole_sign", "equator: whole_sign computed");

  // Default-time paths: current_sky / transits with omitted date must compute.
  const skyNow = await call("current_sky", { lat: 51.48, lon: 0 });
  assert(typeof skyNow.utc === "string", "current_sky default-now: utc present");
  const transNow = await call("transits", { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 });
  assert(Array.isArray(transNow.aspects_to_natal), "transits default-now: aspect list present");

  // current_sky with no lat/lon defaults to geocentric 0,0 (documented footgun, still computes).
  const skyDefault = await call("current_sky", { date: "2000-01-01T12:00:00Z" });
  assert(typeof skyDefault.utc === "string", "current_sky default-loc: computes at 0,0");
}

// --------------------------------------------------------- invalid input matrix
// These must surface as isError at the MCP boundary, never silently compute.
{
  const badLat = await raw("current_sky", { date: "2000-01-01T12:00:00Z", lat: 999, lon: 0 });
  assert(badLat.isError === true, "guard: current_sky lat 999 rejected");

  const badLatNatal = await raw("natal_chart", { date: "2000-01-01T12:00:00Z", lat: 999, lon: 0 });
  assert(badLatNatal.isError === true, "guard: natal_chart lat 999 rejected");

  const badLon = await raw("natal_chart", { date: "2000-01-01T12:00:00Z", lat: 0, lon: 400 });
  assert(badLon.isError === true, "guard: natal_chart lon 400 rejected");

  const badLatGrid = await raw("rectification_grid", { date: "1990-06-10T00:00:00Z", lat: 200, lon: 0 });
  assert(badLatGrid.isError === true, "guard: rectification_grid lat 200 rejected");

  const badDate = await raw("natal_chart", { date: "not-a-date", lat: 27.95, lon: -82.46 });
  assert(badDate.isError === true, "guard: invalid ISO rejected");

  const hugeRange = await raw("find_aspect_dates", {
    body: "saturn", aspect: "conjunction", target_lon: 100,
    start: "1900-01-01T00:00:00Z", end: "2000-01-01T00:00:00Z",
  });
  assert(hugeRange.isError === true, "guard: >50yr range rejected");

  const noTarget = await raw("find_aspect_dates", {
    body: "saturn", aspect: "conjunction",
    start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z",
  });
  assert(noTarget.isError === true, "guard: find_aspect_dates missing target rejected");
}

await client.close();
console.log(`\n${checks} checks, ${failures} failures`);

if (process.env.CAELUS_STATS_OUT) {
  writeFileSync(process.env.CAELUS_STATS_OUT, JSON.stringify({
    suite: "mcp-integration",
    checks,
    failures,
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

process.exit(failures ? 1 : 0);
