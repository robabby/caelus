#!/usr/bin/env node
/**
 * caelus-mcp -- MCP server for the caelus ephemeris engine.
 *
 * Design (per 2026 MCP practice): one bounded context (chart computation),
 * a small curated tool surface (6 outcome-level tools, not API wrappers),
 * and token-frugal outputs (positions to 0.01 deg, terse keys, no prose --
 * the model does the interpreting, the server does the math).
 *
 * Transport: stdio (this file). The same buildServer() can be mounted on
 * Streamable HTTP for the hosted ephemengine.com deployment.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Engine, BODIES, Body, julianDay, mod } from "caelus";
import { loadNodeData } from "caelus/node";

const require = createRequire(import.meta.url);
const DATA_DIR = process.env.CAELUS_DATA
  ?? join(dirname(require.resolve("caelus/package.json")), "data");
const engine = new Engine(loadNodeData(DATA_DIR, "embedded", "full"));

// ---------------------------------------------------------------- helpers
const r2 = (x: number) => Math.round(x * 100) / 100;
const SIGNS = ["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"];
const fmt = (lon: number) => {
  const d = mod(lon, 30);
  return `${Math.floor(d)}°${String(Math.floor(mod(d, 1) * 60)).padStart(2, "0")}'${SIGNS[Math.floor(lon / 30)]}`;
};

const latSchema = z.number().min(-90).max(90).describe("Latitude, north positive");
const lonSchema = z.number().min(-180).max(180).describe("Longitude, EAST positive (Americas are negative)");
const birth = {
  date: z.string().describe("UTC date-time, ISO 8601, e.g. 1990-06-10T14:30:00Z. Convert local birth time to UTC first."),
  lat: latSchema,
  lon: lonSchema,
};
const houseSys = z.enum(["placidus", "whole_sign", "equal", "porphyry"]).default("placidus");

function jdFromIso(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return julianDay(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  );
}

function chartPayload(iso: string, lat: number, lon: number, hs: "placidus" | "whole_sign" | "equal" | "porphyry") {
  const d = new Date(iso);
  const c = engine.chart(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), lat, lon, hs,
  );
  const cusps = c.cusps;
  const houseOf = (bl: number) => {
    for (let i = 0; i < 12; i++) {
      const a = cusps[i];
      const b = cusps[(i + 1) % 12];
      if (mod(bl - a, 360) < mod(b - a, 360)) return i + 1;
    }
    return 12;
  };
  const bodies: Record<string, unknown> = {};
  for (const b of BODIES) {
    const p = c.bodies[b];
    bodies[b] = {
      lon: r2(p.lon), pos: fmt(p.lon), house: houseOf(p.lon),
      ...(p.retrograde ? { rx: true } : {}), speed: r2(p.speed),
    };
  }
  return {
    utc: iso, houses: c.houseSystem,
    ...(c.houseSystem !== hs ? { houses_requested: hs, houses_fallback_reason: "placidus undefined above polar circles" } : {}),
    bodies,
    angles: { asc: r2(c.angles.asc), ascPos: fmt(c.angles.asc), mc: r2(c.angles.mc), mcPos: fmt(c.angles.mc) },
    cusps: cusps.map(r2),
    aspects: c.aspects.map((a) => `${a.a} ${a.aspect} ${a.b} (${a.orb}°)`),
  };
}

const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj) }] });

// ---------------------------------------------------------------- output schemas
// Exported so the integration test validates responses against the same shape
// the server promises. Kept permissive on optional keys (rx, fallback fields).
const bodyOut = z.object({
  lon: z.number(), pos: z.string(), house: z.number().int().min(1).max(12),
  speed: z.number(), rx: z.boolean().optional(),
});
export const chartOut = z.object({
  utc: z.string(),
  houses: z.enum(["placidus", "whole_sign", "equal", "porphyry"]),
  houses_requested: z.enum(["placidus", "whole_sign", "equal", "porphyry"]).optional(),
  houses_fallback_reason: z.string().optional(),
  bodies: z.record(z.string(), bodyOut),
  angles: z.object({ asc: z.number(), ascPos: z.string(), mc: z.number(), mcPos: z.string() }),
  cusps: z.array(z.number()).length(12),
  aspects: z.array(z.string()),
});
export const transitsOut = z.object({
  transit_utc: z.string(),
  transiting: z.record(z.string(), z.object({
    pos: z.string(), natal_house: z.number().int().min(1).max(12), rx: z.boolean().optional(),
  })),
  aspects_to_natal: z.array(z.string()),
});
export const synastryOut = z.object({
  a: chartOut, b: chartOut,
  inter_aspects: z.array(z.string()),
  a_planets_in_b_houses: z.record(z.string(), z.number().int().min(1).max(12)),
  b_planets_in_a_houses: z.record(z.string(), z.number().int().min(1).max(12)),
});
export const findAspectDatesOut = z.object({
  query: z.string(),
  hits: z.array(z.string()),
});
export const rectificationGridOut = z.object({
  date: z.string(),
  lat: z.number(), lon: z.number(),
  asc_sign_changes: z.array(z.string()),
  grid: z.array(z.object({ utc: z.string(), asc: z.string(), mc: z.string() })),
});
export const OUTPUT_SCHEMAS = {
  natal_chart: chartOut,
  current_sky: chartOut,
  transits: transitsOut,
  synastry: synastryOut,
  find_aspect_dates: findAspectDatesOut,
  rectification_grid: rectificationGridOut,
} as const;

// ---------------------------------------------------------------- server
export function buildServer(): McpServer {
  const server = new McpServer({ name: "caelus", version: "0.1.0" });

  server.registerTool("natal_chart", {
    description:
      "Natal chart: 13 bodies (sun–pluto, chiron, nodes) with sign, house, retrograde, speed; ASC/MC; cusps; major aspects with orbs. Vs Swiss Ephemeris (1900–2099): Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤2.5″ (series valid 1885–2099), Chiron ≤1″, nodes ≤1″.",
    inputSchema: { ...birth, house_system: houseSys },
  }, async ({ date, lat, lon, house_system }) =>
    text(chartPayload(date, lat, lon, house_system)));

  server.registerTool("current_sky", {
    description:
      "Sky at a date/time and location: positions, houses, retrogrades, aspects. Defaults to now.",
    inputSchema: {
      date: z.string().optional().describe("UTC ISO date-time; omit for now"),
      lat: latSchema.default(0), lon: lonSchema.default(0),
      house_system: houseSys,
    },
  }, async ({ date, lat, lon, house_system }) =>
    text(chartPayload(date ?? new Date().toISOString(), lat, lon, house_system)));

  server.registerTool("transits", {
    description:
      "Transiting planets vs natal chart: aspects within orb (applying/separating), natal house per transiting body.",
    inputSchema: {
      ...birth,
      transit_date: z.string().optional().describe("UTC ISO date-time of transit moment; omit for now"),
      orb: z.number().min(0.5).max(10).default(3).describe("Max orb in degrees"),
      house_system: houseSys,
    },
  }, async ({ date, lat, lon, transit_date, orb, house_system }) => {
    const natal = chartPayload(date, lat, lon, house_system);
    const tIso = transit_date ?? new Date().toISOString();
    const jdT = jdFromIso(tIso);
    const ASP: Array<[string, number]> = [["conj", 0], ["sext", 60], ["sq", 90], ["tri", 120], ["opp", 180]];
    const hits: string[] = [];
    const cusps = natal.cusps as number[];
    const houseOf = (bl: number) => {
      for (let i = 0; i < 12; i++) {
        if (mod(bl - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
      }
      return 12;
    };
    const transiting: Record<string, unknown> = {};
    for (const tb of BODIES) {
      const tp = engine.position(tb as Body, jdT);
      transiting[tb] = { pos: fmt(tp.lon), natal_house: houseOf(tp.lon), ...(tp.retrograde ? { rx: true } : {}) };
      for (const nb of BODIES) {
        const nLon = (natal.bodies as Record<string, { lon: number }>)[nb].lon;
        const sep = Math.abs(mod(tp.lon - nLon + 180, 360) - 180);
        for (const [name, angle] of ASP) {
          const o = Math.abs(sep - angle);
          if (o <= orb) {
            const future = Math.abs(mod(tp.lon + tp.speed * 0.5 - nLon + 180, 360) - 180);
            const applying = Math.abs(future - angle) < o;
            hits.push(`t.${tb} ${name} n.${nb} (${r2(o)}°${applying ? " applying" : " separating"})`);
          }
        }
      }
    }
    return text({ transit_utc: tIso, transiting, aspects_to_natal: hits });
  });

  server.registerTool("synastry", {
    description:
      "Two natal charts: inter-chart aspects with orbs, house overlays both ways.",
    inputSchema: {
      a: z.object(birth).describe("Person A birth data"),
      b: z.object(birth).describe("Person B birth data"),
      orb: z.number().min(0.5).max(10).default(4),
    },
  }, async ({ a, b, orb }) => {
    const ca = chartPayload(a.date, a.lat, a.lon, "placidus");
    const cb = chartPayload(b.date, b.lat, b.lon, "placidus");
    const ASP: Array<[string, number]> = [["conj", 0], ["sext", 60], ["sq", 90], ["tri", 120], ["opp", 180]];
    const inter: string[] = [];
    const houseIn = (cusps: number[], bl: number) => {
      for (let i = 0; i < 12; i++) {
        if (mod(bl - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
      }
      return 12;
    };
    const aInB: Record<string, number> = {};
    const bInA: Record<string, number> = {};
    for (const ba of BODIES) {
      const la = (ca.bodies as Record<string, { lon: number }>)[ba].lon;
      aInB[ba] = houseIn(cb.cusps as number[], la);
      const lb = (cb.bodies as Record<string, { lon: number }>)[ba].lon;
      bInA[ba] = houseIn(ca.cusps as number[], lb);
    }
    for (const ba of BODIES) {
      for (const bb of BODIES) {
        const la = (ca.bodies as Record<string, { lon: number }>)[ba].lon;
        const lb = (cb.bodies as Record<string, { lon: number }>)[bb].lon;
        const sep = Math.abs(mod(la - lb + 180, 360) - 180);
        for (const [name, angle] of ASP) {
          const o = Math.abs(sep - angle);
          if (o <= orb) inter.push(`A.${ba} ${name} B.${bb} (${r2(o)}°)`);
        }
      }
    }
    return text({
      a: ca, b: cb, inter_aspects: inter,
      a_planets_in_b_houses: aInB, b_planets_in_a_houses: bInA,
    });
  });

  server.registerTool("find_aspect_dates", {
    description:
      "Exact aspect dates in a range: transiting body to fixed longitude or another body. Includes retrograde re-hits.",
    inputSchema: {
      body: z.enum(BODIES as unknown as [string, ...string[]]),
      aspect: z.enum(["conjunction", "sextile", "square", "trine", "opposition"]),
      target_lon: z.number().min(0).max(360).optional().describe("Fixed natal longitude in degrees"),
      target_body: z.enum(BODIES as unknown as [string, ...string[]]).optional().describe("Or: another transiting body"),
      start: z.string().describe("UTC ISO start date"),
      end: z.string().describe("UTC ISO end date (range <= 50 years)"),
    },
  }, async ({ body, aspect, target_lon, target_body, start, end }) => {
    const angle = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 }[aspect];
    const jd0 = jdFromIso(start);
    const jd1 = jdFromIso(end);
    if (jd1 - jd0 > 50 * 366) throw new Error("Range too large (max 50 years)");
    if (target_lon === undefined && target_body === undefined) {
      throw new Error("Provide target_lon or target_body");
    }
    // A non-axial aspect (sextile/square/trine) is exact at BOTH +angle and
    // -angle separation; conjunction/opposition have a single geometry.
    const offsets = angle === 0 || angle === 180 ? [angle] : [angle, -angle];
    const mkF = (off: number) => (jd: number) => {
      const tl = target_body !== undefined
        ? engine.longitude(target_body as Body, jd)
        : (target_lon as number);
      return mod(engine.longitude(body as Body, jd) - tl - off + 180, 360) - 180;
    };
    const hitsJd: number[] = [];
    const step = 1.0;
    for (const off of offsets) {
      const f = mkF(off);
      let prev = f(jd0);
      for (let jd = jd0 + step; jd <= jd1 && hitsJd.length < 120; jd += step) {
        const cur = f(jd);
        if (prev * cur < 0 && Math.abs(cur - prev) < 180) {
          let a = jd - step;
          let bj = jd;
          for (let i = 0; i < 40; i++) {  // bisection to ~1 minute
            const m = (a + bj) / 2;
            if (f(a) * f(m) <= 0) bj = m; else a = m;
          }
          hitsJd.push((a + bj) / 2);
        }
        prev = cur;
      }
    }
    hitsJd.sort((x, y) => x - y);
    const hits = hitsJd.slice(0, 60).map(
      (t) => new Date((t - 2440587.5) * 86400000).toISOString().slice(0, 16) + "Z",
    );
    return text({ query: `${body} ${aspect} ${target_body ?? target_lon}`, hits });
  });

  server.registerTool("rectification_grid", {
    description:
      "Rectification sweep: ASC/MC at each step across a day or time window. Includes ASC sign-change times.",
    inputSchema: {
      date: z.string().describe("Birth DATE (UTC) as ISO, time portion ignored"),
      lat: latSchema, lon: lonSchema,
      window_start_hour: z.number().min(0).max(24).default(0),
      window_end_hour: z.number().min(0).max(24).default(24),
      step_minutes: z.number().min(5).max(120).default(20),
    },
  }, async ({ date, lat, lon, window_start_hour, window_end_hour, step_minutes }) => {
    const d = new Date(date);
    const grid: Array<{ utc: string; asc: string; mc: string }> = [];
    const boundaries: string[] = [];
    let lastAscSign = -1;
    for (let m = window_start_hour * 60; m <= window_end_hour * 60; m += step_minutes) {
      const iso = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, m, 0,
      )).toISOString();
      const c = chartPayload(iso, lat, lon, "whole_sign");
      const ascLon = (c.angles as { asc: number }).asc;
      const ascSign = Math.floor(ascLon / 30);
      if (lastAscSign >= 0 && ascSign !== lastAscSign) {
        boundaries.push(`Asc enters ${SIGNS[ascSign]} ~${iso.slice(11, 16)} UTC`);
      }
      lastAscSign = ascSign;
      grid.push({
        utc: iso.slice(11, 16),
        asc: (c.angles as { ascPos: string }).ascPos,
        mc: (c.angles as { mcPos: string }).mcPos,
      });
    }
    return text({ date: date.slice(0, 10), lat, lon, asc_sign_changes: boundaries, grid });
  });

  return server;
}

// ---------------------------------------------------------------- main
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("caelus-mcp listening on stdio");
}
