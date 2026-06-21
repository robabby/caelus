/**
 * Canonical numeric facts for site prose and UI. Counts come from
 * packages/caelus/accuracy.json (kept in sync by scripts/sync-facts.mjs);
 * golden-suite stats from conformance-stats.json (CI-generated, gitignored).
 */
import accuracy from "caelus/accuracy.json";
import stats from "../../../conformance-stats.json";

export const FACTS = {
  goldenChecks: stats.checks,
  worstNanoArcsec: stats.worst.nano_arcsec,
  mcpTools: accuracy.counts.mcp_tools,
  houseSystems: accuracy.counts.house_systems,
  siderealAyanamsas: accuracy.counts.sidereal_ayanamsas,
  defaultBodies: accuracy.counts.default_bodies,
  zodiacModes: 1 + accuracy.counts.sidereal_ayanamsas,
} as const;

/** @deprecated Prefer FACTS.mcpTools */
export const MCP_TOOL_COUNT = FACTS.mcpTools;

const PROSE_COUNT: Record<number, string> = {
  7: "seven",
  12: "twelve",
  13: "thirteen",
  29: "twenty-nine",
  31: "thirty-one",
  33: "thirty-three",
  34: "thirty-four",
};

export function formatGoldenChecks(count = FACTS.goldenChecks): string {
  return count.toLocaleString("en-US");
}

/** Worst golden-suite delta, rounded for prose (matches lint:claims). */
export function formatWorstNano(n = FACTS.worstNanoArcsec): string {
  return String(Number(n.toFixed(2)));
}

export function formatWorstNanoProse(n = FACTS.worstNanoArcsec): string {
  return `${formatWorstNano(n)} nano-arcsecond`;
}

export function formatWorstNanoLlms(n = FACTS.worstNanoArcsec): string {
  return `${formatWorstNano(n)}e-9 arcsec`;
}

export function formatCountProse(count: number): string {
  return PROSE_COUNT[count] ?? String(count);
}

/** Lowercase prose count for MCP tools, e.g. "twenty-nine". */
export function formatMcpToolsProse(count = FACTS.mcpTools): string {
  return formatCountProse(count);
}

/** Title-case prose count, e.g. "Twenty-nine". */
export function formatMcpToolsTitle(count = FACTS.mcpTools): string {
  const word = formatMcpToolsProse(count);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatHouseSystemsProse(count = FACTS.houseSystems): string {
  return formatCountProse(count);
}

export function formatSiderealProse(count = FACTS.siderealAyanamsas): string {
  return formatCountProse(count);
}

export {
  DEFAULT_BODY_CLAIMS,
  GOLDEN_CHECK_CLAIMS,
  HOUSE_SYSTEM_CLAIMS,
  MCP_TOOL_CLAIMS,
  SIDEREAL_CLAIMS,
  WORST_NANO_CLAIMS,
} from "./facts-anchors.generated";
