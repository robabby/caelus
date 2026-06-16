/**
 * Public-domain-only corpus build — a rights-clean entry point.
 *
 * Imports only the public-domain passage sets (no `gratis-not-pd` content), so a
 * bundler that pulls this module never includes George's encumbered text. The
 * website imports `publicDomainSources` from here; Node consumers can use the
 * runtime-filtered `publicDomainSources` from the package root instead.
 */
import saintGermain from "../data/passages/saint-germain.json" with { type: "json" };
import alanLeoSigns from "../data/passages/alan-leo-signs.json" with { type: "json" };
import alanLeoKey from "../data/passages/alan-leo-key.json" with { type: "json" };
import alanLeoJudge from "../data/passages/alan-leo-judge.json" with { type: "json" };
import heindelAspects from "../data/passages/heindel-aspects.json" with { type: "json" };
import heindelRising from "../data/passages/heindel-rising.json" with { type: "json" };
import robsonStars from "../data/passages/robson-stars.json" with { type: "json" };
import type { InterpretationSource } from "caelus";
import type { PassageRecord } from "./types.js";
import { compileSource } from "./compile.js";

const pdSets: { id: string; version: string; passages: PassageRecord[] }[] = [
  { id: "saint-germain-practical-astrology", version: "0.1.0", passages: saintGermain as PassageRecord[] },
  { id: "alan-leo-astrology-for-all", version: "0.1.0", passages: alanLeoSigns as PassageRecord[] },
  { id: "alan-leo-key-to-own-nativity", version: "0.1.0", passages: alanLeoKey as PassageRecord[] },
  { id: "alan-leo-how-to-judge-nativity", version: "0.1.0", passages: alanLeoJudge as PassageRecord[] },
  {
    id: "heindel-message-of-the-stars",
    version: "0.1.0",
    passages: [...heindelAspects, ...heindelRising] as PassageRecord[],
  },
  { id: "robson-fixed-stars", version: "0.1.0", passages: robsonStars as PassageRecord[] },
];

/** Public-domain delineation sources, ready for `interpret(ctx, sources)`. */
export const publicDomainSources: InterpretationSource[] = pdSets.map(
  (s) => compileSource(s.id, s.version, s.passages),
);

/** Every public-domain passage, flattened. */
export const publicDomainPassages: PassageRecord[] = pdSets.flatMap((s) => s.passages);
