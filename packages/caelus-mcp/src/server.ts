#!/usr/bin/env node
/**
 * caelus-mcp -- MCP server for Caelus astrology computation.
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
  lunarEclipses, solarEclipses, solarEclipseWhere, solarEclipseLocal, solarEclipseLimits,
  lunarEclipseLocal,
  ASPECTS, DEFAULT_ORBS, SIGNS as SIGN_NAMES, dignities, normalizeHouseSystem,
  solarPhase, planetaryHour, voidOfCourse,
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
  detectPatterns, detectPatternsIn, chartSignature,
  chartFeatures, searchConfigurations,
  dignityScore, aspectBetween,
  interpretationContext, chartBrief, realize, realmFraming, isoToJd, counterfactual,
  enrichContextOptions, enrichSynastryOptions,
  skyView, skyViewSequence, LENS_NAMES,
  validateSyntheticSystem, syntheticPositions, syntheticEphemeris,
  registerSyntheticSystem,
  type SyntheticSystem,
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

/** Ephemeral engine for synthetic registration (does not mutate the default). */
function forkEngine(base: Engine): Engine {
  return new Engine(base.data);
}

const DEFAULT_SKY_BODIES = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
] as const;

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
    // Engine Aspect objects already carry an applying/separating/exact phase
    // (from the two bodies' longitude speeds) and a normalized strength. The
    // extra keys are additive, so the payload still feeds caelus-wheel's
    // <ChartWheel> without adaptation.
    aspects: c.aspects,
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
  strength: z.number().optional(),
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
  score: z.number(),
  peregrine: z.boolean().optional(),
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
export const electionalOut = z.object({
  start: z.string(),
  end: z.string(),
  moments: z.array(z.object({
    utc: z.string(),
    score: z.number(),
    matched: z.array(z.object({
      a: z.string(), b: z.string(), aspect: aspectName, orb: z.number(),
      applying: z.boolean(),
    })),
  })),
});
const patternRow = z.object({
  kind: z.string(), bodies: z.array(z.string()),
  apex: z.string().optional(), sign: z.string().optional(),
  house: z.number().int().optional(), orb: z.number(),
});
export const cosmicWeatherOut = z.object({
  utc: z.string(),
  patterns: z.array(patternRow),
  stationing: z.array(z.object({ body: z.string(), utc: z.string(), direction: z.enum(["retrograde", "direct"]) })),
  moon_void_of_course: z.boolean(),
});
const syntheticRenderIn = z.object({
  sizeDeg: z.number().optional(),
  magnitude: z.number().optional(),
  color: z.string().optional(),
});
const syntheticBodyIn = z.discriminatedUnion("mode", [
  z.object({ id: z.string(), mode: z.literal("placement"), lonDeg: z.number() }),
  z.object({
    id: z.string(), mode: z.literal("periodic"),
    periodDays: z.number().positive(), phaseDeg: z.number(), epoch: z.number().optional(),
  }),
  z.object({
    id: z.string(), mode: z.literal("kepler"),
    a: z.number().positive(), e: z.number().min(0).lt(1),
    i: z.number(), node: z.number(), peri: z.number(), M0: z.number(),
    periodDays: z.number().positive(), epoch: z.number().optional(),
  }),
]);
const syntheticSystemIn = z.object({
  id: z.string(),
  bodies: z.array(syntheticBodyIn).min(1),
  observer: z.string().optional(),
  render: z.record(syntheticRenderIn).optional(),
});
export const syntheticDiagnosisOut = z.object({
  impossible: z.boolean(),
  problems: z.array(z.string()),
});
export const syntheticPositionsOut = syntheticDiagnosisOut.extend({
  t: z.number(),
  bodies: z.record(z.object({
    lonDeg: z.number(), latDeg: z.number(), r: z.number(),
    speed: z.number(), retrograde: z.boolean(),
  })),
});
export const skyViewBodyOut = z.object({
  id: z.string(), name: z.string(),
  azimuthDeg: z.number(), altitudeDeg: z.number(),
  x: z.number(), y: z.number(), inFrame: z.boolean(),
  sizePx: z.number(), angularDiameterDeg: z.number(),
  magnitude: z.number().nullable(), nakedEye: z.boolean(),
}).passthrough();
export const skyViewOut = z.object({
  instant: z.object({ jdUt: z.number(), utc: z.string() }),
  observer: z.object({ lat: z.number(), lonEast: z.number(), altM: z.number().optional() }),
  aim: z.object({ azimuthDeg: z.number(), altitudeDeg: z.number(), compass: z.string() }),
  lens: z.object({
    name: z.string(), focalLengthMm: z.number(), sensorWidthMm: z.number(),
    projection: z.enum(["rectilinear", "fisheye"]), hfovDeg: z.number(), vfovDeg: z.number(),
  }),
  image: z.object({ width: z.number(), height: z.number() }),
  sky: z.object({
    twilight: z.enum(["day", "civil", "nautical", "astronomical", "night"]),
    sunAltitudeDeg: z.number(), sunAzimuthDeg: z.number(), limitingMag: z.number(),
    moonAltitudeDeg: z.number().nullable(), moonIllum: z.number().nullable(),
    brightestAzimuthDeg: z.number().nullable(), horizonY: z.number().nullable(),
  }),
  bodies: z.array(skyViewBodyOut),
  offFrame: z.array(z.object({
    id: z.string(), name: z.string(), side: z.string(), deltaDeg: z.number(),
    azimuthDeg: z.number(), altitudeDeg: z.number(), magnitude: z.number().nullable(),
  })),
  milkyWay: z.object({
    visible: z.boolean(),
    inFrame: z.boolean(),
    entry: z.object({ x: z.number(), y: z.number() }).nullable(),
    exit: z.object({ x: z.number(), y: z.number() }).nullable(),
    galacticCenter: z.object({
      x: z.number(), y: z.number(), inFrame: z.boolean(),
      altitudeDeg: z.number(), side: z.string(),
    }).nullable(),
    note: z.string(),
  }),
  pole: z.object({
    which: z.enum(["north", "south"]),
    altitudeDeg: z.number(),
    x: z.number().nullable(), y: z.number().nullable(),
    inFrame: z.boolean(),
  }),
  starfield: z.object({
    source: z.enum(["deep", "named", "none"]),
    count: z.number(), complete: z.boolean(), limitingMag: z.number(),
  }),
  overlays: z.object({
    ecliptic: z.array(z.object({ label: z.string().optional(), points: z.array(z.object({ x: z.number(), y: z.number() })) })).nullable(),
    signs: z.array(z.object({ text: z.string(), x: z.number(), y: z.number() })).nullable(),
    houses: z.array(z.object({ text: z.string(), x: z.number(), y: z.number() })).nullable(),
    constellations: z.object({
      lines: z.array(z.object({ label: z.string().optional(), points: z.array(z.object({ x: z.number(), y: z.number() })) })),
      labels: z.array(z.object({ text: z.string(), x: z.number(), y: z.number() })),
    }).nullable(),
  }).nullable(),
  renderPlan: z.object({
    background: z.object({
      prompt: z.string(), width: z.number(), height: z.number(),
      constraints: z.array(z.string()),
    }),
    layers: z.array(z.object({
      kind: z.enum(["bodies", "stars", "milkyWay", "overlays"]),
      present: z.boolean(), count: z.number(), composite: z.string(),
    })),
    animation: z.object({
      strategy: z.enum(["static", "sequence-composite"]),
      rotationDegPerHour: z.number(),
      pole: z.object({
        which: z.enum(["north", "south"]), altitudeDeg: z.number(),
        x: z.number().nullable(), y: z.number().nullable(), inFrame: z.boolean(),
      }),
      notes: z.string(),
    }),
    postprocess: z.array(z.string()),
  }),
  directives: z.array(z.string()),
  prompt: z.string(),
});
export const OUTPUT_SCHEMAS = {
  natal_chart: chartOut,
  current_sky: chartOut,
  sky_view: skyViewOut,
  sky_view_sequence: z.object({
    count: z.number(), stepMinutes: z.number(), durationMinutes: z.number(),
    rotationDegPerHour: z.number(), rotationDegPerStep: z.number(),
    pole: z.object({
      which: z.enum(["north", "south"]), altitudeDeg: z.number(),
      x: z.number().nullable(), y: z.number().nullable(), inFrame: z.boolean(),
    }),
    frames: z.array(z.object({
      utc: z.string(), twilight: z.string(),
      sunAltitudeDeg: z.number(), moonAltitudeDeg: z.number().nullable(),
      moonIllum: z.number().nullable(), moonBrightLimbClock: z.string().nullable(),
      milkyWayInFrame: z.boolean(),
    })),
  }),
  synthetic_validate: syntheticDiagnosisOut,
  synthetic_positions: syntheticPositionsOut,
  synthetic_sky_view: skyViewOut.extend({ impossible: z.boolean(), problems: z.array(z.string()) }),
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
  electional_search: electionalOut,
  cosmic_weather: cosmicWeatherOut,
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
      "A person's birth chart. Requires their exact birth date+time and birthplace (all three: date, lat, lon). Use this — not current_sky — whenever the question is about someone's natal/birth chart. Returns 13 bodies (sun–pluto, chiron, nodes) with sign, house, retrograde, speed; ASC/MC; cusps; major aspects with orb, applying/separating phase, and strength (1=exact). Vs Swiss Ephemeris (1850–2150): Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″, Pluto ≤3.4″ (Chebyshev pack), Chiron ≤1″, mean node ≤1″, true node ≤ 1′ vs SE's built-in ephemeris.",
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

  server.registerTool("sky_view", {
    description:
      "Where the visible bodies land in a framed photo of the sky, for an image prompt. Give a place, a moment, an aim (compass direction and altitude), a lens, and an image size; get each in-frame body's pixel position, apparent size, brightness, the Moon's phase orientation, a sky-state summary (twilight, limiting magnitude, horizon row), the bright bodies just outside the frame, a ready-to-use prompt, and a machine-readable `renderPlan` (a body-free background-plate prompt plus the computed layers to composite locally, for a hybrid render pipeline). Caelus computes the geometry and photometry; it does NOT render the image. For \"at sunset\", first find the set time with sky_events, then pass it as date.",
    inputSchema: {
      date: z.string().optional().describe("UTC ISO date-time (convert from local first); omit for now"),
      lat: latSchema,
      lon: lonSchema,
      elevation_m: z.number().optional().describe("Eye height above ground in meters (e.g. 9 for a third-floor window)"),
      azimuth: z.union([z.number(), z.string()]).describe("Center compass direction: degrees from true north (east positive) or a 16-point name like \"W\" or \"WNW\""),
      altitude: z.number().min(-10).max(90).default(5).describe("Center altitude in degrees: 0 looks at the horizon, positive tilts up"),
      lens: z.enum(LENS_NAMES as [string, ...string[]]).default("normal").describe("Lens preset; sets field of view and projection (ultrawide is fisheye, the rest rectilinear)"),
      width: z.number().int().positive().default(1024).describe("Output image width in pixels"),
      height: z.number().int().positive().default(683).describe("Output image height in pixels"),
      bortle: z.number().int().min(1).max(9).optional().describe("Dark-sky class, 1 (pristine) to 9 (inner city). Sets the night naked-eye limit and drives background star density and Milky Way visibility. Omit for a suburban default"),
      deep_field: z.boolean().default(false).describe("Pin the complete deep naked-eye star field (thousands of stars at exact pixels) instead of the bright catalog. Larger response; great for control images"),
      overlays: z.array(z.enum(["ecliptic", "signs", "houses", "constellations"])).optional().describe("Reference-frame overlays to project (annotations, not photoreal): the ecliptic line, the zodiac signs, house cusps and angles, and constellation figures. Exact pixels returned in `overlays`"),
      include_stars: z.boolean().default(true).describe("Include bright catalog stars when a star catalog is loaded"),
      max_star_mag: z.number().optional().describe("Brightest-magnitude cutoff for stars (smaller is brighter); default 2.5, or the limiting magnitude when bortle is set"),
    },
  }, async ({ date, lat, lon, elevation_m, azimuth, altitude, lens, width, height, bortle, deep_field, overlays, include_stars, max_star_mag }) => {
    const jd = jdFromIso(date ?? new Date().toISOString());
    const ov = overlays && overlays.length
      ? Object.fromEntries(overlays.map((k) => [k, true]))
      : undefined;
    return text(skyView(engine, jd, {
      observer: { lat, lonEast: lon, ...(elevation_m !== undefined ? { altM: elevation_m } : {}) },
      aim: { azimuth, altitude },
      lens,
      image: { width, height },
    }, { bortle, deepField: deep_field, overlays: ov, includeStars: include_stars, maxStarMag: max_star_mag }));
  });

  server.registerTool("sky_view_sequence", {
    description:
      "A time sequence of sky frames for an animation: the same place, aim, and lens stepped through time. Returns a compact per-frame timeline (instant, twilight, Sun/Moon altitude, Moon phase + bright-limb, whether the Milky Way is in frame) plus the fixed celestial pole and the sky's sidereal rotation per frame. Each frame's full pixel-accurate spec comes from calling sky_view at that instant; this tool plans the timeline. Use for sunset-to-night transitions, star-trail planning, or Moon-phase progressions.",
    inputSchema: {
      date: z.string().optional().describe("First frame, UTC ISO date-time; omit for now"),
      lat: latSchema,
      lon: lonSchema,
      azimuth: z.union([z.number(), z.string()]).describe("Center direction: degrees from true north or a compass name like \"W\""),
      altitude: z.number().min(-10).max(90).default(20).describe("Center altitude in degrees"),
      lens: z.enum(LENS_NAMES as [string, ...string[]]).default("normal"),
      frames: z.number().int().min(2).max(60).describe("Number of frames (2-60)"),
      step_minutes: z.number().positive().describe("Minutes between frames"),
      bortle: z.number().int().min(1).max(9).optional().describe("Dark-sky class 1-9"),
      width: z.number().int().positive().default(1024),
      height: z.number().int().positive().default(683),
    },
  }, async ({ date, lat, lon, azimuth, altitude, lens, frames, step_minutes, bortle, width, height }) => {
    const startJdUt = jdFromIso(date ?? new Date().toISOString());
    const seq = skyViewSequence(engine, {
      observer: { lat, lonEast: lon }, aim: { azimuth, altitude }, lens, image: { width, height },
    }, { startJdUt, frames, stepMinutes: step_minutes }, { bortle, includeStars: false });
    return text({
      count: seq.count,
      stepMinutes: seq.stepMinutes,
      durationMinutes: seq.durationMinutes,
      rotationDegPerHour: seq.rotationDegPerHour,
      rotationDegPerStep: seq.rotationDegPerStep,
      pole: seq.frames[0].pole,
      frames: seq.frames.map((f) => {
        const moon = f.bodies.find((b) => b.id === "moon");
        return {
          utc: f.instant.utc,
          twilight: f.sky.twilight,
          sunAltitudeDeg: f.sky.sunAltitudeDeg,
          moonAltitudeDeg: f.sky.moonAltitudeDeg,
          moonIllum: f.sky.moonIllum,
          moonBrightLimbClock: moon?.brightLimbClock ?? null,
          milkyWayInFrame: f.milkyWay.inFrame,
        };
      }),
    });
  });

  server.registerTool("synthetic_validate", {
    description:
      "Check an authored synthetic celestial system for ill-defined inputs: duplicate body ids, non-positive periods, out-of-range eccentricity, or a dangling observer. Returns `impossible` and a list of problems — the same honesty pattern as compileForm.",
    inputSchema: { system: syntheticSystemIn },
  }, async ({ system }) => text(validateSyntheticSystem(system as SyntheticSystem)));

  server.registerTool("synthetic_positions", {
    description:
      "Positions of every body in an authored synthetic system at one instant. Three body modes: `placement` (fixed longitude), `periodic` (uniform motion), `kepler` (constant elements). With `observer` set on the system, positions are geocentric/apparent from that body (outer bodies can show retrograde). Pass `t_days` for abstract day units, or `date` (UT ISO) when body `epoch` values are Julian Days. Returns speed and retrograde per body.",
    inputSchema: {
      system: syntheticSystemIn,
      date: z.string().optional().describe("UT instant as ISO 8601; used as t when t_days is omitted"),
      t_days: z.number().optional().describe("Time in the same day units as each body's periodDays/epoch (abstract world frame)"),
    },
  }, async ({ system, date, t_days }) => {
    const sys = system as SyntheticSystem;
    const diag = validateSyntheticSystem(sys);
    const t = t_days ?? jdFromIso(date ?? new Date().toISOString());
    const eph = syntheticEphemeris(sys);
    const bodies: Record<string, {
      lonDeg: number; latDeg: number; r: number; speed: number; retrograde: boolean;
    }> = {};
    for (const b of sys.bodies) {
      const p = eph.position(b.id, t);
      bodies[b.id] = {
        lonDeg: p.lonDeg, latDeg: p.latDeg, r: p.r,
        speed: p.speed, retrograde: p.retrograde,
      };
    }
    return text({ ...diag, t, bodies });
  });

  server.registerTool("synthetic_sky_view", {
    description:
      "Sky View for a mix of real and synthetic bodies: register the authored system on an ephemeral engine, then frame the visible sky like sky_view. Synthetic bodies can carry render attributes (sizeDeg, magnitude, color) that flow into the pixel spec and prompt. Real Sun/Moon/planets stay for twilight and context unless omitted from `bodies`.",
    inputSchema: {
      system: syntheticSystemIn,
      date: z.string().optional().describe("UTC ISO date-time; omit for now"),
      lat: latSchema,
      lon: lonSchema,
      elevation_m: z.number().optional().describe("Eye height above ground in meters"),
      azimuth: z.union([z.number(), z.string()]).describe("Center direction: degrees from true north or a compass name"),
      altitude: z.number().min(-10).max(90).default(5).describe("Center altitude in degrees"),
      lens: z.enum(LENS_NAMES as [string, ...string[]]).default("normal"),
      width: z.number().int().positive().default(1024),
      height: z.number().int().positive().default(683),
      bortle: z.number().int().min(1).max(9).optional(),
      bodies: z.array(z.string()).optional().describe("Body ids to draw; defaults to Sun, Moon, planets, and every synthetic body"),
      include_stars: z.boolean().default(false).describe("Include catalog stars (usually off for fictional skies)"),
    },
  }, async ({
    system, date, lat, lon, elevation_m, azimuth, altitude, lens, width, height,
    bortle, bodies, include_stars,
  }) => {
    const sys = system as SyntheticSystem;
    const diag = validateSyntheticSystem(sys);
    const eph = forkEngine(engine);
    registerSyntheticSystem(eph, sys);
    const jd = jdFromIso(date ?? new Date().toISOString());
    const synIds = sys.bodies.map((b) => b.id);
    const defaultSet = new Set<string>(DEFAULT_SKY_BODIES);
    const bodyList = bodies ?? [...DEFAULT_SKY_BODIES, ...synIds.filter((id) => !defaultSet.has(id))];
    const view = skyView(eph, jd, {
      observer: { lat, lonEast: lon, ...(elevation_m !== undefined ? { altM: elevation_m } : {}) },
      aim: { azimuth, altitude },
      lens,
      image: { width, height },
    }, { bortle, bodies: bodyList, includeStars: include_stars, render: sys.render });
    return text({ ...diag, ...view });
  });

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
      "Compare two people's birth charts: inter-chart aspects with orbs, house overlays both ways, plus ranked citable fact atoms and a ready `brief` (synastry/composite ids for auditCitations). Each person needs date+lat+lon. House overlays always use Placidus (not configurable here).",
    inputSchema: {
      a: z.object(birth).describe("Person A birth data (UTC date, lat, lon)"),
      b: z.object(birth).describe("Person B birth data (UTC date, lat, lon)"),
      orb: z.number().min(0.5).max(10).default(4).describe("Max orb in degrees"),
      zodiac: zodiacSchema,
    },
  }, async ({ a, b, orb, zodiac }) => {
    const jdA = jdFromIso(a.date);
    const jdB = jdFromIso(b.date);
    if (jdA === null || jdB === null) throw new Error("invalid birth date");
    const chartA = engine.chartAt(jdA, a.lat, a.lon, { houseSystem: "placidus", zodiac });
    const chartB = engine.chartAt(jdB, b.lat, b.lon, { houseSystem: "placidus", zodiac });
    const syn = enrichSynastryOptions(engine, chartA, chartB, { orb, zodiac });
    const inter = syn.synastry!.aspects!.map((h) => ({ a: h.a, b: h.b, aspect: h.aspect, orb: r2(h.orb) }));
    const aInB = syn.synastry!.overlays!.aInB;
    const bInA = syn.synastry!.overlays!.bInA;
    const stars = engine.starConjunctions(chartA, { orb: 1 });
    const lots = engine.lots(chartA).filter((l) => l.lot === "fortune" || l.lot === "spirit");
    const ctx = interpretationContext(chartA, { stars, lots, ...syn });
    const brief = chartBrief(ctx, { limit: 24 });
    const ca = chartPayload(engine, a.date, a.lat, a.lon, "placidus", zodiac);
    const cb = chartPayload(engine, b.date, b.lat, b.lon, "placidus", zodiac);
    return text({
      a: ca, b: cb, inter_aspects: inter,
      a_planets_in_b_houses: aInB, b_planets_in_a_houses: bInA,
      total_facts: ctx.atoms.length, facts: brief.facts, brief: brief.prompt,
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
      "Sky events in a UTC date range: rise/set/meridian transits (need lat+lon+body), lunar phases (new/quarters/full), solar and lunar eclipses, stations (body turns retrograde/direct; needs body), zodiac degree crossings (needs body + target_lon). Solar eclipses report global circumstances (type, magnitude, gamma) plus the greatest-eclipse location and path width; add lat+lon to also get local circumstances (type seen, magnitude, obscuration, contact times C1-C4). Lunar eclipses report type and magnitude; add lat+lon to learn whether the Moon is above the horizon there. Times to the second vs Swiss Ephemeris (stations to ~1 min: ill-conditioned by nature). Range <= 370 days.",
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
    const events: Array<{
      t: string; kind: string; detail?: string;
      local?: { type: string; magnitude?: number; obscuration?: number;
        c1?: string; c2?: string; max?: string; c3?: string; c4?: string };
    }> = [];
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
        let detail = `${e.type}, mag ${e.magUmbral > 0 ? e.magUmbral.toFixed(2) : e.magPenumbral.toFixed(2) + " penumbral"}`;
        // A lunar eclipse is simultaneous worldwide; with a place, say whether
        // the Moon is up to see it.
        if (lat !== undefined && lon !== undefined) {
          const ll = lunarEclipseLocal(engine, e.tMax, lat, lon);
          detail += ll.visible ? `, Moon ${ll.altitude.toFixed(0)}° up` : ", Moon below horizon";
        }
        events.push({ t: iso(e.tMax), kind: "lunar_eclipse", detail });
      }
    }
    if (kinds.includes("solar_eclipse")) {
      const fmtLat = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
      const fmtLon = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
      for (const e of solarEclipses(engine, jd0, jd1)) {
        const w = solarEclipseWhere(engine, e.tMax);
        let detail = `${e.type}, gamma ${e.gamma.toFixed(2)}`;
        if (w) {
          detail += `, greatest at ${fmtLat(w.lat)} ${fmtLon(w.lonEast)}`;
          const path = solarEclipseLimits(engine, e.tMax);
          if (path?.widthKm) detail += `, path ${path.widthKm.toFixed(0)} km wide`;
        }
        const ev: (typeof events)[number] = { t: iso(e.tMax), kind: "solar_eclipse", detail };
        // Local circumstances at the observer, when a place was given.
        if (lat !== undefined && lon !== undefined) {
          const loc = solarEclipseLocal(engine, e.tMax, lat, lon);
          ev.local = loc.type === "none"
            ? { type: "none" }
            : {
                type: loc.type,
                magnitude: Number(loc.magnitude.toFixed(3)),
                obscuration: Number(loc.obscuration.toFixed(3)),
                c1: loc.c1 ? iso(loc.c1) : undefined,
                c2: loc.c2 ? iso(loc.c2) : undefined,
                max: loc.maxTime ? iso(loc.maxTime) : undefined,
                c3: loc.c3 ? iso(loc.c3) : undefined,
                c4: loc.c4 ? iso(loc.c4) : undefined,
              };
        }
        events.push(ev);
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
      "Essential dignity and sect for the seven traditional planets at a moment and place. Per planet: its sign, any essential dignity (domicile/exaltation/detriment/fall), its weighted essential-dignity score (Lilly: rulership 5, exaltation 4, triplicity 3, term 2, face 1; detriment -5, fall -4) with a peregrine flag, its planetary sect (diurnal/nocturnal, null for Mercury), and whether it is in sect given a day or night chart. The chart is day when the Sun is above the horizon — so lat+lon are required.",
    inputSchema: { ...birth, zodiac: zodiacSchema },
  }, async ({ date, lat, lon, zodiac }) => {
    const jd = jdFromIso(date);
    const dayChart = isDayChart(engine, jd, lat, lon);
    const bodies: Record<string, unknown> = {};
    for (const b of TRADITIONAL) {
      const lonB = engine.longitude(b as Body, jd, { zodiac });
      // Weighted essential-dignity score (Lilly) for this planet at its place.
      const ds = dignityScore(b, lonB, dayChart ? "day" : "night");
      bodies[b] = {
        sign: SIGNS[Math.floor(lonB / 30)],
        dignity: dignityOf(engine, b as Body, jd, zodiac),
        score: ds.total,
        ...(ds.peregrine ? { peregrine: true } : {}),
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

  server.registerTool("chart_facts", {
    description:
      "A chart's validated facts as ranked, citable atoms for interpretation. Each fact has a stable id (e.g. \"aspect:moon~neptune:conjunction\"), the bodies it concerns, a salience score (luminaries, angular placements, the chart ruler, tight/hard aspects, configurations rank high), and a plain-language statement. Facts span placements, aspects, configurations, the structural signature, dispositors and receptions, a body's tight conjunction with a bright fixed star (e.g. \"star:jupiter:Sirius\"), and the Part of Fortune and Spirit (e.g. \"lot:fortune\"). Read the facts, write the interpretation in your own words, and cite the [id] each statement rests on — do not introduce facts not listed. Returns the ranked facts plus a ready-to-interpret `brief`.\n\nBy default a real birth chart: pass date+lat+lon. The chart's grounding is first-class via `realm` (what it is: observed/forecast/fictional/mythic/archetypal/…) and the time: an exact `date`, an uncertain `earliest`+`latest` range (the brief then frames it as provisional and trusts the Moon/angles/houses less), `constraints` for an archetypal chart with no time (synthesized via the compiler), or a full structured `when` (relative-to-another-event or a narrative calendar). A `when` of kind `relative` looks its `anchorId` up in `anchors` (a map of id → UTC instant supplied in the request). Omit lat+lon for a placeless chart (nominal houses).",
    inputSchema: {
      date: z.string().optional().describe("Exact UTC instant, ISO 8601 (e.g. 1990-06-10T14:30:00Z); convert local to UTC first"),
      earliest: z.string().optional().describe("Start of an uncertain-time range (UTC ISO); use with `latest` instead of `date`"),
      latest: z.string().optional().describe("End of an uncertain-time range (UTC ISO)"),
      when: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("instant"), utc: z.string() }),
        z.object({ kind: z.literal("range"), earliest: z.string(), latest: z.string() }),
        z.object({ kind: z.literal("relative"), relation: z.enum(["before", "after", "during"]), anchorId: z.string(), offset: z.string().optional() }),
        z.object({ kind: z.literal("narrative"), calendar: z.string().optional(), value: z.string(), sequence: z.number().optional() }),
        z.object({ kind: z.literal("symbolic"), rationale: z.string() }),
        z.object({ kind: z.literal("none"), reason: z.enum(["atemporal", "time_irrelevant", "intentionally_unset"]) }),
      ]).optional().describe("Full structured temporal anchor; overrides date/earliest/latest. Use for relative or narrative time."),
      anchors: z.record(z.string()).optional()
        .describe("Reference instants for a `relative` when: { anchorId: UTC ISO }"),
      lat: latSchema.optional(),
      lon: lonSchema.optional(),
      realm: z.enum(["observed", "reported", "planned", "forecast", "fictional",
        "mythic", "counterfactual", "archetypal", "conceptual"]).default("observed")
        .describe("What the chart is; frames the interpretation (default observed)"),
      constraints: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("aspect"), a: z.string(), b: z.string(), angle: z.number(), weight: z.number().optional() }),
        z.object({ kind: z.literal("sign"), body: z.string(), sign: z.number().int().min(0).max(11), weight: z.number().optional() }),
        z.object({ kind: z.literal("degree"), body: z.string(), degree: z.number(), weight: z.number().optional() }),
      ])).optional().describe("Geometric constraints for an archetypal/conceptual chart with no time (compiler synthesis)"),
      house_system: houseSys, zodiac: zodiacSchema,
      target_date: z.string().optional()
        .describe("UTC ISO instant for transits and time-lords vs this natal chart; omit for natal-only facts"),
      include_vedic: z.boolean().optional()
        .describe("With target_date: project nakshatra/varga/yoga (default true when zodiac is sidereal)"),
      limit: z.number().int().min(1).max(60).default(24)
        .describe("max facts to return, highest salience first (default 24)"),
    },
  }, async ({ date, earliest, latest, when: whenInput, anchors, lat, lon, realm, constraints, house_system, zodiac, target_date, include_vedic, limit }) => {
    const when = whenInput
      ?? (date ? { kind: "instant" as const, utc: date }
        : earliest && latest ? { kind: "range" as const, earliest, latest }
        : constraints?.length ? { kind: "symbolic" as const, rationale: "synthesized from constraints" }
        : null);
    if (when === null) throw new Error("Provide date, earliest+latest, when, or constraints");
    const instants: Record<string, number> = {};
    for (const [id, utc] of Object.entries(anchors ?? {})) {
      const jd = isoToJd(utc);
      if (jd !== null) instants[id] = jd;
    }
    const where = lat !== undefined && lon !== undefined
      ? { kind: "geo" as const, lat, lonEast: lon }
      : { kind: "none" as const, reason: "intentionally_unset" as const };
    const r = realize(engine, { realm, when, where, constraints }, { instants },
      { houseSystem: normalizeHouseSystem(house_system), zodiac });
    if (r.via === "ephemeris" && r.chart) {
      // Enrich the projection with the Part of Fortune and its companion lots,
      // and any tight conjunction to a bright fixed star (both ranked by
      // salience, so they surface only when prominent).
      const stars = engine.starConjunctions(r.chart, { orb: 1 });
      // The two primary lots; the five derived lots are niche, so they are left
      // out of the default brief to avoid crowding it.
      const lots = engine.lots(r.chart).filter((l) => l.lot === "fortune" || l.lot === "spirit");
      const ctxOpts: Parameters<typeof interpretationContext>[1] = {
        provenance: { realm, certainty: r.time.certainty }, stars, lots,
      };
      let targetUtc: string | undefined;
      if (target_date) {
        const targetJd = isoToJd(target_date);
        if (targetJd === null) throw new Error("invalid target_date");
        targetUtc = target_date;
        if (lat !== undefined && lon !== undefined) {
          Object.assign(ctxOpts, enrichContextOptions(engine, r.chart, {
            jd: targetJd, lat, lonEast: lon, zodiac,
          }, { vedic: include_vedic ?? zodiac.startsWith("sidereal") }));
        }
      }
      const ctx = interpretationContext(r.chart, ctxOpts);
      const brief = chartBrief(ctx, { limit });
      const framing = realmFraming(realm, r.time.certainty);
      return text({
        realm, via: r.via, certainty: r.time.certainty,
        utc: isoFromJd(r.time.jd!), houses: r.chart.houseSystem,
        ...(r.time.earliest !== undefined ? { range: { earliest: isoFromJd(r.time.earliest), latest: isoFromJd(r.time.latest!) } } : {}),
        ...(zodiac !== "tropical" ? { zodiac } : {}),
        ...(framing ? { framing } : {}),
        ...(targetUtc ? { target_utc: targetUtc } : {}),
        total_facts: ctx.atoms.length, facts: brief.facts, brief: brief.prompt,
      });
    }
    if (r.via === "compiler" && r.form) {
      return text({
        realm, via: r.via, note: r.note,
        longitudes: r.form.longitudes, residual: r.form.residual, impossible: r.form.impossible,
      });
    }
    return text({ realm, via: r.via, note: r.note });
  });

  server.registerTool("counterfactual_chart", {
    description:
      "A birth chart, perturbed — a 'what if'. Give a base chart (date+lat+lon) and an edit: `shift_time` (e.g. '1h', '-30m', 'P1D') moves the instant (\"born an hour later\"), `move_lat`+`move_lon` recompute at another place, and/or `set_longitudes` moves bodies to new ecliptic degrees (\"Mars in the next sign\"). Returns the diff vs the original: bodies that changed sign or house, aspects gained or lost, and angles that changed sign. A time/place edit rotates the houses and angles while planets stay put; a longitude splice moves only those bodies and recomputes their aspects.",
    inputSchema: {
      ...birth,
      shift_time: z.string().optional().describe("Duration to shift the instant: '1h', '-30m', 'P1Y'"),
      move_lat: latSchema.optional().describe("Recompute at this latitude instead of the birth latitude"),
      move_lon: lonSchema.optional().describe("Recompute at this longitude instead of the birth longitude"),
      set_longitudes: z.record(z.number()).optional()
        .describe("Move bodies to these ecliptic longitudes in degrees, e.g. { \"mars\": 45 }"),
      house_system: houseSys, zodiac: zodiacSchema,
    },
  }, async ({ date, lat, lon, shift_time, move_lat, move_lon, set_longitudes, house_system, zodiac }) => {
    const cf = counterfactual(engine, {
      realm: "counterfactual", when: { kind: "instant", utc: date }, where: { kind: "geo", lat, lonEast: lon },
    }, {
      ...(shift_time !== undefined ? { shiftTime: shift_time } : {}),
      ...(move_lat !== undefined && move_lon !== undefined ? { place: { lat: move_lat, lonEast: move_lon } } : {}),
      ...(set_longitudes ? { setLongitudes: set_longitudes } : {}),
    }, {}, { houseSystem: normalizeHouseSystem(house_system), zodiac });
    return text({ note: cf.note, diff: cf.diff });
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

  server.registerTool("electional_search", {
    description:
      "Rank moments in a window for an electional aim. Samples the window and scores each instant by how closely a set of wanted body-to-body aspects is satisfied (tighter and applying aspects score higher), optionally penalizing a void-of-course Moon. Returns the top moments with the aspects that matched. Body-to-body only; for aspects to the angles, compute the chart at a candidate moment.",
    inputSchema: {
      start: z.string().describe("UTC ISO start of the window"),
      end: z.string().describe("UTC ISO end of the window"),
      wanted: z.array(z.object({
        a: z.string().describe("first body, snake_case"),
        b: z.string().describe("second body, snake_case"),
        aspect: aspectName,
      })).min(1).describe("aspects to reward when close to exact"),
      step_hours: z.number().positive().default(6).describe("sampling step in hours (default 6)"),
      avoid_void_moon: z.boolean().default(false).describe("penalize a void-of-course Moon"),
      limit: z.number().int().positive().default(10).describe("max moments to return (default 10)"),
      zodiac: zodiacSchema,
    },
  }, async ({ start, end, wanted, step_hours, avoid_void_moon, limit, zodiac }) => {
    const startJd = jdFromIso(start);
    const endJd = jdFromIso(end);
    const stepJd = step_hours / 24;
    const moments: Array<{ utc: string; score: number; matched: unknown[] }> = [];
    for (let jd = startJd; jd <= endJd + 1e-9; jd += stepJd) {
      const matched: Array<{ a: string; b: string; aspect: string; orb: number; applying: boolean }> = [];
      let score = 0;
      for (const w of wanted) {
        const m = aspectBetween(engine, w.a as Body, w.b as Body, jd, zodiac);
        if (m && m.aspect === w.aspect) {
          const maxOrb = DEFAULT_ORBS[w.aspect] ?? 6;
          const orb = Math.abs(m.orb); // aspectBetween returns a signed orb
          const applying = m.phase === "applying";
          score += Math.max(0, 1 - orb / maxOrb) + (applying ? 0.3 : 0);
          matched.push({ a: w.a, b: w.b, aspect: w.aspect, orb: r2(orb), applying });
        }
      }
      if (avoid_void_moon && voidOfCourse(engine, jd, zodiac).isVoid) score -= 1;
      if (matched.length > 0) moments.push({ utc: isoFromJd(jd), score: r2(score), matched });
    }
    moments.sort((a, b) => b.score - a.score);
    return text({ start, end, moments: moments.slice(0, limit) });
  });

  server.registerTool("cosmic_weather", {
    description:
      "The mundane sky on a date: the active aspect configurations among the transiting planets (T-squares, grand trines, grand crosses, yods, kites, mystic rectangles, stelliums by sign), any planet stationing within a window, and whether the Moon is void of course. A 'cosmic weather' snapshot; no birth chart or location needed.",
    inputSchema: {
      date: z.string().describe("UTC ISO date"),
      window_days: z.number().positive().default(7).describe("days either side to scan for stations (default 7)"),
      zodiac: zodiacSchema,
    },
  }, async ({ date, window_days, zodiac }) => {
    const jd = jdFromIso(date);
    const bodies: Record<string, { lon: number }> = {};
    for (const b of BODIES) bodies[b] = { lon: engine.longitude(b as Body, jd, { zodiac }) };
    const stationing: Array<{ body: string; utc: string; direction: string }> = [];
    for (const b of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
      for (const [sjd, direction] of stations(engine, b as Body, jd - window_days, jd + window_days, 2)) {
        stationing.push({ body: b, utc: isoFromJd(sjd), direction });
      }
    }
    stationing.sort((x, y) => (x.utc < y.utc ? -1 : 1));
    return text({
      utc: date,
      patterns: detectPatternsIn(bodies),
      stationing,
      moon_void_of_course: voidOfCourse(engine, jd, zodiac).isVoid,
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
