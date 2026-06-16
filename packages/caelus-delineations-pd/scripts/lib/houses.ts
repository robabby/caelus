/**
 * Generic planet-in-house extractor, shared by the Alan Leo books that head a
 * delineation "Planet in the Nth House" with the prose following inline.
 */
import { denoise, excerpt, sentenceStart } from "./denoise.js";
import { ordinalToNumber } from "./ordinal.js";
import { PLANET_TO_BODY } from "./astro.js";
import type { PassageRecord, CorpusRights } from "../../src/types.js";

const planets = Object.keys(PLANET_TO_BODY).join("|");
const HEADING = new RegExp(
  `^\\s*(?:The\\s+)?(${planets})\\s+in\\s+the\\s+([A-Za-z]+)\\s+House\\b(.*)$`,
  "i",
);
/** A section divider ("...IN THE TWELVE HOUSES", or a long all-caps title). */
const DIVIDER = /IN THE [A-Z]+ HOUSES|^[A-Z][A-Z .'-]{14,}$/;

const title = (s: string): string => s[0].toUpperCase() + s.slice(1);

export interface SourceMeta {
  idPrefix: string;
  author: string;
  work: string;
  /** Defaults to "pd-us". Use "gratis-not-pd" for a rights-encumbered scan. */
  rights?: CorpusRights;
}

/** Extract planet-in-house PassageRecords from `lines`. */
export function extractHouses(lines: string[], source: SourceMeta): PassageRecord[] {
  const records: PassageRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (!m) continue;
    const body = PLANET_TO_BODY[m[1].toLowerCase()];
    const house = ordinalToNumber(m[2]);
    if (house === null) continue;

    const block = [m[3]];
    for (let j = i + 1; j < lines.length; j++) {
      if (HEADING.test(lines[j]) || DIVIDER.test(lines[j].trim())) break;
      block.push(lines[j]);
    }
    const text = excerpt(sentenceStart(denoise(block)));
    if (text.length < 80) continue;

    const key = `${body}:${house}`;
    if (seen.has(key)) continue; // keep the first, fullest treatment
    seen.add(key);
    records.push({
      id: `${source.idPrefix}:${body}-in-house-${house}`,
      when: { kind: "placement", body, house },
      atomIds: [`placement:${body}`],
      text,
      tradition: "modern",
      source: {
        author: source.author,
        work: source.work,
        locus: `${title(body)} in the ${m[2].toLowerCase()} house`,
      },
      rights: source.rights ?? "pd-us",
      embed: true,
    });
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  return records;
}
