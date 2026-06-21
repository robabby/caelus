#!/usr/bin/env node
/**
 * Build the deep star pack: naked-eye stars (to magnitude 6.5) from the HYG
 * database v4.1, in the same StarEntry shape as data/fixed_stars.json. This is
 * the complete background field SkyView pins for animation-grade frames, kept
 * as a separate opt-in pack (node-loaded, not bundled into the web embed) so it
 * does not bloat the core catalog or the browser bundle.
 *
 * Source: github.com/astronexus/HYG-Database (CC BY-SA 4.0). The CSV is large
 * (~34 MB) and not committed; this script downloads it to a temp file if the
 * path given (default /tmp/hyg.csv) is absent.
 *
 *   node scripts/build-deep-stars.mjs [hyg.csv] [maxMag]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYG_URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv";
const csvPath = process.argv[2] ?? "/tmp/hyg.csv";
const maxMag = Number(process.argv[3] ?? 6.5);
const outPath = join(ROOT, "packages/caelus/data/fixed_stars_deep.json");

if (!existsSync(csvPath)) {
  console.log(`downloading HYG v4.1 to ${csvPath} ...`);
  execFileSync("curl", ["-sSL", "--max-time", "180", "-o", csvPath, HYG_URL]);
}

/** Minimal quote-aware CSV line splitter (no embedded newlines in this file). */
function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(csvPath, "utf8").split("\n");
const header = splitCsv(lines[0]);
const col = (name) => header.indexOf(name);
const C = {
  hip: col("hip"), hd: col("hd"), bf: col("bf"), proper: col("proper"),
  ra: col("ra"), dec: col("dec"), dist: col("dist"),
  pmra: col("pmra"), pmdec: col("pmdec"), rv: col("rv"), mag: col("mag"),
  bayer: col("bayer"), id: col("id"),
};

const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const stars = {};
let used = 0;
const taken = new Set();

for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const f = splitCsv(lines[i]);
  const mag = Number(f[C.mag]);
  if (!Number.isFinite(mag) || mag > maxMag) continue;
  if (f[C.proper] === "Sol") continue; // the Sun is not a fixed star here

  // A stable, unique designation: proper name, else Bayer-Flamsteed, else
  // Hipparcos, else HD, else the catalog id.
  let key = f[C.proper] || f[C.bf] || (f[C.hip] && `HIP ${f[C.hip]}`)
    || (f[C.hd] && `HD ${f[C.hd]}`) || `HYG ${f[C.id]}`;
  key = key.trim();
  if (taken.has(key)) key = `${key} (${f[C.id]})`;
  taken.add(key);

  const dist = Number(f[C.dist]); // parsecs; 100000 marks unknown
  const plx = dist > 0 && dist < 100000 ? 1000 / dist : 0; // mas
  stars[key] = {
    ra: round(Number(f[C.ra]) * 15, 6), // hours -> degrees
    dec: round(Number(f[C.dec]), 6),
    pmra: round(Number(f[C.pmra]) || 0, 3),
    pmdec: round(Number(f[C.pmdec]) || 0, 3),
    rv: round(Number(f[C.rv]) || 0, 3),
    plx: round(plx, 4),
    mag: round(mag, 3),
    bayer: f[C.bayer] || "",
  };
  used++;
}

const pack = {
  provenance: `HYG database v4.1 (github.com/astronexus/HYG-Database, CC BY-SA 4.0): `
    + `all stars to magnitude ${maxMag}, ICRS J2000 with proper motions`,
  frame: "ICRS J2000.0",
  stars,
};
writeFileSync(outPath, JSON.stringify(pack));
const bytes = readFileSync(outPath).length;
console.log(`deep stars: ${used} stars to mag ${maxMag} -> ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
