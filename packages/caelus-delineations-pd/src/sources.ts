/**
 * The public-domain interpretation corpus, ready for Caelus `interpret()`.
 *
 * One {@link InterpretationSource} per {@link PassageSet}, compiled from its
 * {@link PassageRecord}s. This is the package's headline export: drop `sources`
 * straight into `interpret(ctx, sources)` to turn a chart's fact atoms into a
 * ranked, cited reading drawn from public-domain astrology.
 */
import type { InterpretationSource } from "caelus";
import { passageSets } from "./passages.js";
import { compileSource } from "./compile.js";

export const sources: InterpretationSource[] = passageSets.map(
  (s) => compileSource(s.id, s.version, s.passages),
);

/** Sources built from public-domain passages only: `gratis-not-pd` records are
 *  dropped and any source left empty is omitted. Use this for a reading with
 *  strict public-domain provenance. */
export const publicDomainSources: InterpretationSource[] = passageSets
  .map((s) => ({ ...s, passages: s.passages.filter((p) => p.rights !== "gratis-not-pd") }))
  .filter((s) => s.passages.length > 0)
  .map((s) => compileSource(s.id, s.version, s.passages));

/** Look up a compiled source by its id. */
export function sourceById(id: string): InterpretationSource | undefined {
  return sources.find((s) => s.id === id);
}
