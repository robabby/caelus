#!/usr/bin/env npx tsx
/** Planet-in-house delineations from Alan Leo, *The Key to Your Own Nativity*
 *  (1910). Selector: `placement{ body, house }`. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractHouses } from "../lib/houses.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/alan-leo-key-to-own-nativity.txt");
const OUT = path.join(PKG_ROOT, "data/passages/alan-leo-key.json");

if (!fs.existsSync(SRC)) { console.error(`missing ${SRC} — run npm run fetch`); process.exit(1); }
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
const records = extractHouses(lines, {
  idPrefix: "alan-leo-key", author: "Alan Leo", work: "The Key to Your Own Nativity",
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
console.log(`wrote ${records.length} planet-in-house passages → ${OUT}`);
