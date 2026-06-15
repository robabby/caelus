export type CorpusLayer = 1 | 2 | 3;

export type CorpusRights = "pd-us" | "cc0" | "gratis-not-pd";

/** Acquisition state of a source's local text. `needs-refetch` flags a file the
 *  fetch pipeline captured corrupt (e.g. an HTML wrapper) or only partially. */
export type SourceStatus = "ok" | "needs-refetch";

/** Build-time acquisition spec — how `scripts/fetch-sources.ts` obtains a text. */
export interface FetchSpec {
  url?: string;
  urls?: string[];
  stripGutenberg?: boolean;
  stripArchive?: boolean;
  sacredTextsIndex?: string;
}

export interface SourceManifestEntry {
  id: string;
  layer: CorpusLayer;
  title: string;
  author: string;
  year: number;
  tradition: string;
  rights: CorpusRights;
  file: string;
  /** Acquisition state; absent means `ok`. */
  status?: SourceStatus;
  /** How to (re)acquire the text; absent for already-vendored data. */
  fetch?: FetchSpec;
}

/** Serializable selector spec — resolved to Caelus selectors at extract/build time. */
export type SelectorSpec =
  | { kind: "placement"; body: string; sign?: string; house?: number; dignity?: string }
  | { kind: "aspect"; a: string; b: string; aspect: string; phase?: string }
  | { kind: "pattern"; pattern: string; body?: string }
  | { kind: "signature"; facet: string; value: string }
  | { kind: "angle"; angle: string; sign?: string };

export interface PassageRecord {
  id: string;
  when: SelectorSpec;
  atomIds: string[];
  text: string;
  tradition: string;
  source: { author: string; work: string; locus?: string };
  rights: CorpusRights;
  embed?: boolean;
}

export interface CorrespondenceEntry {
  path: string;
  body?: string;
  sign?: string;
  sephirah?: string;
  tarot?: string;
  greekGod?: string;
  romanGod?: string;
  metal?: string;
  element?: string;
  color?: string;
  source: { author: string; work: string; locus: string };
}

export interface CorrespondenceData {
  version: string;
  /** Provenance of the derived table (e.g. the open_777 transcription). */
  derivedFrom?: { repo?: string; url?: string; note?: string };
  correspondences: CorrespondenceEntry[];
}
