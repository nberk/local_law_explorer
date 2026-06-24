// Client-side global search helpers: the metadata row shape, the instant lexical
// ranker, and small utilities shared by GlobalSearch and its Web Worker.
//
// Two layers run here. The LEXICAL layer (below) scores the metadata rows by
// keyword overlap and renders instantly — both while the semantic query vector
// is in flight and as the fallback if the embed function is down. The SEMANTIC
// layer (cosine over the int8 vectors) lives in searchWorker.ts. Neither layer
// ever rewrites ordinance text; results are the real laws, ranked.

import { SEARCH_SYNONYMS } from "./topics";

// One row of public/data/search/meta.json — index-aligned with vectors.bin.
export interface SearchMeta {
  i: number;
  id: string; // law id
  jId: string; // jurisdiction id, e.g. "ca/san_francisco"
  name: string; // jurisdiction display name
  state: string; // 2-letter
  title: string;
  section: string | null;
  topic: string;
  snippet: string;
}

export interface SearchManifest {
  count: number;
  dim: number;
  model: string;
  quant: string;
}

export interface RankedResult extends SearchMeta {
  score: number;
}

const STOP = new Set([
  "a", "an", "the", "i", "can", "do", "my", "is", "are", "to", "for", "of",
  "in", "on", "at", "and", "or", "what", "where", "how", "when", "with", "me",
  "any", "there", "rules", "rule", "about", "need", "have", "get",
]);

/** Expand a free-text query into the keyword set the lexical layer matches. */
export function expandQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const terms = new Set<string>(words);
  for (const w of words) {
    for (const [key, syns] of Object.entries(SEARCH_SYNONYMS)) {
      if (w === key || w.startsWith(key) || key.startsWith(w)) {
        syns.forEach((s) => terms.add(s));
      }
    }
  }
  return [...terms];
}

/**
 * Instant keyword ranking over the metadata rows. Title hits outweigh snippet
 * hits (an incidental body mention must not outrank the on-topic law).
 */
export function lexicalRank(
  meta: SearchMeta[],
  query: string,
  topK = 30,
): RankedResult[] {
  const terms = expandQuery(query);
  if (terms.length === 0) return [];
  const scored: RankedResult[] = [];
  for (const m of meta) {
    const title = m.title.toLowerCase();
    const snippet = m.snippet.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += title.startsWith(t) ? 5 : 3;
      else if (snippet.includes(t)) score += 1;
    }
    if (score > 0) scored.push({ ...m, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
