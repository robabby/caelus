#!/usr/bin/env npx tsx
/**
 * Extract rising-sign character delineations from Max Heindel's *The Message of
 * the Stars* (1919), "The Influence of the Twelve Signs". Each sign is headed
 * "Sign, the Symbol" and described as the ascending influence on body and
 * character, so the selector is `angle{ asc, sign }`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { denoise, excerpt } from "../lib/denoise.js";
import { SIGN_CANON } from "../lib/astro.js";
import type { PassageRecord } from "../../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/heindel-message-of-the-stars.txt");
const OUT = path.join(PKG_ROOT, "data/passages/heindel-rising.json");

const signs = Object.keys(SIGN_CANON).join("|");
const HEADER = new RegExp(`^\\s*(${signs}),\\s+the\\s+[A-Za-z]`, "i");
const DIVIDER = /^[A-Z][A-Z .,'-]{14,}$/;

if (!fs.existsSync(SRC)) { console.error(`missing ${SRC} — run npm run fetch`); process.exit(1); }
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);

// First occurrence of each sign's "Sign, the Symbol" header, in file order.
const heads: { idx: number; sign: string }[] = [];
const seen = new Set<string>();
lines.forEach((line, idx) => {
  const m = line.match(HEADER);
  if (!m) return;
  const sign = SIGN_CANON[m[1].toLowerCase()];
  if (seen.has(sign)) return;
  seen.add(sign);
  heads.push({ idx, sign });
});
heads.sort((a, b) => a.idx - b.idx);

const records: PassageRecord[] = [];
heads.forEach((head, h) => {
  // End at the next sign header, else the next section divider, else a cap.
  let end = h + 1 < heads.length ? heads[h + 1].idx : lines.length;
  if (h + 1 >= heads.length) {
    for (let j = head.idx + 1; j < Math.min(lines.length, head.idx + 140); j++) {
      if (DIVIDER.test(lines[j].trim())) { end = j; break; }
    }
  }
  const text = excerpt(denoise(lines.slice(head.idx + 1, end)));
  if (text.length < 80) return;
  records.push({
    id: `heindel-rising:asc-in-${head.sign.toLowerCase()}`,
    when: { kind: "angle", angle: "asc", sign: head.sign },
    atomIds: ["angle:asc"],
    text,
    tradition: "modern",
    source: {
      author: "Max Heindel and Augusta Foss Heindel",
      work: "The Message of the Stars",
      locus: `${head.sign} rising`,
    },
    rights: "pd-us",
    embed: true,
  });
});

records.sort((a, b) => a.id.localeCompare(b.id));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
console.log(`wrote ${records.length}/12 rising-sign passages → ${OUT}`);
