import type { Candidate } from "./types";
import { rank } from "./text";

/**
 * Pluggable fuzzy-resolution backend.
 *
 * Only `rules` is implemented: local trigram similarity (same maths as pg_trgm), fully
 * deterministic, no network. An LLM-backed suggester can be added behind this interface
 * later; until the stakeholder approves sending planning data to a model provider,
 * nothing leaves the machine. See docs/REMARKS.md.
 */
export interface Suggester {
  readonly name: string;
  suggest<T>(query: string, candidates: { value: T; label: string }[], threshold: number): Candidate<T>[];
}

export const rulesSuggester: Suggester = {
  name: "rules",
  suggest: (query, candidates, threshold) => rank(query, candidates, threshold, 5),
};

export const noneSuggester: Suggester = {
  name: "none",
  suggest: () => [],
};

export function getSuggester(): Suggester {
  const which = (process.env.INJECT_SUGGESTER ?? "rules").toLowerCase();
  if (which === "none") return noneSuggester;
  return rulesSuggester;
}
