#!/usr/bin/env npx tsx
/** Planet-in-sign delineations from Alan Leo, *Astrology for All* (1910) -- the
 *  Sun and Moon through the signs. Selector: `placement{ body, sign }`. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSigns } from "../lib/signs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/alan-leo-astrology-for-all.txt");
const OUT = path.join(PKG_ROOT, "data/passages/alan-leo-signs.json");

if (!fs.existsSync(SRC)) { console.error(`missing ${SRC} — run npm run fetch`); process.exit(1); }
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
const records = extractSigns(lines, {
  idPrefix: "alan-leo-signs", author: "Alan Leo", work: "Astrology for All",
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
console.log(`wrote ${records.length} planet-in-sign passages → ${OUT}`);
