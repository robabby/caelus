/**
 * Ordinal-word -> number (1..12) with OCR tolerance.
 *
 * The scanned texts head sections "in the Fourth House", but the OCR mangles
 * some ("rourtii", "eichth", "tivelfth"). We match the cleaned token to the
 * nearest canonical ordinal by edit distance, refusing an ambiguous one so a
 * house is never mis-numbered.
 */
const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth",
  "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
];

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Resolve an ordinal word to a house number, or null when no canonical ordinal
 * is close enough (edit distance <= 2) to be unambiguous.
 */
export function ordinalToNumber(word: string): number | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return null;
  let best = -1;
  let bestDist = Infinity;
  let runnerUp = Infinity;
  ORDINALS.forEach((o, i) => {
    const d = editDistance(w, o);
    if (d < bestDist) { runnerUp = bestDist; bestDist = d; best = i; }
    else if (d < runnerUp) { runnerUp = d; }
  });
  // Accept only a clearly-closest, near-exact match.
  if (bestDist <= 2 && bestDist < runnerUp) return best + 1;
  return null;
}
