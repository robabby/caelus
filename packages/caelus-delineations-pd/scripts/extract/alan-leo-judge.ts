#!/usr/bin/env npx tsx
/** Planet-in-house delineations from Alan Leo, *How to Judge a Nativity*
 *  (1908). Selector: `placement{ body, house }`. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractHouses } from "../lib/houses.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/alan-leo-how-to-judge-nativity.txt");
const OUT = path.join(PKG_ROOT, "data/passages/alan-leo-judge.json");

if (!fs.existsSync(SRC)) { console.error(`missing ${SRC} — run npm run fetch`); process.exit(1); }
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
const records = extractHouses(lines, {
  idPrefix: "alan-leo-judge", author: "Alan Leo", work: "How to Judge a Nativity",
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
console.log(`wrote ${records.length} planet-in-house passages → ${OUT}`);
