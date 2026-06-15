/**
 * The compiled passage corpus: extracted {@link PassageRecord}s grouped by the
 * work they came from. Each set becomes one {@link InterpretationSource}, so a
 * reading can attribute and reconcile claims per source.
 *
 * Sets are added here as their extractors land (see `scripts/extract/*`).
 */
import saintGermain from "../data/passages/saint-germain.json" with { type: "json" };
import alanLeoKey from "../data/passages/alan-leo-key.json" with { type: "json" };
import alanLeoJudge from "../data/passages/alan-leo-judge.json" with { type: "json" };
import alanLeoSigns from "../data/passages/alan-leo-signs.json" with { type: "json" };
import type { PassageRecord } from "./types.js";

export interface PassageSet {
  /** Stable source id, used as the {@link InterpretationSource.id}. */
  id: string;
  version: string;
  passages: PassageRecord[];
}

export const passageSets: PassageSet[] = [
  {
    id: "saint-germain-practical-astrology",
    version: "0.1.0",
    passages: saintGermain as PassageRecord[],
  },
  {
    id: "alan-leo-astrology-for-all",
    version: "0.1.0",
    passages: alanLeoSigns as PassageRecord[],
  },
  {
    id: "alan-leo-key-to-own-nativity",
    version: "0.1.0",
    passages: alanLeoKey as PassageRecord[],
  },
  {
    id: "alan-leo-how-to-judge-nativity",
    version: "0.1.0",
    passages: alanLeoJudge as PassageRecord[],
  },
];

/** Every passage across all sets, flattened. */
export const passages: PassageRecord[] = passageSets.flatMap((s) => s.passages);
