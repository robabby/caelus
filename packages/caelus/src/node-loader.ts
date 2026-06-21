/** Node convenience loader. Browser apps inject EngineData themselves
 *  (bundle the JSON or fetch it) -- the core never touches the filesystem. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EngineData, VsopSeries } from "./core.js";

const PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn",
  "uranus", "neptune"];

export type VsopLevel = "full" | "high" | "embedded" | "micro";
export type MoonTier = "full" | "embedded" | "none";

export function loadNodeData(
  dir: string, level: VsopLevel = "embedded", moonTier: MoonTier = "full",
): EngineData {
  const j = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const vsop: Record<string, VsopSeries> = {};
  // The npm package ships the embedded and micro VSOP tiers; full/high live
  // in the repo. Fall back per planet so "full" against the published
  // tarball loads instead of throwing ENOENT.
  for (const p of PLANETS) {
    const tiers = level === "embedded" || level === "micro" ? [level] : [level, "embedded"];
    const found = tiers.find((t) => existsSync(join(dir, `vsop87d_${p}.${t}.json`)));
    if (!found) {
      throw new Error(
        `no VSOP87D data for ${p} in ${dir} (tried ${tiers.join(", ")}); `
        + "the full/high tiers live in the caelus repo, not the npm package",
      );
    }
    vsop[p] = j(`vsop87d_${p}.${found}.json`);
  }
  const data: EngineData = {
    vsop,
    nutation: j("nutation_iau1980.json"),
    moonMeeus: j("moon_meeus47.json"),
    pluto: j("pluto_meeus37.json"),
  };
  const chironPath = join(dir, "chiron_cheb.json");
  if (existsSync(chironPath)) data.chiron = j("chiron_cheb.json");
  if (existsSync(join(dir, "uranian_kepler.json"))) {
    data.keplerPack = j("uranian_kepler.json");
  }
  if (existsSync(join(dir, "fixed_stars.json"))) {
    data.fixedStars = j("fixed_stars.json");
  }
  if (existsSync(join(dir, "fixed_stars_deep.json"))) {
    data.deepStars = j("fixed_stars_deep.json");
  }
  if (existsSync(join(dir, "constellations.json"))) {
    data.constellations = j("constellations.json");
  }
  // asteroid packs (Horizons fits): loaded when present, ~380 KB total.
  // `pluto` is optional too: when a wide-range Chebyshev pack is present it
  // supersedes the embedded Meeus ch.37 series (valid 1885-2099) above, so
  // Pluto extends past that window at full precision; see fit_pluto.py.
  for (const b of ["ceres", "pallas", "juno", "vesta", "pholus", "pluto"]) {
    if (existsSync(join(dir, `${b}_cheb.json`))) {
      (data.chebPacks ??= {})[b] = j(`${b}_cheb.json`);
    }
  }
  if (moonTier !== "none") {
    // The npm package ships only the embedded tier (1920-2080); the full
    // tier (1850-2150, 3.1 MB, same precision) lives in the repo. Fall back
    // so "full" requests still get the precise Moon where it exists.
    const tiers = moonTier === "full" ? ["full", "embedded"] : [moonTier];
    for (const t of tiers) {
      const p = join(dir, `moon_cheb.${t}.json`);
      if (existsSync(p)) { data.moonCheb = j(`moon_cheb.${t}.json`); break; }
    }
  }
  return data;
}
