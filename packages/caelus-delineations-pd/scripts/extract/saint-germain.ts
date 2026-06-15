#!/usr/bin/env npx tsx
/**
 * Extract the twelve Sun-sign character delineations from Comte de
 * Saint-Germain's *Practical Astrology* (1901) into PassageRecords.
 *
 * The book enumerates each sign as a section headed `N. SIGN. (The ...)` and
 * frames it by the solar birth window ("exerts its influence from March 21 to
 * April 19"), i.e. a Sun-in-sign delineation. We locate the twelve headers
 * deterministically, de-noise the section, and emit one PassageRecord per sign
 * whose selector is `placement{ body: "sun", sign }`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { denoise, excerpt } from "../lib/denoise.js";
import type { PassageRecord } from "../../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PKG_ROOT, "sources/text/saint-germain-practical-astrology.txt");
const OUT = path.join(PKG_ROOT, "data/passages/saint-germain.json");

const SIGNS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
] as const;

const title = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** A section header line: `<num>. SIGN. (The ...)`. */
const HEADER = new RegExp(
  `^\\s*(?:[\\dIVXLlo]{1,4}[.\\s]+)?\\s*(${SIGNS.join("|").toUpperCase()})\\.?\\s*\\(\\s*[Tt]he`,
);

function main(): void {
  if (!fs.existsSync(SRC)) {
    console.error(`missing ${SRC} — run npm run fetch first`);
    process.exit(1);
  }
  const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);

  // Find the first header line for each sign (in file order).
  const anchors: { sign: string; line: number }[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const m = line.match(HEADER);
    if (!m) return;
    const sign = m[1].toLowerCase();
    if (seen.has(sign)) return;
    seen.add(sign);
    anchors.push({ sign, line: i });
  });
  anchors.sort((a, b) => a.line - b.line);

  const records: PassageRecord[] = [];
  for (let k = 0; k < anchors.length; k++) {
    const { sign, line } = anchors[k];
    const end = k + 1 < anchors.length ? anchors[k + 1].line : lines.length;
    const body = denoise(lines.slice(line + 1, end));
    const text = excerpt(body);
    if (text.length < 80) continue; // skip a section the OCR mangled past use
    records.push({
      id: `saint-germain:sun-in-${sign}`,
      // Sign string must match the engine's casing (`chart.ts` SIGNS), or the
      // selector never matches a real chart's placement atom.
      when: { kind: "placement", body: "sun", sign: title(sign) },
      atomIds: ["placement:sun"],
      text,
      tradition: "modern",
      source: {
        author: "Comte de Saint-Germain",
        work: "Practical Astrology",
        locus: `Sun in ${title(sign)} (sign section)`,
      },
      rights: "pd-us",
      embed: true,
    });
  }

  records.sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + "\n");
  const missing = SIGNS.filter((s) => !records.some((r) => r.id.endsWith(s)));
  console.log(`wrote ${records.length}/12 Sun-sign passages → ${OUT}`);
  if (missing.length) console.warn(`  missing signs: ${missing.join(", ")}`);
}

main();
