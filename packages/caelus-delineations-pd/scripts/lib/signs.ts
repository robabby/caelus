/**
 * Generic planet-in-sign extractor for books that head each delineation
 * "PLANET IN SIGN" on its own line (often repeated as a running page header
 * through the section, which we de-duplicate).
 */
import { denoise, excerpt, stripCipher, sentenceStart } from "./denoise.js";
import { PLANET_TO_BODY, SIGN_CANON } from "./astro.js";
import type { PassageRecord } from "../../src/types.js";
import type { SourceMeta } from "./houses.js";

const planets = Object.keys(PLANET_TO_BODY).join("|");
const signs = Object.keys(SIGN_CANON).join("|");
// Leading whitespace or stray OCR punctuation, then "Planet in Sign".
const HEADING = new RegExp(
  `^[\\s.,•\\-]*(?:The\\s+)?(${planets})\\s+in\\s+(${signs})\\b(.*)$`,
  "i",
);

const title = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Extract planet-in-sign PassageRecords from `lines`. */
export function extractSigns(lines: string[], source: SourceMeta): PassageRecord[] {
  // Index every heading line with its (body, sign) key.
  const heads: { idx: number; key: string; body: string; sign: string }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(HEADING);
    if (!m) return;
    const body = PLANET_TO_BODY[m[1].toLowerCase()];
    const sign = SIGN_CANON[m[2].toLowerCase()];
    heads.push({ idx, key: `${body}:${sign}`, body, sign });
  });

  const records: PassageRecord[] = [];
  const seen = new Set<string>();
  for (let h = 0; h < heads.length; h++) {
    const head = heads[h];
    if (seen.has(head.key)) continue; // first occurrence owns the section
    seen.add(head.key);
    // Section ends at the next heading with a different key (same-key headings
    // in between are running page headers within this section).
    let endIdx = lines.length;
    for (let k = h + 1; k < heads.length; k++) {
      if (heads[k].key !== head.key) { endIdx = heads[k].idx; break; }
    }
    // Body lines, dropping any heading line (the running headers).
    const block = lines.slice(head.idx + 1, endIdx).filter((l) => !HEADING.test(l));
    const text = excerpt(sentenceStart(stripCipher(denoise(block))));
    if (text.length < 80) continue;

    records.push({
      id: `${source.idPrefix}:${head.body}-in-${head.sign.toLowerCase()}`,
      when: { kind: "placement", body: head.body, sign: head.sign },
      atomIds: [`placement:${head.body}`],
      text,
      tradition: "modern",
      source: {
        author: source.author,
        work: source.work,
        locus: `${title(head.body)} in ${head.sign}`,
      },
      rights: source.rights ?? "pd-us",
      embed: true,
    });
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  return records;
}
