#!/usr/bin/env node
/**
 * Build the constellation figure pack: the conventional stick-figure lines and
 * labels for the 88 constellations, projected for SkyView overlays. Source is
 * d3-celestial (github.com/ofrohn/d3-celestial, BSD-3), IAU modern sky culture,
 * which gives the lines as RA/Dec (J2000). This converts each vertex to
 * ecliptic J2000 (lon, lat), so at render time SkyView only precesses to the
 * date and projects. Small (~40 KB), so it is bundled for the browser too.
 *
 *   node scripts/build-constellations.mjs
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data";
const linesPath = "/tmp/constellations.lines.json";
const namesPath = "/tmp/constellations.json";
const outPath = join(ROOT, "packages/caelus/data/constellations.json");

for (const [p, name] of [[linesPath, "constellations.lines.json"], [namesPath, "constellations.json"]]) {
  if (!existsSync(p)) execFileSync("curl", ["-sSL", "--max-time", "60", "-o", p, `${BASE}/${name}`]);
}

const DEG = Math.PI / 180;
const E0 = 23.4392911 * DEG; // J2000 mean obliquity
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** RA/Dec (deg, J2000) -> ecliptic J2000 [lon, lat] in degrees. */
function eqToEcl(raDeg, decDeg) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const y2 = y * Math.cos(E0) + z * Math.sin(E0);
  const z2 = -y * Math.sin(E0) + z * Math.cos(E0);
  let lon = Math.atan2(y2, x) / DEG;
  if (lon < 0) lon += 360;
  return [r6(lon), r6(Math.asin(Math.max(-1, Math.min(1, z2))) / DEG)];
}

const linesGeo = JSON.parse(readFileSync(linesPath, "utf8"));
const namesGeo = JSON.parse(readFileSync(namesPath, "utf8"));

const lines = linesGeo.features.map((f) => {
  // MultiLineString: array of polylines, each an array of [ra, dec].
  const segs = f.geometry.coordinates.map((seg) => seg.map(([ra, dec]) => eqToEcl(ra, dec)));
  return { con: f.id, segs };
});

const labels = namesGeo.features.map((f) => {
  const [ra, dec] = f.geometry.coordinates; // Point
  const [lon, lat] = eqToEcl(ra, dec);
  // Latin name (Cancer, Gemini, Orion) is the astronomical standard.
  return { name: f.properties.la || f.properties.name || f.properties.en || f.id, con: f.id, lon, lat };
});

const pack = {
  provenance: "Constellation figures from d3-celestial (github.com/ofrohn/d3-celestial, "
    + "BSD-3), IAU modern sky culture; vertices as ecliptic J2000 (lon, lat) degrees",
  lines,
  labels,
};
writeFileSync(outPath, JSON.stringify(pack));
const kb = (readFileSync(outPath).length / 1024).toFixed(0);
console.log(`constellations: ${lines.length} figures, ${labels.length} labels -> ${outPath} (${kb} KB)`);
