#!/usr/bin/env node
/**
 * caelus-mcp -- MCP server for the caelus ephemeris engine.
 *
 * Design (per 2026 MCP practice): one bounded context (chart computation),
 * a small curated tool surface (9 outcome-level tools, not API wrappers),
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
import { realpathSync } from "node:fs";
import {
  Engine, BODIES, Body, julianDay, mod,
  riseSet, crossings, lunarPhases, stations, RiseKind,
  lunarEclipses, solarEclipses,
  ASPECTS, DEFAULT_ORBS, SIGNS as SIGN_NAMES, dignities,
  solarPhase, aspectPhase, planetaryHour, voidOfCourse,
  CAZIMI_DEG, COMBUST_DEG, UNDER_BEAMS_DEG,
  solarReturn, lunarReturn, progressedLongitude, directedLongitude,
  solarArc, progressedJd, compositeLongitudes, davisonParams, midpointLon,
  dignityOf, isDayChart, planetarySect, inSect,
} from "caelus";
import { loadNodeData } from "caelus/node";

const require = createRequire(import.meta.url);

// Read our own version relative to this file (dist/src/server.js -> the package
// root package.json). A bare require("caelus-mcp/package.json") resolves the
// package by name -- fine under the workspace symlink, but it throws when this
// module is traced into a serverless bundle (the apps/web Streamable HTTP mount)
// where "caelus-mcp" is not a resolvable node_modules entry. The relative path
// resolves from this file's own location, so it holds in both layouts.
const VERSION: string = (() => {
  try {
    return (require("../../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
})();

// The stdio server builds its engine from the Node data packs (precise Moon,
// fixed stars). Hosted transports -- e.g. the Streamable HTTP mount in
// apps/web -- inject their own engine, typically the embedded tier, which
// carries every body these tools use and touches no filesystem. So the
// default stays lazy and loadNodeData never runs unless a caller wants it.
let _defaultEngine: Engine | null = null;
function defaultEngine(): Engine {
  if (_defaultEngine) return _defaultEngine;
  // Resolved lazily: only the stdio default reads the Node data packs. Hosted
  // transports inject their own engine and never reach this, so the caelus
  // package-dir lookup and filesystem read never run in a bundle without them.
  const dataDir = process.env.CAELUS_DATA
    ?? join(dirname(require.resolve("caelus/package.json")), "data");
  return (_defaultEngine = new Engine(loadNodeData(dataDir, "embedded", "full")));
}

// ---------------------------------------------------------------- helpers
const r2 = (x: number) => Math.round(x * 100) / 100;
const SIGNS = ["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"];
// The traditional Chaldean ruler order (slowest to fastest), fixed by tradition
// -- used only to label the 24-hour sequence from the day ruler the validated
// engine returns. Not a computed quantity, so no golden pins it.
const CHALDEAN_ORDER = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
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
const HOUSE_SYSTEMS = [
  "placidus", "whole_sign", "equal", "porphyry", "koch", "regiomontanus",
  "campanus", "alcabitius", "morinus", "meridian", "polich_page", "vehlow",
] as const;
const houseSys = z.enum(HOUSE_SYSTEMS).default("placidus");
const ZODIACS = [
  "tropical", "sidereal:lahiri", "sidereal:fagan_bradley",
  "sidereal:krishnamurti", "sidereal:raman", "sidereal:yukteshwar",
  "sidereal:galcent_0sag", "sidereal:true_citra",
] as const;
const zodiacSchema = z.enum(ZODIACS).default("tropical")
  .describe("tropical (default) or sidereal:<ayanamsa>");
type HouseSysT = (typeof HOUSE_SYSTEMS)[number];
type ZodiacT = (typeof ZODIACS)[number];

// ----------------------------------------------------- resource payloads
// Loaded lazily on first read of the accuracy resource and memoized. Kept off
// the module top level so importing this file into the bundled Streamable HTTP
// mount touches no filesystem; resilient so a missing pack degrades to null
// instead of failing the server.
let _accuracy: { swiss: unknown; jpl: unknown } | null = null;
function accuracyPayload(): { swiss: unknown; jpl: unknown } {
  if (_accuracy) return _accuracy;
  let swiss: unknown = null;
  try { swiss = require("caelus/accuracy.json"); } catch { /* optional */ }
  let jpl: unknown = null;
  try {
    jpl = require(join(dirname(require.resolve("caelus/package.json")),
                       "horizons-accuracy.json"));
  } catch { /* optional, ships with the repo but maybe not the tarball */ }
  return (_accuracy = { swiss, jpl });
}

