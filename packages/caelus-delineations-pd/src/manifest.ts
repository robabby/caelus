import manifest from "../sources/manifest.json" with { type: "json" };
import type { SourceManifestEntry } from "./types.js";

export type { SourceManifestEntry } from "./types.js";

export const corpusManifest = manifest as SourceManifestEntry[];

export function manifestByLayer(layer: 1 | 2 | 3): SourceManifestEntry[] {
  return corpusManifest.filter((e) => e.layer === layer);
}
