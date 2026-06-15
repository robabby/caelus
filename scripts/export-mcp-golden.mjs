/**
 * Mint committed MCP golden payloads. Spawns the real server over stdio, calls
 * each tool with a fixed canonical input set, and records the exact payload to
 * packages/caelus-mcp/test/golden-mcp.json. The integration test re-runs these
 * calls and deep-equals the result, catching payload-FORMAT drift (key renames,
 * rounding changes, the houses_fallback_reason string) that the engine-oracle
 * checks in verify_tools.mjs cannot see.
 *
 * Regenerate deliberately, like the engine goldens:
 *   npm run build -w caelus && npm run build -w caelus-mcp
 *   node scripts/export-mcp-golden.mjs
 * Review the diff before committing.
 *
 * Time-dependent tools (current_sky/transits defaulting to now) are always
 * called with an explicit date so the golden is reproducible.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

export const GOLDEN_CASES = [
  // --- happy path, one per tool ---
  { id: "natal-tampa", tool: "natal_chart",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },
  { id: "sky-events-week", tool: "sky_events",
    args: { start: "1990-06-10T00:00:00Z", end: "1990-06-17T00:00:00Z",
      kinds: ["rise", "set", "phase"], body: "sun", lat: 27.95, lon: -82.46 } },
  { id: "sky-events-station-crossing", tool: "sky_events",
    args: { start: "1990-06-10T00:00:00Z", end: "1990-12-10T00:00:00Z",
      kinds: ["station", "crossing"], body: "mercury", target_lon: 123.45 } },
  { id: "sky-events-eclipses", tool: "sky_events",
    args: { start: "2026-01-01T00:00:00Z", end: "2026-12-31T00:00:00Z",
      kinds: ["solar_eclipse", "lunar_eclipse"] } },
  { id: "natal-sidereal-koch", tool: "natal_chart",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46,
      house_system: "koch", zodiac: "sidereal:lahiri" } },
  { id: "current-sky-j2000", tool: "current_sky",
    args: { date: "2000-01-01T12:00:00Z", lat: 51.48, lon: 0 } },
  { id: "transits-2026", tool: "transits",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, transit_date: "2026-06-12T00:00:00Z" } },
  { id: "synastry-pair", tool: "synastry",
    args: { a: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 },
            b: { date: "1988-03-21T06:00:00Z", lat: 40.71, lon: -74.01 } } },
  { id: "find-saturn-sq-moon", tool: "find_aspect_dates",
    args: { body: "saturn", aspect: "square", target_lon: 283.28,
            start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" } },
  { id: "rectification-tampa", tool: "rectification_grid",
    args: { date: "1990-06-10T00:00:00Z", lat: 27.95, lon: -82.46, step_minutes: 20 } },
  { id: "patterns-tampa", tool: "aspect_patterns",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },

  // --- edge cases (format must stay stable across these too) ---
  { id: "natal-polar-svalbard", tool: "natal_chart",
    args: { date: "1985-12-01T09:00:00Z", lat: 78.2, lon: 15.6 } },
  { id: "natal-historical-1855", tool: "natal_chart",
    args: { date: "1855-07-04T12:00:00Z", lat: 48.85, lon: 2.35 } },
  { id: "natal-southern", tool: "natal_chart",
    args: { date: "1995-09-15T03:20:00Z", lat: -33.87, lon: 151.21 } },
  { id: "natal-equator", tool: "natal_chart",
    args: { date: "2010-03-20T17:32:00Z", lat: 0, lon: -78.45, house_system: "whole_sign" } },
  { id: "find-mars-conj-jupiter", tool: "find_aspect_dates",
    args: { body: "mars", aspect: "conjunction", target_body: "jupiter",
            start: "2020-01-01T00:00:00Z", end: "2024-01-01T00:00:00Z" } },

  // --- derived-chart harvest (returns, progressions, composite, dignities) ---
  { id: "solar-return-2025", tool: "returns",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, body: "sun",
            search_start: "2025-01-01T00:00:00Z", search_end: "2026-01-01T00:00:00Z" } },
  { id: "progressions-2025", tool: "progressions",
    args: { date: "1990-06-10T14:30:00Z", target_date: "2025-06-10T00:00:00Z" } },
  { id: "composite-pair", tool: "composite",
    args: { a: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 },
            b: { date: "1988-03-21T06:00:00Z", lat: 40.71, lon: -74.01 } } },
  { id: "dignities-tampa", tool: "dignities",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },

  // --- Hellenistic time-lords harvest (Phase 1) ---
  { id: "lots-tampa", tool: "lots",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },
  { id: "profections-2026", tool: "profections",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, target_date: "2026-06-10T00:00:00Z" } },
  { id: "firdaria-2026", tool: "firdaria",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, target_date: "2026-06-10T00:00:00Z" } },
  { id: "releasing-spirit-2026", tool: "releasing",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, target_date: "2026-06-10T00:00:00Z", max_level: 2, horizon_years: 40 } },
  { id: "directions-naibod", tool: "directions",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, key: "naibod", max_years: 90 } },
  { id: "directions-mundane", tool: "directions",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, key: "naibod", max_years: 60, include_mundane: true } },

  // --- Vedic / Jyotish harvest (Phase 2) ---
  { id: "nakshatras-tampa", tool: "nakshatras",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },
  { id: "dasha-vimshottari-2026", tool: "dasha",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, system: "vimshottari", target_date: "2026-06-10T00:00:00Z" } },
  { id: "dasha-yogini-2026", tool: "dasha",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, system: "yogini", target_date: "2026-06-10T00:00:00Z" } },
  { id: "dasha-ashtottari-2026", tool: "dasha",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46, system: "ashtottari", target_date: "2026-06-10T00:00:00Z" } },
  { id: "vargas-tampa", tool: "vargas",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },
  { id: "yogas-tampa", tool: "yogas",
    args: { date: "1990-06-10T14:30:00Z", lat: 27.95, lon: -82.46 } },
];

async function run() {
  const serverPath = fileURLToPath(new URL("../packages/caelus-mcp/dist/src/server.js", import.meta.url));
  const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
  const client = new Client({ name: "mint", version: "0.0.1" });
  await client.connect(transport);

  const out = {};
  for (const c of GOLDEN_CASES) {
    const res = await client.callTool({ name: c.tool, arguments: c.args });
    if (res.isError) throw new Error(`${c.id}: server returned error: ${res.content[0].text}`);
    out[c.id] = { tool: c.tool, args: c.args, payload: JSON.parse(res.content[0].text) };
  }
  await client.close();
  return out;
}

// When run directly, write the golden file. When imported, expose GOLDEN_CASES.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = await run();
  const path = fileURLToPath(new URL("../packages/caelus-mcp/test/golden-mcp.json", import.meta.url));
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${Object.keys(out).length} golden payloads to ${path}`);
}
