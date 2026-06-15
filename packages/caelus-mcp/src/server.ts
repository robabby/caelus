#!/usr/bin/env node
/**
 * caelus-mcp -- MCP server for the caelus ephemeris engine.
 *
 * Design (per 2026 MCP practice): one bounded context (chart computation),
 * a small curated tool surface (twenty-two outcome-level tools, not API wrappers),
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
  Engine, BODIES, Body, AlwaysBody, julianDay, mod,
  riseSet, crossings, lunarPhases, stations, RiseKind,
  lunarEclipses, solarEclipses,
  ASPECTS, DEFAULT_ORBS, SIGNS as SIGN_NAMES, dignities, normalizeHouseSystem,
  solarPhase, aspectPhase, planetaryHour, voidOfCourse,
  CAZIMI_DEG, COMBUST_DEG, UNDER_BEAMS_DEG,
  solarReturn, lunarReturn, progressedLongitude, directedLongitude,
  solarArc, progressedJd, compositeLongitudes, davisonParams, midpointLon,
  dignityOf, isDayChart, planetarySect, inSect,
  lots, HERMETIC_LOTS,
  profectionAt, firdaria, firdariaActive,
  zrRelease, zrActive, lotSpirit, lotFortune,
  primaryDirections, mundaneDirections,
  nakshatra, vimshottariDashas, vimshottariAt,
  yoginiDashas, yoginiAt, ashtottariDashas, ashtottariAt,
  varga, VARGA_DIVISIONS,
  yogasAt, kemadrumaAt, rajaYogasAt, dhanaYogasAt,
  detectPatterns, chartSignature,
  chartFeatures, searchConfigurations,
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
  const norm = mod(lon, 360);
  const d = mod(norm, 30);
  return `${Math.floor(d)}°${String(Math.floor(mod(d, 1) * 60)).padStart(2, "0")}'${SIGNS[Math.floor(norm / 30)]}`;
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
// Lenient on input: the engine's normalizeHouseSystem() accepts any case,
// spaces/hyphens, and aliases ("whole sign", "Placidus", "whole" -> whole_sign),
// so agents don't trip the strict enum. The output `houses` stays canonical.
const houseSys = z.string().default("placidus").describe(
  `House system (default placidus). Case- and spacing-insensitive; valid: ${HOUSE_SYSTEMS.join(", ")} (aliases like "whole sign" also work).`,
);
const ZODIACS = [
  "tropical", "sidereal:lahiri", "sidereal:fagan_bradley",
  "sidereal:krishnamurti", "sidereal:raman", "sidereal:yukteshwar",
  "sidereal:galcent_0sag", "sidereal:true_citra",
] as const;
const zodiacSchema = z.enum(ZODIACS).default("tropical")
  .describe("tropical (default) or sidereal:<ayanamsa>");
// Jyotish techniques (nakshatras, vargas, dashas, yogas) are sidereal by
// definition; default these tools to Lahiri rather than tropical.
const siderealZodiac = z.enum(ZODIACS).default("sidereal:lahiri")
  .describe("sidereal ayanamsa (default sidereal:lahiri); these are sidereal techniques");
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

// The seven classical planets: all analytic, so always present in a chart.
const TRADITIONAL: readonly AlwaysBody[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
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
  iso: string, lat: number, lon: number, hs: string,
  zodiac: ZodiacT = "tropical",
) {
  const reqHs = normalizeHouseSystem(hs);
  const d = new Date(iso);
  const jd = jdFromIso(iso);
  const c = engine.chart(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), lat, lon,
    { houseSystem: reqHs, zodiac },
  );
  const cusps = c.cusps;
  const bodies: Record<string, unknown> = {};
  for (const b of BODIES) {
    const p = c.bodies[b];
    // Outside its fitted range at this date (reported in c.unavailable); skip it
    // rather than dereferencing an absent position.
    if (!p) continue;
    // solar phase: nearness to the Sun by ecliptic longitude (cazimi within
    // 17', combust within 8.5deg, under the beams within 15deg). Omitted when
    // the body is far from the Sun (and always for the Sun itself).
    const sp = solarPhase(engine, b as Body, jd, zodiac);
    // house + essential dignities come straight from the engine's ChartBody;
    // dignity is omitted when peregrine (and for bodies without rulerships) to
    // stay token-frugal, like rx/solar.
    bodies[b] = {
      lon: r2(p.lon), pos: fmt(p.lon), house: p.house,
      ...(p.retrograde ? { rx: true } : {}),
      ...(p.dignities.length ? { dignity: p.dignities } : {}),
      speed: r2(p.speed),
      ...(sp ? { solar: sp } : {}),
    };
  }
  return {
    utc: iso, houses: c.houseSystem,
    ...(zodiac !== "tropical" ? { zodiac } : {}),
    ...(c.houseSystem !== reqHs ? { houses_requested: reqHs, houses_fallback_reason: `${reqHs} undefined above polar circles` } : {}),
    bodies,
    angles: { asc: r2(c.angles.asc), ascPos: fmt(c.angles.asc), mc: r2(c.angles.mc), mcPos: fmt(c.angles.mc) },
    cusps: cusps.map(r2),
    ...(c.unavailable.length ? { unavailable: c.unavailable } : {}),
    // Engine Aspect objects ({a, b, aspect, orb}) plus an applying/separating
    // phase from the two bodies' longitude speeds. The extra key is additive, so
    // the payload still feeds caelus-wheel's <ChartWheel> without adaptation.
    // Aspects only ever reference bodies present in the chart (the engine omits
    // out-of-range ones before pairing), so these lookups are non-null.
    aspects: c.aspects.map((a) => {
      const ba = c.bodies[a.a]!;
      const bb = c.bodies[a.b]!;
      return {
        ...a,
        phase: aspectPhase(ba.lon, ba.speed, bb.lon, bb.speed, ASPECTS[a.aspect]),
      };
    }),
  };
}

const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj) }] });

// ---------------------------------------------------------------- chart widget (MCP Apps / Apps SDK)
// natal_chart and current_sky can render the chart wheel in-host (ChatGPT and
// other MCP-UI / Apps-SDK hosts). The widget loads a self-contained bundle
// (apps/web/widget -> /embed/chart-widget.js) directly in the host's own
// sandbox — no nested iframe — and mounts caelus-wheel from the tool's
// structuredContent. Server-side half only; see docs/mcp-app-wiring.md.
const EMBED_ORIGIN = process.env.CAELUS_EMBED_ORIGIN ?? "https://www.ephemengine.com";
const CHART_WIDGET_URI = "ui://widget/chart.html";
// The MCP Apps UI MIME type (current). Hosts only enable the UI bridge for it;
// ChatGPT additionally honours the legacy openai/* _meta aliases set below.
const CHART_WIDGET_MIME = "text/html;profile=mcp-app";

// Bind the two chart tools to the widget. Both the standard (_meta.ui.resourceUri)
// and the ChatGPT compatibility alias (openai/outputTemplate) point at the same
// resource, so the binding survives across hosts.
const CHART_TOOL_META = {
  ui: { resourceUri: CHART_WIDGET_URI },
  "openai/outputTemplate": CHART_WIDGET_URI,
};

// The widget shell: a root element plus the bundle loaded directly from the
// embed origin (a script, not an iframe — so the CSP needs only resourceDomains,
// never the heavily-scrutinised frameDomains). The bundle reads the chart from
// the MCP Apps tool-result message / window.openai.toolOutput. `version` is a
// cache-buster so a release always loads fresh JS.
const chartWidgetHtml = (version: string) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#0e0e14}#caelus-chart-root{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden}</style>
<div id="caelus-chart-root"></div>
<script src="${EMBED_ORIGIN}/embed/chart-widget.js?v=${encodeURIComponent(version)}"></script>`;

// Tool result for the two chart tools: the existing text payload (unchanged for
// non-UI clients) plus structuredContent, which UI hosts hand to the widget as
// its tool output. The two carry the same object.
const chartResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  structuredContent: payload as Record<string, unknown>,
});

// ---------------------------------------------------------------- output schemas
// Exported so the integration test validates responses against the same shape
// the server promises. Kept permissive on optional keys (rx, fallback fields).
const bodyOut = z.object({
  lon: z.number(), pos: z.string(), house: z.number().int().min(1).max(12),
  speed: z.number(), rx: z.boolean().optional(),
  dignity: z.array(z.enum(["domicile", "exaltation", "detriment", "fall"])).optional(),
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
  unavailable: z.array(z.string()).optional(),
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
export const lotsOut = z.object({
  utc: z.string(),
  sect: z.enum(["day", "night"]),
  lots: z.record(z.string(), z.object({ lon: z.number(), pos: z.string() })),
});
const profectedSignOut = z.object({
  sign: z.string(),
  sign_index: z.number(),
  house: z.number(),
  lord: z.string(),
});
export const profectionsOut = z.object({
  natal_utc: z.string(),
  target_utc: z.string(),
  age_years: z.number(),
  month: z.number(),
  annual: profectedSignOut,
  monthly: profectedSignOut,
});
const firdariaSubOut = z.object({ lord: z.string(), start: z.string(), end: z.string() });
const firdariaPeriodOut = z.object({
  lord: z.string(),
  years: z.number(),
  start: z.string(),
  end: z.string(),
  sub: z.array(firdariaSubOut),
});
export const firdariaOut = z.object({
  natal_utc: z.string(),
  sect: z.enum(["day", "night"]),
  periods: z.array(firdariaPeriodOut),
  active: z.object({
    target_utc: z.string(),
    major: z.string().nullable(),
    sub: z.string().nullable(),
  }).optional(),
});
const zrPeriodOut = z.object({
  level: z.number(),
  sign: z.string(),
  lord: z.string(),
  start: z.string(),
  end: z.string(),
  lb: z.boolean(),
});
export const releasingOut = z.object({
  natal_utc: z.string(),
  lot: z.enum(["spirit", "fortune"]),
  lot_sign: z.string(),
  sect: z.enum(["day", "night"]),
  periods: z.array(zrPeriodOut),
  active: z.object({
    target_utc: z.string(),
    l1: z.string().nullable(),
    l2: z.string().nullable(),
    l3: z.string().nullable(),
    l4: z.string().nullable(),
  }).optional(),
});
const directionOut = z.object({
  body: z.string(),
  angle: z.enum(["MC", "IC", "ASC", "DSC"]),
  arc: z.number(),
  years: z.number(),
  date: z.string(),
});
const mundaneDirectionOut = z.object({
  promissor: z.string(),
  significator: z.string(),
  arc: z.number(),
  years: z.number(),
  date: z.string(),
});
export const directionsOut = z.object({
  natal_utc: z.string(),
  key: z.enum(["ptolemy", "naibod"]),
  directions: z.array(directionOut),
  mundane: z.array(mundaneDirectionOut).optional(),
});
export const nakshatrasOut = z.object({
  natal_utc: z.string(),
  zodiac: z.enum(ZODIACS),
  points: z.record(z.string(), z.object({
    nakshatra: z.string(),
    pada: z.number().int().min(1).max(4),
    lord: z.string(),
    deg: z.number(),
  })),
});
const dashaSubOut = z.object({
  lord: z.string().optional(),
  yogini: z.string().optional(),
  start: z.string(),
  end: z.string(),
});
export const dashaOut = z.object({
  natal_utc: z.string(),
  system: z.enum(["vimshottari", "yogini", "ashtottari"]),
  moon_nakshatra: z.string(),
  start_lord: z.string().optional(),
  start_yogini: z.string().optional(),
  balance_years: z.number(),
  periods: z.array(z.object({
    lord: z.string().optional(),
    yogini: z.string().optional(),
    start: z.string(),
    end: z.string(),
    sub: z.array(dashaSubOut).optional(),
  })),
  active: z.object({
    target_utc: z.string(),
    maha: z.string().nullable(),
    antar: z.string().nullable(),
    pratyantar: z.string().nullable().optional(),
  }).optional(),
});
export const vargasOut = z.object({
  natal_utc: z.string(),
  zodiac: z.enum(ZODIACS),
  charts: z.record(z.string(), z.record(z.string(), z.object({
    sign: z.string(),
    sign_index: z.number().int().min(0).max(11),
    division: z.number().int(),
  }))),
});
const lordPairOut = z.object({ lords: z.array(z.string()), via: z.string() });
export const yogasOut = z.object({
  natal_utc: z.string(),
  zodiac: z.enum(ZODIACS),
  yogas: z.array(z.object({ yoga: z.string(), planets: z.array(z.string()) })),
  kemadruma: z.boolean(),
  raja_yogas: z.array(lordPairOut),
  dhana_yogas: z.array(lordPairOut),
  yogakarakas: z.array(z.string()),
});
export const patternsOut = z.object({
  utc: z.string(),
  houses: z.enum(HOUSE_SYSTEMS),
  zodiac: z.enum(ZODIACS).optional(),
  patterns: z.array(z.object({
    kind: z.string(),
    bodies: z.array(z.string()),
    apex: z.string().optional(),
    sign: z.string().optional(),
    house: z.number().int().optional(),
    orb: z.number(),
  })),
});
const countMap = z.record(z.string(), z.number().int());
export const signatureOut = z.object({
  utc: z.string(),
  houses: z.enum(HOUSE_SYSTEMS),
  zodiac: z.enum(ZODIACS).optional(),
  signature: z.object({
    elements: countMap,
    modalities: countMap,
    angularity: countMap,
    quadrants: countMap,
    hemispheres: countMap,
    dominant: z.object({ element: z.string(), modality: z.string(), sign: z.string().nullable() }),
    ruler: z.string().nullable(),
    bodies: z.array(z.string()),
  }),
});
export const similarSkiesOut = z.object({
  reference_utc: z.string(),
  matches: z.array(z.object({ utc: z.string(), similarity: z.number() })),
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
  lots: lotsOut,
  profections: profectionsOut,
  firdaria: firdariaOut,
  releasing: releasingOut,
  directions: directionsOut,
  nakshatras: nakshatrasOut,
  dasha: dashaOut,
  vargas: vargasOut,
  yogas: yogasOut,
  aspect_patterns: patternsOut,
  chart_signature: signatureOut,
  similar_skies: similarSkiesOut,
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
  const version = opts.version ?? VERSION;
  const server = new McpServer({ name: "caelus", version });

  server.registerTool("natal_chart", {
    description:
      "A person's birth chart. Requires their exact birth date+time and birthplace (all three: date, lat, lon). Use this — not current_sky — whenever the question is about someone's natal/birth chart. Returns 13 bodies (sun–pluto, chiron, nodes) with sign, house, retrograde, speed; ASC/MC; cusps; major aspects with orbs. Vs Swiss Ephemeris (1900–2099): Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤2.5″ (series valid 1885–2099), Chiron ≤1″, mean node ≤1″, true node ≤ 1′ vs SE's built-in ephemeris.",
    inputSchema: { ...birth, house_system: houseSys, zodiac: zodiacSchema },
    _meta: CHART_TOOL_META,
  }, async ({ date, lat, lon, house_system, zodiac }) =>
    chartResult(chartPayload(engine, date, lat, lon, house_system, zodiac)));

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
    _meta: CHART_TOOL_META,
  }, async ({ date, lat, lon, house_system, zodiac }) =>
    chartResult(chartPayload(engine, date ?? new Date().toISOString(), lat, lon, house_system, zodiac)));

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

  server.registerTool("lots", {
    description:
      "The seven Hermetic lots (Arabic parts) — Fortune, Spirit, Eros, Necessity, Courage, Victory, Nemesis — cast from the Ascendant and reversing direction by sect (a chart is day when the Sun is above the horizon). Per lot: its longitude and zodiacal position. Lots are anchored to the Ascendant, so an exact time and lat+lon are required. Fortune and Spirit are mirror images about the Ascendant. Tropical by default.",
    inputSchema: { ...birth, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, zodiac }) => {
    const jd = jdFromIso(date);
    const l = lots(engine, jd, lat, lon, zodiac);
    const out: Record<string, { lon: number; pos: string }> = {};
    for (const name of HERMETIC_LOTS) {
      out[name] = { lon: r2(l[name]), pos: fmt(l[name]) };
    }
    return text({ utc: date, sect: l.day ? "day" : "night", lots: out });
  });

  server.registerTool("profections", {
    description:
      "Annual and monthly profections (a Hellenistic time-lord technique) at a target date. The natal Ascendant advances one whole sign per year of life; the profected sign's traditional ruler is the lord of the year, the single most important time-lord for that year. Returns the age in years, the month within the profection year, and the annual and monthly profected sign (with its whole-sign house from the natal Ascendant and its lord). Needs the birth time and place for the Ascendant.",
    inputSchema: {
      ...birth,
      target_date: z.string().describe("UTC ISO date to profect to (convert from local first)"),
      zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, target_date, zodiac }) => {
    const natalJd = jdFromIso(date);
    const targetJd = jdFromIso(target_date);
    const p = profectionAt(engine, natalJd, targetJd, lat, lon, zodiac);
    return text({
      natal_utc: date,
      target_utc: target_date,
      age_years: p.age_years,
      month: p.month,
      annual: p.annual,
      monthly: p.monthly,
    });
  });

  server.registerTool("firdaria", {
    description:
      "Firdaria (firdariyyat): the Persian/medieval planetary time-lord periods. Life divides into nine major periods totalling 75 years — the seven planets (a day chart starts with the Sun, a night chart with the Moon) then the North and South Nodes — each planetary period split into seven sub-periods. Returns the full timeline (each period and sub-period with UTC start/end) and, when target_date is given, the major and sub lord active then. Sect is taken from the birth chart, so lat+lon are required; pure time arithmetic, no zodiac.",
    inputSchema: {
      ...birth,
      target_date: z.string().optional().describe("UTC ISO date to look up the active period for; omit for the timeline only"),
    },
  }, async ({ date, lat, lon, target_date }) => {
    const natalJd = jdFromIso(date);
    const day = isDayChart(engine, natalJd, lat, lon);
    const periods = firdaria(day, natalJd).map((p) => ({
      lord: p.lord,
      years: p.years,
      start: isoFromJd(p.start),
      end: isoFromJd(p.end),
      sub: p.sub.map((s) => ({ lord: s.lord, start: isoFromJd(s.start), end: isoFromJd(s.end) })),
    }));
    const payload: {
      natal_utc: string;
      sect: "day" | "night";
      periods: typeof periods;
      active?: { target_utc: string; major: string | null; sub: string | null };
    } = { natal_utc: date, sect: day ? "day" : "night", periods };
    if (target_date !== undefined) {
      const a = firdariaActive(day, natalJd, jdFromIso(target_date));
      payload.active = { target_utc: target_date, major: a.major, sub: a.sub };
    }
    return text(payload);
  });

  server.registerTool("releasing", {
    description:
      "Zodiacal releasing (aphesis), the Hellenistic time-lord technique from Vettius Valens, released from a Lot (Spirit by default, or Fortune). From the Lot's sign, periods release sign by sign with planetary minor-year lengths on the 360-day-year convention; each level is a twelfth of the one above (L1..L4), and a loop back to the starting sign looses the bond, jumping once to the opposite sign (+6). Returns the timeline down to max_level over the horizon and, when target_date is given, the L1..L4 lords active then. Anchored to the natal Lot, so an exact time and lat+lon are required.",
    inputSchema: {
      ...birth,
      target_date: z.string().optional().describe("UTC ISO date to read the active L1..L4 periods for; omit for the timeline only"),
      lot: z.enum(["spirit", "fortune"]).optional().describe("the Lot to release from (default spirit)"),
      max_level: z.number().int().min(1).max(4).optional().describe("deepest sub-period level in the timeline, 1..4 (default 2)"),
      horizon_years: z.number().positive().optional().describe("timeline length in 360-day years from birth (default 100)"),
      zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, target_date, lot = "spirit", max_level = 2, horizon_years = 100, zodiac }) => {
    const natalJd = jdFromIso(date);
    const asc = engine.chartAt(natalJd, lat, lon, { zodiac }).angles.asc;
    const day = isDayChart(engine, natalJd, lat, lon);
    const sun = engine.longitude("sun", natalJd, { zodiac });
    const moon = engine.longitude("moon", natalJd, { zodiac });
    const lotLon = (lot === "spirit" ? lotSpirit : lotFortune)(asc, sun, moon, day);
    const lotSign = mod(Math.floor(lotLon / 30), 12);
    const periods = zrRelease(lotSign, natalJd, max_level, horizon_years).map((p) => ({
      level: p.level,
      sign: p.sign,
      lord: p.lord,
      start: isoFromJd(p.start),
      end: isoFromJd(p.end),
      lb: p.lb,
    }));
    const payload: {
      natal_utc: string;
      lot: "spirit" | "fortune";
      lot_sign: string;
      sect: "day" | "night";
      periods: typeof periods;
      active?: { target_utc: string; l1: string | null; l2: string | null; l3: string | null; l4: string | null };
    } = { natal_utc: date, lot, lot_sign: SIGN_NAMES[lotSign], sect: day ? "day" : "night", periods };
    if (target_date !== undefined) {
      const a = zrActive(lotSign, natalJd, jdFromIso(target_date));
      payload.active = {
        target_utc: target_date,
        l1: a?.l1 ?? null,
        l2: a?.l2 ?? null,
        l3: a?.l3 ?? null,
        l4: a?.l4 ?? null,
      };
    }
    return text(payload);
  });

  server.registerTool("directions", {
    description:
      "Primary (mundane) directions of the seven traditional planets to the four angles (MC, IC, Ascendant, Descendant), and optionally between the planets themselves. The diurnal rotation carries a body to the angle (or a promissor to a significator); the arc of rotation, converted by a time key (Naibod 0.9856473°/yr by default, or Ptolemy 1°/yr), gives the age of the direction. Returns the directions within max_years, sorted by age, each with its arc, age in years, and UTC date. With include_mundane, also returns the planet-to-planet (promissor → significator) directions. Circumpolar bodies have no Ascendant/Descendant directions. Needs the birth time and place; equatorial, so zodiac is irrelevant.",
    inputSchema: {
      ...birth,
      key: z.enum(["naibod", "ptolemy"]).optional().describe("time key: naibod (0.9856473°/yr, default) or ptolemy (1°/yr)"),
      max_years: z.number().positive().optional().describe("only directions reached within this many years of life (default 90)"),
      include_mundane: z.boolean().optional().describe("also return inter-planetary (promissor → significator) directions (default false)"),
    },
  }, async ({ date, lat, lon, key = "naibod", max_years = 90, include_mundane = false }) => {
    const natalJd = jdFromIso(date);
    const dirs = primaryDirections(engine, natalJd, lat, lon, undefined, key, max_years);
    const payload: {
      natal_utc: string;
      key: string;
      directions: Array<{ body: string; angle: string; arc: number; years: number; date: string }>;
      mundane?: Array<{ promissor: string; significator: string; arc: number; years: number; date: string }>;
    } = {
      natal_utc: date,
      key,
      directions: dirs.map((d) => ({
        body: d.body,
        angle: d.angle,
        arc: r2(d.arc),
        years: r2(d.years),
        date: isoFromJd(d.jd),
      })),
    };
    if (include_mundane) {
      const mundane = mundaneDirections(engine, natalJd, lat, lon, undefined, key, max_years);
      payload.mundane = mundane.map((d) => ({
        promissor: d.promissor,
        significator: d.significator,
        arc: r2(d.arc),
        years: r2(d.years),
        date: isoFromJd(d.jd),
      }));
    }
    return text(payload);
  });

  server.registerTool("nakshatras", {
    description:
      "The nakshatra (one of the 27 lunar mansions of 13°20′) of each classical point on the sidereal zodiac: the seven traditional planets and the Ascendant (lagna). Per point: the nakshatra name, its pada (quarter, 1–4), the ruling planet (the Vimshottari lord), and degrees into the nakshatra. The Moon's nakshatra (janma nakshatra) anchors the Vimshottari dasha. Sidereal by definition; Lahiri ayanamsa by default. Needs the birth time and place for the Ascendant.",
    inputSchema: { ...birth, zodiac: siderealZodiac },
  }, async ({ date, lat, lon, zodiac }) => {
    const natalJd = jdFromIso(date);
    const chart = engine.chartAt(natalJd, lat, lon, { zodiac });
    const desc = (lonDeg: number) => {
      const n = nakshatra(lonDeg);
      return { nakshatra: n.name, pada: n.pada, lord: n.lord, deg: r2(n.pos) };
    };
    const points: Record<string, ReturnType<typeof desc>> = {};
    for (const b of TRADITIONAL) points[b] = desc(chart.bodies[b].lon);
    points.asc = desc(chart.angles.asc);
    return text({ natal_utc: date, zodiac, points });
  });

  server.registerTool("dasha", {
    description:
      "Vedic dasha periods — planetary time-lord cycles started from the Moon's birth nakshatra. system selects Vimshottari (120-year, the standard), Yogini (36-year, eight yoginis), or Ashtottari (108-year). Returns the period timeline (mahadasha → antardasha) with UTC start/end, the balance of the first period at birth, and — when target_date is given — the lords active then (Vimshottari also gives the pratyantardasha). Sidereal; Lahiri by default. Needs the birth time and place.",
    inputSchema: {
      ...birth,
      system: z.enum(["vimshottari", "yogini", "ashtottari"]).default("vimshottari")
        .describe("dasha system: vimshottari (120y), yogini (36y), or ashtottari (108y)"),
      target_date: z.string().optional().describe("UTC ISO date to read the active lords for; omit for the timeline only"),
      levels: z.number().int().min(1).max(2).optional().describe("deepest timeline level: 1 (maha) or 2 (maha+antar, default)"),
      zodiac: siderealZodiac,
    },
  }, async ({ date, lat, lon, system, target_date, levels = 2, zodiac }) => {
    const natalJd = jdFromIso(date);
    const moonLon = engine.longitude("moon", natalJd, { zodiac });
    const moonNak = nakshatra(moonLon).name;
    const targetJd = target_date !== undefined ? jdFromIso(target_date) : undefined;
    const isoSub = (s: { lord: string; start: number; end: number }) =>
      ({ lord: s.lord, start: isoFromJd(s.start), end: isoFromJd(s.end) });
    switch (system) {
      case "vimshottari": {
        const tl = vimshottariDashas(moonLon, natalJd, levels);
        const periods = tl.dashas.map((d) => ({
          lord: d.lord, start: isoFromJd(d.start), end: isoFromJd(d.end),
          ...(levels >= 2 ? { sub: d.sub.map(isoSub) } : {}),
        }));
        const payload: Record<string, unknown> = {
          natal_utc: date, system, moon_nakshatra: moonNak,
          start_lord: tl.start_lord, balance_years: r2(tl.balance_years), periods,
        };
        if (targetJd !== undefined) {
          const a = vimshottariAt(engine, natalJd, targetJd, zodiac);
          payload.active = { target_utc: target_date, maha: a.maha ?? null, antar: a.antar ?? null, pratyantar: a.pratyantar ?? null };
        }
        return text(payload);
      }
      case "yogini": {
        const tl = yoginiDashas(moonLon, natalJd, levels);
        const periods = tl.dashas.map((d) => ({
          yogini: d.yogini, lord: d.lord, start: isoFromJd(d.start), end: isoFromJd(d.end),
          ...(levels >= 2 ? { sub: d.sub.map((s) => ({ yogini: s.yogini, lord: s.lord, start: isoFromJd(s.start), end: isoFromJd(s.end) })) } : {}),
        }));
        const payload: Record<string, unknown> = {
          natal_utc: date, system, moon_nakshatra: moonNak,
          start_yogini: tl.start_yogini, balance_years: r2(tl.balance_years), periods,
        };
        if (targetJd !== undefined) {
          const a = yoginiAt(engine, natalJd, targetJd, zodiac);
          payload.active = { target_utc: target_date, maha: a.maha ?? null, antar: a.antar ?? null };
        }
        return text(payload);
      }
      case "ashtottari": {
        const tl = ashtottariDashas(moonLon, natalJd, levels);
        const periods = tl.dashas.map((d) => ({
          lord: d.lord, start: isoFromJd(d.start), end: isoFromJd(d.end),
          ...(levels >= 2 ? { sub: d.sub.map(isoSub) } : {}),
        }));
        const payload: Record<string, unknown> = {
          natal_utc: date, system, moon_nakshatra: moonNak,
          start_lord: tl.start_lord, balance_years: r2(tl.balance_years), periods,
        };
        if (targetJd !== undefined) {
          const a = ashtottariAt(engine, natalJd, targetJd, zodiac);
          payload.active = { target_utc: target_date, maha: a.maha ?? null, antar: a.antar ?? null };
        }
        return text(payload);
      }
      default: {
        const _exhaustive: never = system;
        throw new Error(`unknown dasha system: ${String(_exhaustive)}`);
      }
    }
  });

  server.registerTool("vargas", {
    description:
      "Parashari divisional charts (vargas): the sign of each of the seven planets and the Ascendant in the requested D-charts — D1 rasi, D2 hora, D3 drekkana, D9 navamsa, D10 dasamsa, D12 dwadasamsa, D30 trimsamsa. Per point in each chart: the divisional sign and the division number within the rasi. The navamsa (D9) is the most consulted after the rasi. Sidereal; Lahiri by default. Needs the birth time and place for the Ascendant.",
    inputSchema: {
      ...birth,
      divisions: z.array(z.number().int().refine((n) => (VARGA_DIVISIONS as readonly number[]).includes(n), "unsupported division"))
        .optional().describe(`subset of ${VARGA_DIVISIONS.join("/")} (default all)`),
      zodiac: siderealZodiac,
    },
  }, async ({ date, lat, lon, divisions, zodiac }) => {
    const natalJd = jdFromIso(date);
    const chart = engine.chartAt(natalJd, lat, lon, { zodiac });
    const ns = divisions && divisions.length ? divisions : (VARGA_DIVISIONS as readonly number[]);
    const lons: Record<string, number> = { asc: chart.angles.asc };
    for (const b of TRADITIONAL) lons[b] = chart.bodies[b].lon;
    const charts: Record<string, Record<string, { sign: string; sign_index: number; division: number }>> = {};
    for (const n of ns) {
      const c: Record<string, { sign: string; sign_index: number; division: number }> = {};
      for (const [name, lonDeg] of Object.entries(lons)) {
        const v = varga(lonDeg, n);
        c[name] = { sign: v.sign, sign_index: v.sign_index, division: v.division };
      }
      charts[`D${n}`] = c;
    }
    return text({ natal_utc: date, zodiac, charts });
  });

  server.registerTool("yogas", {
    description:
      "Vedic yogas (planetary combinations) on the sidereal rasi chart: the five Pancha Mahapurusha yogas (Ruchaka, Bhadra, Hamsa, Malavya, Shasha), Gajakesari, Budha-Aditya, and Chandra-Mangala; whether Kemadruma (the isolated-Moon yoga) is present; the raja yogas (a kendra lord associating with a trikona lord) and dhana (wealth) yogas, each as the lord pair and how they associate (conjunction, aspect, or exchange); and the chart's yogakarakas (a planet ruling both a kendra and a trikona). Sidereal; Lahiri by default. Needs the birth time and place.",
    inputSchema: { ...birth, zodiac: siderealZodiac },
  }, async ({ date, lat, lon, zodiac }) => {
    const natalJd = jdFromIso(date);
    const placement = yogasAt(engine, natalJd, lat, lon, zodiac);
    const kema = kemadrumaAt(engine, natalJd, lat, lon, false, false, zodiac);
    const { raja, yogakarakas } = rajaYogasAt(engine, natalJd, lat, lon, zodiac);
    const dhana = dhanaYogasAt(engine, natalJd, lat, lon, zodiac);
    return text({
      natal_utc: date, zodiac,
      yogas: placement,
      kemadruma: kema.present,
      raja_yogas: raja,
      dhana_yogas: dhana,
      yogakarakas,
    });
  });

  server.registerTool("aspect_patterns", {
    description:
      "Classical aspect configurations in a chart: T-squares, grand trines, grand crosses, yods, kites, mystic rectangles, and stelliums by sign and by house. Each is a structured object with the participating bodies and the worst defining-aspect orb; T-squares and yods also name the apex, stelliums their sign or house. Reported patterns are maximal — a grand cross hides the T-squares it contains, a kite its grand trine. Pure geometry (engine orbs plus a quincunx for yods), no interpretation. Needs date, lat, lon.",
    inputSchema: { ...birth, house_system: houseSys, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, house_system, zodiac }) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
    const c = engine.chart(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), lat, lon,
      { houseSystem: normalizeHouseSystem(house_system), zodiac },
    );
    return text({
      utc: date, houses: c.houseSystem,
      ...(zodiac !== "tropical" ? { zodiac } : {}),
      patterns: detectPatterns(c),
    });
  });

  server.registerTool("chart_signature", {
    description:
      "A chart's structural signature as plain counts: element, modality, angularity, quadrant, and hemisphere distributions over the bodies; the dominant element, modality, and most-occupied sign; and the classical chart ruler (the ruler of the Ascendant's sign). Counts only, no interpretation — a compact summary for emphasis and comparison. Needs date, lat, lon.",
    inputSchema: { ...birth, house_system: houseSys, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, house_system, zodiac }) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
    const c = engine.chart(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), lat, lon,
      { houseSystem: normalizeHouseSystem(house_system), zodiac },
    );
    return text({
      utc: date, houses: c.houseSystem,
      ...(zodiac !== "tropical" ? { zodiac } : {}),
      signature: chartSignature(c),
    });
  });

  server.registerTool("similar_skies", {
    description:
      "Find when the sky most resembled a reference moment. Builds a feature vector for the reference date's planetary configuration and scans a window for the closest matches by cosine similarity (1.0 = identical configuration). Answers 'when did the sky last look like this?' for transit echoes and historical analogues. Returns the top matches with their similarity, highest first.",
    inputSchema: {
      reference_date: z.string().describe("UTC ISO date whose sky is the target to match"),
      start: z.string().describe("UTC ISO start of the search window"),
      end: z.string().describe("UTC ISO end of the search window"),
      step_days: z.number().positive().default(1).describe("sampling step in days (default 1)"),
      limit: z.number().int().positive().default(10).describe("max matches to return (default 10)"),
    },
  }, async ({ reference_date, start, end, step_days, limit }) => {
    const target = chartFeatures(engine, jdFromIso(reference_date));
    const matches = searchConfigurations(engine, target, {
      start: jdFromIso(start), end: jdFromIso(end), step: step_days, limit,
    });
    return text({
      reference_utc: reference_date,
      matches: matches.map((m) => ({ utc: isoFromJd(m.jd), similarity: Math.round(m.score * 1e4) / 1e4 })),
    });
  });

  // --------------------------------------------------------- resources
  // Chart wheel widget (MCP Apps / Apps SDK). The CSP allowlists the embed
  // origin only for loading the widget script (resourceDomains) — no
  // frameDomains, since the bundle renders directly in the host sandbox rather
  // than nesting an iframe. The legacy openai/widgetCSP mirror keeps older
  // ChatGPT happy.
  server.registerResource(
    "chart-widget", CHART_WIDGET_URI,
    {
      title: "Chart wheel",
      description: "Renders the natal_chart / current_sky payload as a caelus-wheel chart.",
      mimeType: CHART_WIDGET_MIME,
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [EMBED_ORIGIN] } },
        "openai/widgetCSP": { connect_domains: [], resource_domains: [EMBED_ORIGIN] },
      },
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: CHART_WIDGET_MIME, text: chartWidgetHtml(version) }],
    }),
  );

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
    // Caelus under the velificatio, in stderr's ASCII. stdout is the protocol
    // channel, so the banner goes to stderr where hosts collect logs.
    const arch = String.raw`
       .-~~~~~-.
     .'  *  .   '.
    /  ( o   o )  \
   |       >       |
    \    \___/    /
     '.         .'
       '-_____-'`;
    console.error(
      `${arch}\n   caelus-mcp v${VERSION} · western + vedic ephemeris · MIT\n   listening on stdio\n`,
    );
  })();
}
