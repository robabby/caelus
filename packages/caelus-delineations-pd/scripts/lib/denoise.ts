/**
 * Shared OCR de-noising helpers for the extraction pipeline.
 *
 * The public-domain source scans (Internet Archive / Project Gutenberg) carry
 * the usual OCR debris: doubled spaces, line-break hyphenation, running page
 * headers, and stray glyphs. These helpers turn a raw section into a faithful,
 * readable passage without rewriting the author's words -- extraction must stay
 * traceable to the source, so we clean layout, never content.
 */

/** Lines that are running heads / page furniture, not prose. */
const FURNITURE = [
  /^\s*\d{1,3}\s+[A-Z][A-Z .]{2,}$/, // "24  ASTROLOGY"
  /^\s*[A-Z][A-Z .]{2,}\s+\d{1,3}\s*$/, // "SIGNS OF THE ZODIAC 25"
  /^\s*SIGNS\s+OF\s+THE\s+ZODIAC\s*$/i,
  /^\s*ASTROLOGY\s*$/i,
  /^\s*\d{1,4}\s*$/, // bare page numbers
  /^[\s\W\d]{0,8}$/, // empty / pure punctuation-glyph lines
];

/** True for a line that is page furniture rather than prose. */
export function isFurniture(line: string): boolean {
  return FURNITURE.some((re) => re.test(line));
}

/**
 * Collapse a block of OCR lines into a single clean paragraph string: drop page
 * furniture, repair end-of-line hyphenation, and normalize whitespace.
 */
export function denoise(lines: string[]): string {
  const kept = lines.filter((l) => !isFurniture(l));
  let text = kept.join("\n");
  // Repair "enterpris-\ning" and "disagree- ments" -> rejoin the split word.
  text = text.replace(/(\w)[-—]\s*\n\s*(\w)/g, "$1$2");
  text = text.replace(/(\w)-\s+(\w)/g, "$1$2");
  // Newlines become spaces; collapse runs of whitespace.
  text = text.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ");
  // Tidy spacing around punctuation the OCR scattered.
  text = text.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ");
  return text.trim();
}

/**
 * Trim a long passage to a representative excerpt: keep whole sentences up to
 * `max` characters so a citation is self-contained, never cut mid-word.
 */
export function excerpt(text: string, max = 900): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "));
  return (lastStop > max * 0.5 ? slice.slice(0, lastStop + 1) : slice).trim();
}