const TRADITIONAL = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
const GLOSSARY = {
  aspects: Object.fromEntries(Object.entries(ASPECTS).map(
    ([k, deg]) => [k, { degrees: deg, default_orb: DEFAULT_ORBS[k] ?? null }])),
  signs: SIGN_NAMES,
  bodies: BODIES,
  house_systems: HOUSE_SYSTEMS,
  dignities: Object.fromEntries(TRADITIONAL.map((b) => [b, Object.fromEntries(
    SIGN_NAMES.map((s, i) => [s, dignities(b, i)])
      .filter(([, d]) => (d as string[]).length))])),
  electional: {
    solar_phase: {
      cazimi_deg: CAZIMI_DEG, combust_deg: COMBUST_DEG, under_beams_deg: UNDER_BEAMS_DEG,
      note: "Ecliptic-longitude separation from the Sun; cazimi <= combust <= under_beams.",
    },
    planetary_hours: {
      chaldean_order: CHALDEAN_ORDER,
      day_rulers: ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"],
      note: "day_rulers index 0 = Sunday; hours run sunrise..sunset and sunset..sunrise, twelve each.",
    },
    void_of_course: "Moon makes no further Ptolemaic aspect to Sun..Saturn before leaving its current sign.",
    aspect_phase: "applying = orb to exact is closing; separating = opening; from longitude speeds.",
  },
};

function jdFromIso(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return julianDay(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  );
}

/** Julian Day (UT) -> ISO-8601 UTC string to the second. */
function isoFromJd(jd: number): string {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 19) + "Z";
}

function chartPayload(
  engine: Engine,
  iso: string, lat: number, lon: number, hs: HouseSysT,
  zodiac: ZodiacT = "tropical",
) {
  const d = new Date(iso);
  const jd = jdFromIso(iso);
  const c = engine.chart(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), lat, lon,
    { houseSystem: hs, zodiac },
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
    // solar phase: nearness to the Sun by ecliptic longitude (cazimi within
    // 17', combust within 8.5deg, under the beams within 15deg). Omitted when
    // the body is far from the Sun (and always for the Sun itself).
    const sp = solarPhase(engine, b as Body, jd, zodiac);
    bodies[b] = {
      lon: r2(p.lon), pos: fmt(p.lon), house: houseOf(p.lon),
      ...(p.retrograde ? { rx: true } : {}), speed: r2(p.speed),
      ...(sp ? { solar: sp } : {}),
    };
  }
  return {
    utc: iso, houses: c.houseSystem,
    ...(zodiac !== "tropical" ? { zodiac } : {}),
    ...(c.houseSystem !== hs ? { houses_requested: hs, houses_fallback_reason: `${hs} undefined above polar circles` } : {}),
    bodies,
    angles: { asc: r2(c.angles.asc), ascPos: fmt(c.angles.asc), mc: r2(c.angles.mc), mcPos: fmt(c.angles.mc) },
    cusps: cusps.map(r2),
    // Engine Aspect objects ({a, b, aspect, orb}) plus an applying/separating
    // phase from the two bodies' longitude speeds. The extra key is additive, so
    // the payload still feeds caelus-wheel's <ChartWheel> without adaptation.
    aspects: c.aspects.map((a) => ({
      ...a,
      phase: aspectPhase(
        c.bodies[a.a as Body].lon, c.bodies[a.a as Body].speed,
        c.bodies[a.b as Body].lon, c.bodies[a.b as Body].speed,
        ASPECTS[a.aspect],
      ),
    })),
  };
}

const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj) }] });

