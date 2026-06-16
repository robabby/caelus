/**
 * Generic planet-aspect-planet extractor for books that head each delineation
 * "PlanetA <aspect words> to PlanetB" (Heindel groups benefic and malefic
 * aspects, e.g. "sextile or trine", so one paragraph yields a record per named
 * aspect that the engine knows). "parallel" is a declination aspect Caelus does
 * not model, so it is dropped.
 */
import { denoise, excerpt, stripCipher, sentenceStart } from "./denoise.js";
import { PLANET_TO_BODY } from "./astro.js";
import type { PassageRecord } from "../../src/types.js";
import type { SourceMeta } from "./houses.js";

const ENGINE_ASPECTS = ["conjunction", "sextile", "square", "trine", "opposition"];
const ASPECT_WORDS = [...ENGINE_ASPECTS, "parallel"];

const planets = Object.keys(PLANET_TO_BODY).join("|");
const phrase = `(?:(?:${ASPECT_WORDS.join("|")})(?:\\s*,?\\s*(?:or\\s+)?)?)+`;
const HEADING = new RegExp(
  `(?:The\\s+)?(${planets})\\s+(${phrase})\\s+to\\s+(?:the\\s+)?(${planets})\\b`,
  "i",
);
const title = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Canonical aspects named in a phrase, in engine vocabulary, deduped. */
function aspectsIn(p: string): string[] {
  const found = p.toLowerCase().match(/conjunction|sextile|square|trine|opposition/g) ?? [];
  return [...new Set(found)];
}

/** Extract planet-aspect-planet PassageRecords from `lines`. */
export function extractAspects(lines: string[], source: SourceMeta): PassageRecord[] {
  // Locate entry headers: a planet-aspect-planet phrase near the line start
  // (after any leading glyph cipher), so a mid-paragraph mention is not a head.
  const heads: { idx: number; a: string; b: string; aspects: string[] }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(HEADING);
    if (!m || (m.index ?? 0) > 28) return;
    const a = PLANET_TO_BODY[m[1].toLowerCase()];
    const b = PLANET_TO_BODY[m[3].toLowerCase()];
    if (a === b) return;
    const aspects = aspectsIn(m[2]);
    if (!aspects.length) return;
    heads.push({ idx, a, b, aspects });
  });

  const records: PassageRecord[] = [];
  const seen = new Set<string>();
  heads.forEach((head, h) => {
    const end = h + 1 < heads.length ? heads[h + 1].idx : lines.length;
    // Drop the matched header and any leading glyph cipher from the first line.
    const firstLine = stripCipher(lines[head.idx].replace(HEADING, ""));
    const text = excerpt(sentenceStart(denoise([firstLine, ...lines.slice(head.idx + 1, end)])));
    if (text.length < 80) return;

    const [x, y] = [head.a, head.b].sort();
    for (const aspect of head.aspects) {
      const key = `${x}~${y}:${aspect}`;
      if (seen.has(key)) continue; // first treatment wins
      seen.add(key);
      records.push({
        id: `${source.idPrefix}:${x}-${aspect}-${y}`,
        when: { kind: "aspect", a: head.a, b: head.b, aspect },
        atomIds: [`aspect:${x}~${y}:${aspect}`],
        text,
        tradition: "modern",
        source: {
          author: source.author,
          work: source.work,
          locus: `${title(head.a)} ${aspect} ${title(head.b)}`,
        },
        rights: "pd-us",
        embed: true,
      });
    }
  });
  records.sort((a, b) => a.id.localeCompare(b.id));
  return records;
}
