export type {
  CorpusLayer,
  CorpusRights,
  SourceStatus,
  FetchSpec,
  PassageRecord,
  SelectorSpec,
  SourceManifestEntry,
  CorrespondenceEntry,
  CorrespondenceData,
} from "./types.js";
export { corpusManifest, manifestByLayer } from "./manifest.js";
export {
  correspondences,
  correspondencesForBody,
  correspondencesForSign,
} from "./correspondences.js";
export { passages, passageSets } from "./passages.js";
export type { PassageSet } from "./passages.js";
export { selectorFromSpec, ruleFromPassage, compileSource } from "./compile.js";
export { sources, publicDomainSources, sourceById } from "./sources.js";