// ---------------------------------------------------------------- output schemas
// Exported so the integration test validates responses against the same shape
// the server promises. Kept permissive on optional keys (rx, fallback fields).
const bodyOut = z.object({
  lon: z.number(), pos: z.string(), house: z.number().int().min(1).max(12),
  speed: z.number(), rx: z.boolean().optional(),
  solar: z.enum(["cazimi", "combust", "under_beams"]).optional(),
});
const aspectName = z.enum(["conjunction", "sextile", "square", "trine", "opposition"]);
const aspectPhaseName = z.enum(["applying", "separating", "exact"]);
const aspectOut = z.object({
  a: z.string(), b: z.string(), aspect: aspectName, orb: z.number(),
  phase: aspectPhaseName.optional(),
});
export const chartOut = z.object({
  utc: z.string(),
  houses: z.enum(HOUSE_SYSTEMS),
  zodiac: z.enum(ZODIACS).optional(),
  houses_requested: z.enum(HOUSE_SYSTEMS).optional(),
  houses_fallback_reason: z.string().optional(),
  bodies: z.record(z.string(), bodyOut),
  angles: z.object({ asc: z.number(), ascPos: z.string(), mc: z.number(), mcPos: z.string() }),
  cusps: z.array(z.number()).length(12),
  aspects: z.array(aspectOut),
});
export const transitsOut = z.object({
  transit_utc: z.string(),
  transiting: z.record(z.string(), z.object({
    pos: z.string(), natal_house: z.number().int().min(1).max(12), rx: z.boolean().optional(),
  })),
  aspects_to_natal: z.array(z.object({
    t: z.string(), n: z.string(), aspect: aspectName, orb: z.number(), applying: z.boolean(),
  })),
});
export const synastryOut = z.object({
  a: chartOut, b: chartOut,
  inter_aspects: z.array(aspectOut),
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
export const skyEventsOut = z.object({
  start: z.string(),
  end: z.string(),
  events: z.array(z.object({
    t: z.string(),
    kind: z.enum(["rise", "set", "mtransit", "itransit", "phase", "station",
      "crossing", "solar_eclipse", "lunar_eclipse"]),
    detail: z.string().optional(),
  })),
});
export const planetaryHoursOut = z.object({
  utc: z.string(),
  available: z.boolean().optional(),
  reason: z.string().optional(),
  day_ruler: z.string().optional(),
  hour: z.object({
    n: z.number().int().min(1).max(24),
    kind: z.enum(["day", "night"]),
    ruler: z.string(),
    start: z.string(), end: z.string(),
  }).optional(),
  ruler_sequence: z.array(z.string()).length(24).optional(),
});
export const voidOfCourseOut = z.object({
  utc: z.string(),
  moon_sign: z.string(),
  is_void: z.boolean(),
  sign_exit: z.string(),
  next_aspect: z.string().nullable(),
});
export const returnsOut = z.object({
  body: z.enum(["sun", "moon"]),
  natal_utc: z.string(),
  return_lat: z.number(),
  return_lon: z.number(),
  returns: z.array(z.string()),
  chart: chartOut.nullable(),
});
const progressedBody = z.object({
  secondary: z.number(), secondaryPos: z.string(),
  directed: z.number(), directedPos: z.string(),
});
export const progressionsOut = z.object({
  natal_utc: z.string(),
  target_utc: z.string(),
  progressed_jd_utc: z.string(),
  solar_arc: z.number(),
  bodies: z.record(z.string(), progressedBody),
});
export const compositeOut = z.object({
  composite: z.object({
    bodies: z.record(z.string(), z.object({ lon: z.number(), pos: z.string() })),
    angles: z.object({ asc: z.number(), ascPos: z.string(), mc: z.number(), mcPos: z.string() }),
  }),
  davison: chartOut,
});
const dignityBody = z.object({
  sign: z.string(),
  dignity: z.array(z.enum(["domicile", "exaltation", "detriment", "fall"])),
  planetary_sect: z.enum(["diurnal", "nocturnal"]).nullable(),
  in_sect: z.boolean().nullable(),
});
export const dignitiesOut = z.object({
  utc: z.string(),
  sect: z.enum(["day", "night"]),
  bodies: z.record(z.string(), dignityBody),
});
export const OUTPUT_SCHEMAS = {
  natal_chart: chartOut,
  current_sky: chartOut,
  transits: transitsOut,
  synastry: synastryOut,
  find_aspect_dates: findAspectDatesOut,
  rectification_grid: rectificationGridOut,
  sky_events: skyEventsOut,
  planetary_hours: planetaryHoursOut,
  void_of_course: voidOfCourseOut,
  returns: returnsOut,
  progressions: progressionsOut,
  composite: compositeOut,
  dignities: dignitiesOut,
} as const;

// ---------------------------------------------------------------- server
export interface BuildServerOptions {
  // Hosted bundles (the apps/web Streamable HTTP mount) can't resolve sibling
  // files at runtime through the file tracer, so they inject what they'd
  // otherwise read from disk. stdio leaves these unset and reads its own.
  version?: string;
  accuracy?: { swiss: unknown; jpl: unknown };
}

export function buildServer(
  engine: Engine = defaultEngine(),
  opts: BuildServerOptions = {},
): McpServer {
  const server = new McpServer({ name: "caelus", version: opts.version ?? VERSION });

  server.registerTool("natal_chart", {
    description:
      "A person's birth chart. Requires their exact birth date+time and birthplace (all three: date, lat, lon). Use this — not current_sky — whenever the question is about someone's natal/birth chart. Returns 13 bodies (sun–pluto, chiron, nodes) with sign, house, retrograde, speed; ASC/MC; cusps; major aspects with orbs. Vs Swiss Ephemeris (1900–2099): Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤2.5″ (series valid 1885–2099), Chiron ≤1″, mean node ≤1″, true node ≤ 1′ vs SE's built-in ephemeris.",
    inputSchema: { ...birth, house_system: houseSys, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, house_system, zodiac }) =>
    text(chartPayload(engine, date, lat, lon, house_system, zodiac)));

  server.registerTool("current_sky", {
    description:
      "The sky at a moment and place — not tied to any person. Use for \"what's the sky/transits right now\" or the chart of a non-birth event. Date defaults to now; lat/lon default to 0,0 (geocentric on the equator at the prime meridian), where houses and ASC/MC are nominal — pass a real location if houses matter. For a specific person's birth chart use natal_chart instead. Returns positions, houses, retrogrades, aspects.",
    inputSchema: {
      date: z.string().optional().describe("UTC ISO date-time (convert from local first); omit for now"),
      lat: latSchema.default(0).describe("Latitude, north positive; default 0 makes houses nominal"),
      lon: lonSchema.default(0).describe("Longitude, EAST positive (Americas are negative); default 0 makes houses nominal"),
      house_system: houseSys,
      zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, house_system, zodiac }) =>
    text(chartPayload(engine, date ?? new Date().toISOString(), lat, lon, house_system, zodiac)));

  server.registerTool("transits", {
    description:
      "Transiting planets vs natal chart: aspects within orb (applying/separating), natal house per transiting body.",
    inputSchema: {
      ...birth,
      transit_date: z.string().optional().describe("UTC ISO date-time of transit moment (convert from local first); omit for now"),
      orb: z.number().min(0.5).max(10).default(3).describe("Max orb in degrees"),
      house_system: houseSys,
      zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, transit_date, orb, house_system, zodiac }) => {
    const natal = chartPayload(engine, date, lat, lon, house_system, zodiac);
    const tIso = transit_date ?? new Date().toISOString();
    const jdT = jdFromIso(tIso);
    const ASP: Array<[string, number]> = [
      ["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180],
    ];
    const hits: Array<{ t: string; n: string; aspect: string; orb: number; applying: boolean }> = [];
    const cusps = natal.cusps as number[];
    const houseOf = (bl: number) => {
      for (let i = 0; i < 12; i++) {
        if (mod(bl - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
      }
      return 12;
    };
    const transiting: Record<string, unknown> = {};
    for (const tb of BODIES) {
      const tp = engine.position(tb as Body, jdT, { zodiac });
      transiting[tb] = { pos: fmt(tp.lon), natal_house: houseOf(tp.lon), ...(tp.retrograde ? { rx: true } : {}) };
      for (const nb of BODIES) {
        const nLon = (natal.bodies as Record<string, { lon: number }>)[nb].lon;
        const sep = Math.abs(mod(tp.lon - nLon + 180, 360) - 180);
        for (const [name, angle] of ASP) {
          const o = Math.abs(sep - angle);
          if (o <= orb) {
            const future = Math.abs(mod(tp.lon + tp.speed * 0.5 - nLon + 180, 360) - 180);
            const applying = Math.abs(future - angle) < o;
            hits.push({ t: tb, n: nb, aspect: name, orb: r2(o), applying });
          }
        }
      }
    }
    return text({ transit_utc: tIso, transiting, aspects_to_natal: hits });
  });

  server.registerTool("synastry", {
    description:
      "Compare two people's birth charts: inter-chart aspects with orbs, house overlays both ways. Each person needs date+lat+lon. House overlays always use Placidus (not configurable here).",
    inputSchema: {
      a: z.object(birth).describe("Person A birth data (UTC date, lat, lon)"),
      b: z.object(birth).describe("Person B birth data (UTC date, lat, lon)"),
      orb: z.number().min(0.5).max(10).default(4).describe("Max orb in degrees"),
      zodiac: zodiacSchema,
    },
  }, async ({ a, b, orb, zodiac }) => {
    const ca = chartPayload(engine, a.date, a.lat, a.lon, "placidus", zodiac);
    const cb = chartPayload(engine, b.date, b.lat, b.lon, "placidus", zodiac);
    const ASP: Array<[string, number]> = [
      ["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180],
    ];
    const inter: Array<{ a: string; b: string; aspect: string; orb: number }> = [];
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
          if (o <= orb) inter.push({ a: ba, b: bb, aspect: name, orb: r2(o) });
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
      "Exact dates a transiting body makes an aspect, within a range: to a fixed longitude OR to another transiting body. Provide exactly one of target_lon / target_body. Includes retrograde re-hits. Body names are snake_case (mean_node, true_node).",
    inputSchema: {
      body: z.enum(BODIES as unknown as [string, ...string[]]).describe("Transiting body (snake_case, e.g. saturn, true_node)"),
      aspect: z.enum(["conjunction", "sextile", "square", "trine", "opposition"]),
      target_lon: z.number().min(0).max(360).optional().describe("Fixed natal longitude in degrees. Provide this OR target_body, not both."),
      target_body: z.enum(BODIES as unknown as [string, ...string[]]).optional().describe("Another transiting body. Provide this OR target_lon, not both."),
      start: z.string().describe("UTC ISO start date (convert from local first)"),
      end: z.string().describe("UTC ISO end date (convert from local first); range <= 50 years"),
      zodiac: zodiacSchema.describe("Zodiac for body and target_lon longitudes; tropical (default) or sidereal:<ayanamsa>"),
    },
  }, async ({ body, aspect, target_lon, target_body, start, end, zodiac }) => {
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
        ? engine.longitude(target_body as Body, jd, { zodiac })
        : (target_lon as number);
      return mod(engine.longitude(body as Body, jd, { zodiac }) - tl - off + 180, 360) - 180;
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
      "Rectification sweep: ASC/MC at each step across a window of UTC hours on one date, with ASC sign-change times. Use when the birth time is unknown and you want candidate times. The sweep runs over window_start_hour..window_end_hour (UTC hours of the given date); the date's time portion is ignored.",
    inputSchema: {
      date: z.string().describe("Birth DATE (UTC) as ISO; only the calendar date is used, the time portion is ignored (the window_*_hour fields set the times swept)"),
      lat: latSchema, lon: lonSchema,
      window_start_hour: z.number().min(0).max(24).default(0).describe("First UTC hour of the date to sweep"),
      window_end_hour: z.number().min(0).max(24).default(24).describe("Last UTC hour of the date to sweep"),
      step_minutes: z.number().min(5).max(120).default(20).describe("Minutes between grid rows"),
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
      const c = chartPayload(engine, iso, lat, lon, "whole_sign");
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

  server.registerTool("sky_events", {
    description:
      "Sky events in a UTC date range: rise/set/meridian transits (need lat+lon+body), lunar phases (new/quarters/full), solar and lunar eclipses (global circumstances: type, magnitude, gamma), stations (body turns retrograde/direct; needs body), zodiac degree crossings (needs body + target_lon). Times to the second vs Swiss Ephemeris (stations to ~1 min: ill-conditioned by nature). Range <= 370 days.",
    inputSchema: {
      start: z.string().describe("UTC ISO start date (convert from local first)"),
      end: z.string().describe("UTC ISO end date; range <= 370 days"),
      kinds: z.array(z.enum(["rise", "set", "mtransit", "itransit", "phase",
        "station", "crossing", "solar_eclipse", "lunar_eclipse"]))
        .min(1).describe("Event kinds to include"),
      body: z.enum(BODIES as unknown as [string, ...string[]]).optional()
        .describe("Required for rise/set/transit/station/crossing"),
      lat: latSchema.optional().describe("Required for rise/set/transit"),
      lon: lonSchema.optional().describe("Required for rise/set/transit"),
      target_lon: z.number().min(0).max(360).optional()
        .describe("Zodiac longitude for 'crossing', degrees"),
      zodiac: zodiacSchema.describe("Zodiac for 'crossing' longitudes"),
    },
  }, async ({ start, end, kinds, body, lat, lon, target_lon, zodiac }) => {
    const jd0 = jdFromIso(start);
    const jd1 = jdFromIso(end);
    if (jd1 - jd0 > 370) throw new Error("Range too large (max 370 days)");
    const iso = (jd: number) =>
      new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 19) + "Z";
    const events: Array<{ t: string; kind: string; detail?: string }> = [];
    const riseKinds = kinds.filter((k) =>
      k === "rise" || k === "set" || k === "mtransit" || k === "itransit");
    if (riseKinds.length) {
      if (body === undefined || lat === undefined || lon === undefined) {
        throw new Error("rise/set/transit need body, lat, lon");
      }
      for (const k of riseKinds) {
        let t = jd0;
        while (t < jd1 && events.length < 200) {
          const hit = riseSet(engine, body as Body, t, lat, lon, k as RiseKind);
          if (hit === null || hit > jd1) break;
          events.push({ t: iso(hit), kind: k });
          t = hit + 1e-4;
        }
      }
    }
    if (kinds.includes("phase")) {
      for (const [t, name] of lunarPhases(engine, jd0, jd1)) {
        events.push({ t: iso(t), kind: "phase", detail: name });
      }
    }
    if (kinds.includes("station")) {
      if (body === undefined) throw new Error("station needs body");
      for (const [t, dir] of stations(engine, body as Body, jd0, jd1)) {
        events.push({ t: iso(t), kind: "station", detail: dir });
      }
    }
    if (kinds.includes("lunar_eclipse")) {
      for (const e of lunarEclipses(engine, jd0, jd1)) {
        events.push({ t: iso(e.tMax), kind: "lunar_eclipse",
          detail: `${e.type}, mag ${e.magUmbral > 0 ? e.magUmbral.toFixed(2) : e.magPenumbral.toFixed(2) + " penumbral"}` });
      }
    }
    if (kinds.includes("solar_eclipse")) {
      for (const e of solarEclipses(engine, jd0, jd1)) {
        events.push({ t: iso(e.tMax), kind: "solar_eclipse",
          detail: `${e.type}, gamma ${e.gamma.toFixed(2)}` });
      }
    }
    if (kinds.includes("crossing")) {
      if (body === undefined || target_lon === undefined) {
        throw new Error("crossing needs body and target_lon");
      }
      for (const t of crossings(engine, body as Body, target_lon, jd0, jd1, zodiac)) {
        events.push({ t: iso(t), kind: "crossing", detail: `${target_lon}°` });
      }
    }
    events.sort((a, b) => a.t.localeCompare(b.t));
    return text({ start, end, events });
  });

  server.registerTool("planetary_hours", {
    description:
      "Planetary hours for a moment and place: the unequal hour in effect (its ruler, day/night, hour number 1-24, start/end UTC), the ruler of the planetary day, and the full 24-hour ruler sequence. Hours split the day (sunrise to sunset) and night (sunset to next sunrise) into twelve each; the day ruler is the weekday ruler and the hours follow the Chaldean order. Needs lat+lon. Returns available:false above the polar circles when the Sun does not rise or set that day.",
    inputSchema: {
      date: z.string().optional().describe("UTC ISO date-time (convert from local first); omit for now"),
      lat: latSchema,
      lon: lonSchema,
    },
  }, async ({ date, lat, lon }) => {
    const isoStr = date ?? new Date().toISOString();
    const ph = planetaryHour(engine, jdFromIso(isoStr), lat, lon);
    if (ph === null) {
      return text({
        utc: isoStr, available: false,
        reason: "Sun does not rise and set on this date at this latitude (polar day/night)",
      });
    }
    const base = CHALDEAN_ORDER.indexOf(ph.dayRuler);
    const rulerSequence = Array.from({ length: 24 },
      (_, i) => CHALDEAN_ORDER[(base + i) % 7]);
    return text({
      utc: isoStr,
      day_ruler: ph.dayRuler,
      hour: {
        n: ph.hour, kind: ph.kind, ruler: ph.ruler,
        start: isoFromJd(ph.start), end: isoFromJd(ph.end),
      },
      ruler_sequence: rulerSequence,
    });
  });

  server.registerTool("void_of_course", {
    description:
      "Void-of-course Moon at a moment: whether the Moon makes no further Ptolemaic aspect to a traditional planet (Sun..Saturn) before it leaves its current sign. Returns the Moon's sign, the UTC time it exits that sign, and the UTC time of its next perfecting aspect (null when none remains -- i.e. void). Tropical by default.",
    inputSchema: {
      date: z.string().optional().describe("UTC ISO date-time (convert from local first); omit for now"),
      zodiac: zodiacSchema,
    },
  }, async ({ date, zodiac }) => {
    const isoStr = date ?? new Date().toISOString();
    const voc = voidOfCourse(engine, jdFromIso(isoStr), zodiac);
    return text({
      utc: isoStr,
      moon_sign: voc.sign,
      is_void: voc.isVoid,
      sign_exit: isoFromJd(voc.signExit),
      next_aspect: voc.nextAspect === null ? null : isoFromJd(voc.nextAspect),
    });
  });

  server.registerTool("returns", {
    description:
      "Solar or lunar return: the instant(s) a body returns to its natal longitude within a window, plus the full return chart for the first one. The Sun returns about yearly (the solar-return chart for the year), the Moon about monthly. Return chart is cast for the return moment at return_lat/return_lon (defaults to the birthplace; pass the current/relocated place for a relocated return).",
    inputSchema: {
      ...birth,
      body: z.enum(["sun", "moon"]).describe("sun for the solar return, moon for the lunar return"),
      search_start: z.string().describe("UTC ISO start of the window to search for returns"),
      search_end: z.string().describe("UTC ISO end of the window; range <= 2 years"),
      return_lat: latSchema.optional().describe("Latitude for the return chart; defaults to the birth latitude"),
      return_lon: lonSchema.optional().describe("Longitude (EAST positive) for the return chart; defaults to the birth longitude"),
      house_system: houseSys,
      zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, body, search_start, search_end, return_lat, return_lon, house_system, zodiac }) => {
    const natalJd = jdFromIso(date);
    const jd0 = jdFromIso(search_start);
    const jd1 = jdFromIso(search_end);
    if (jd1 - jd0 > 2 * 366) throw new Error("Search window too large (max 2 years)");
    const fn = body === "sun" ? solarReturn : lunarReturn;
    const instants = fn(engine, natalJd, jd0, jd1, zodiac);
    const rLat = return_lat ?? lat;
    const rLon = return_lon ?? lon;
    const returnsIso = instants.map(isoFromJd);
    const chart = instants.length
      ? chartPayload(engine, isoFromJd(instants[0]), rLat, rLon, house_system, zodiac)
      : null;
    return text({ body, natal_utc: date, return_lat: rLat, return_lon: rLon, returns: returnsIso, chart });
  });

  server.registerTool("progressions", {
    description:
      "Secondary progressions (day-for-a-year) and solar-arc directions of a natal chart to a target date. Returns, per body, the secondary-progressed longitude and the solar-arc-directed longitude, plus the solar arc itself. Longitudes only (no houses), so no birthplace is needed.",
    inputSchema: {
      date: birth.date,
      target_date: z.string().describe("UTC ISO date to progress/direct to (convert from local first)"),
      zodiac: zodiacSchema,
    },
  }, async ({ date, target_date, zodiac }) => {
    const natalJd = jdFromIso(date);
    const targetJd = jdFromIso(target_date);
    const bodies: Record<string, unknown> = {};
    for (const b of BODIES) {
      const sec = progressedLongitude(engine, b as Body, natalJd, targetJd, undefined, zodiac);
      const dir = directedLongitude(engine, b as Body, natalJd, targetJd, undefined, zodiac);
      bodies[b] = { secondary: r2(sec), secondaryPos: fmt(sec), directed: r2(dir), directedPos: fmt(dir) };
    }
    return text({
      natal_utc: date,
      target_utc: target_date,
      progressed_jd_utc: isoFromJd(progressedJd(natalJd, targetJd)),
      solar_arc: r2(solarArc(engine, natalJd, targetJd, undefined, zodiac)),
      bodies,
    });
  });

  server.registerTool("composite", {
    description:
      "Relationship charts for two people: the midpoint composite (each body and angle is the shorter-arc midpoint of the two natal positions) and the Davison chart (a real chart cast for the midpoint in time and place). Each person needs date+lat+lon.",
    inputSchema: {
      a: z.object(birth).describe("Person A birth data (UTC date, lat, lon)"),
      b: z.object(birth).describe("Person B birth data (UTC date, lat, lon)"),
      house_system: houseSys,
      zodiac: zodiacSchema,
    },
  }, async ({ a, b, house_system, zodiac }) => {
    const jdA = jdFromIso(a.date);
    const jdB = jdFromIso(b.date);
    const compBodies = compositeLongitudes(engine, jdA, jdB, BODIES as unknown as Body[], zodiac);
    const ca = chartPayload(engine, a.date, a.lat, a.lon, "placidus", zodiac);
    const cb = chartPayload(engine, b.date, b.lat, b.lon, "placidus", zodiac);
    const asc = midpointLon(ca.angles.asc, cb.angles.asc);
    const mc = midpointLon(ca.angles.mc, cb.angles.mc);
    const bodies: Record<string, unknown> = {};
    for (const body of BODIES) bodies[body] = { lon: r2(compBodies[body]), pos: fmt(compBodies[body]) };
    const [midJd, midLat, midLon] = davisonParams(jdA, jdB, a.lat, a.lon, b.lat, b.lon);
    const davison = chartPayload(engine, isoFromJd(midJd), midLat, midLon, house_system, zodiac);
    return text({
      composite: {
        bodies,
        angles: { asc: r2(asc), ascPos: fmt(asc), mc: r2(mc), mcPos: fmt(mc) },
      },
      davison,
    });
  });

  server.registerTool("dignities", {
    description:
      "Essential dignity and sect for the seven traditional planets at a moment and place. Per planet: its sign, any essential dignity (domicile/exaltation/detriment/fall), its planetary sect (diurnal/nocturnal, null for Mercury), and whether it is in sect given a day or night chart. The chart is day when the Sun is above the horizon — so lat+lon are required.",
    inputSchema: { ...birth, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, zodiac }) => {
    const jd = jdFromIso(date);
    const dayChart = isDayChart(engine, jd, lat, lon);
    const bodies: Record<string, unknown> = {};
    for (const b of TRADITIONAL) {
      const lonB = engine.longitude(b as Body, jd, { zodiac });
      bodies[b] = {
        sign: SIGNS[Math.floor(lonB / 30)],
        dignity: dignityOf(engine, b as Body, jd, zodiac),
        planetary_sect: planetarySect(b),
        in_sect: inSect(b, dayChart),
      };
    }
    return text({ utc: date, sect: dayChart ? "day" : "night", bodies });
  });

  // --------------------------------------------------------- resources
  server.registerResource(
    "accuracy", "caelus://accuracy",
    {
      title: "Validation table",
      description: "Per-body accuracy: vs Swiss Ephemeris (swiss) and JPL Horizons apparent positions (jpl).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(opts.accuracy ?? accuracyPayload()) }],
    }),
  );

  server.registerResource(
    "glossary", "caelus://glossary",
    {
      title: "Glossary",
      description: "Machine-readable definitions: aspect angles and default orbs, signs, bodies, the twelve house systems, and essential dignities (domicile/exaltation/detriment/fall).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(GLOSSARY) }],
    }),
  );

  // --------------------------------------------------------- prompts
  server.registerPrompt(
    "rectification_session",
    {
      title: "Birth-time rectification",
      description: "Guide a birth-time rectification: sweep candidate ascendants across the day, then test them against dated life events.",
      argsSchema: {
        date: z.string().describe("Approximate birth DATE, UTC ISO (the time is what we are solving for)"),
        lat: z.string().describe("Birth latitude, north positive"),
        lon: z.string().describe("Birth longitude, EAST positive"),
        events: z.string().optional().describe("Known life events, one per line: 'YYYY-MM-DD: description'"),
      },
    },
    ({ date, lat, lon, events }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text:
            `Help rectify an uncertain birth time.\n\n`
            + `Approximate birth: ${date} at lat ${lat}, lon ${lon}. The clock time is unknown.\n`
            + (events ? `Dated life events:\n${events}\n\n` : "\n")
            + `Procedure:\n`
            + `1. Call rectification_grid(date, lat, lon, step_minutes: 15) to get the Ascendant and MC through the day and the times the Ascendant changes sign. Each segment is a candidate window.\n`
            + `2. For each dated event, call find_aspect_dates and/or sky_events to find the exact transits active on that date.\n`
            + `3. Prefer the candidate windows whose angles (Ascendant, MC) are triggered by those transits. Narrow to the best window, propose a birth time, and state the supporting evidence and the remaining uncertainty.\n`
            + `Use the chart tools for all computation; do not invent positions.`,
        },
      }],
    }),
  );

  return server;
}

// ---------------------------------------------------------------- main
// argv[1] is a symlink when invoked via a bin shim (npx, node_modules/.bin),
// so compare realpaths or the server silently never starts.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  // An async IIFE rather than top-level await keeps this module synchronous, so
  // bundlers that import buildServer() for the Streamable HTTP transport (the
  // apps/web mount) don't have to treat the whole module as async.
  void (async () => {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("caelus-mcp listening on stdio");
  })();
}
