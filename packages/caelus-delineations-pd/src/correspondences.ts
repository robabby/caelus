import correspondenceData from "../data/correspondences.json" with { type: "json" };
import type { CorrespondenceData, CorrespondenceEntry } from "./types.js";

export type { CorrespondenceData, CorrespondenceEntry } from "./types.js";

export const correspondences = correspondenceData as CorrespondenceData;

export function correspondencesForBody(body: string): CorrespondenceEntry[] {
  return correspondences.correspondences.filter((e) => e.body === body);
}

export function correspondencesForSign(sign: string): CorrespondenceEntry[] {
  return correspondences.correspondences.filter((e) => e.sign === sign);
}
