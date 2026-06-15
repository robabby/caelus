#!/usr/bin/env npx tsx
/**
 * Planet-in-sign delineations from Llewellyn George's *A to Z Horoscope Maker
 * and Delineator*. The delineation text is core 1910 (first edition) content
 * and public domain, but it is sourced from the 1960 reprint scan we have, so
 * the records are tagged `gratis-not-pd` and kept in their own source for any
 * consumer who needs strict public-domain provenance to exclude them.
 *
 * Only the detailed natal block (Mercury..Neptune through the signs) is used --
 * Sun and Moon are already covered by clean public-domain sources, and the
 * book's earlier "in the signs" listing is a table of contents.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSigns } from "../lib/signs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/george-az-horoscope-delineator.txt");
const OUT = path.join(PKG_ROOT, "data/passages/george-signs.json");

// The detailed natal planet-in-sign block (Mercury..Neptune); avoids the table
// of contents and the example horoscopes.
const FROM = 22200;
const TO = 25720;

if (!fs.existsSync(SRC)) { console.error(`missing ${SRC} — run npm run fetch`); process.exit(1); }
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/).slice(FROM, TO);
const records = extractSigns(lines, {
  idPrefix: "george-signs",
  author: "Llewellyn George",
  work: "A to Z Horoscope Maker and Delineator",
  rights: "gratis-not-pd",
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
const planets = [...new Set(records.map((r) => (r.when as { body: string }).body))];
console.log(`wrote ${records.length} planet-in-sign passages (${planets.join(", ")}) → ${OUT}`);
