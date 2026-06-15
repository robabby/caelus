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
import heindelAspects from "../data/passages/heindel-aspects.json" with { type: "json" };
import heindelRising from "../data/passages/heindel-rising.json" with { type: "json" };
import robsonStars from "../data/passages/robson-stars.json" with { type: "json" };
import georgeSigns from "../data/passages/george-signs.json" with { type: "json" };
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
  {
    id: "heindel-message-of-the-stars",
    version: "0.1.0",
    passages: [...heindelAspects, ...heindelRising] as PassageRecord[],
  },
  {
    id: "robson-fixed-stars",
    version: "0.1.0",
    passages: robsonStars as PassageRecord[],
  },
  // Segregated: rights "gratis-not-pd". Filter this source out (by id, or by the
  // passages' rights) for a strict public-domain-only reading.
  {
    id: "george-az-horoscope-delineator",
    version: "0.1.0",
    passages: georgeSigns as PassageRecord[],
  },
];

/** Every passage across all sets, flattened. */
export const passages: PassageRecord[] = passageSets.flatMap((s) => s.passages);
