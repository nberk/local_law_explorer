// Client-side data access for the /patterns explorer (the "horizontal" view of
// how local law works across towns). One small, committed national-aggregate
// file (public/data/patterns.json, built by scripts/build_patterns.py) plus the
// precomputed US state paths for the regional map (scripts/build-map-paths.mjs).
//
// Both are memoized module-level promises so the three /patterns islands share a
// single fetch each — the same pattern loadIndexClient uses.

export interface PrevalenceExample {
  name: string;
  id: string | null; // LOCUS jurisdiction id, or null when unresolved (plain text)
}

export interface PrevalenceSubject {
  key: string;
  label: string;
  cat: string; // category id (business, conduct, property, animals, …)
  share: number; // 0–1: fraction of substantive city codes with a rule
  q: string; // search term to seed the town page when a tile is clicked
  examples: PrevalenceExample[];
}

export interface Approach {
  id: string;
  name: string;
  blurb: string;
}

export interface ApproachLaw {
  approach: string; // Approach.id
  city: string;
  state: string;
  title: string;
  plain: string; // AI paraphrase — shown labeled, alongside the verbatim text
  text: string; // verbatim OCR'd ordinance text
}

export interface ApproachTopic {
  id: string;
  label: string;
  emoji: string;
  color: string;
  question: string;
  intro: string; // hand-authored, may contain light inline HTML (<em>)
  split: { a: [string, string]; b: [string, string] } | null;
  regional: string; // key into PatternsData.regional / regionalNotes
  approaches: Approach[];
  laws: ApproachLaw[];
}

export interface PatternsData {
  nCities: number;
  prevalence: PrevalenceSubject[];
  topics: ApproachTopic[];
  topicPrev: Record<string, number>;
  regional: Record<string, Record<string, number>>; // subject → state → share
  region: Record<string, string>; // state → NE | MW | S | W
  stateNames: Record<string, string>; // state → display name
  stateN: Record<string, number>; // state → sample size
  regionalNotes: Record<string, string>; // subject → the "why" prose
  labels: Record<string, string>; // subject → display label
}

export interface StatePaths {
  width: number;
  height: number;
  paths: Record<string, string>; // USPS code (lowercase) → SVG path d
}

// Presentation metadata for the §01 category filter. Colors are literal hex used
// in inline styles (not Tailwind classes), so they need no scanner-safe form.
export const CATEGORY_META: { id: string; label: string; color: string }[] = [
  { id: "business", label: "Business", color: "#6b62c8" },
  { id: "conduct", label: "Conduct", color: "#b4423a" },
  { id: "property", label: "Property", color: "#3f6d99" },
  { id: "animals", label: "Animals", color: "#b4532a" },
  { id: "recreation", label: "Recreation", color: "#c79434" },
  { id: "vice", label: "Vice & trades", color: "#8a5a9e" },
  { id: "modern", label: "Modern life", color: "#3f8a6e" },
];

export const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  CATEGORY_META.map((c) => [c.id, c.color]),
);

// §01 prevalence tiers. Thresholds chosen to match the standalone's grouping.
export const TIERS = [
  { id: "core", label: "The shared core", min: 0.6 },
  { id: "middle", label: "The optional middle", min: 0.4 },
  { id: "tail", label: "The long tail", min: 0 },
] as const;

export function tierOf(share: number): string {
  return TIERS.find((t) => share >= t.min)!.id;
}

// U.S. Census region labels for the §03 rollup.
export const REGION_LABEL: Record<string, string> = {
  NE: "Northeast",
  MW: "Midwest",
  S: "South",
  W: "West",
};

let patternsPromise: Promise<PatternsData> | null = null;
export function loadPatterns(): Promise<PatternsData> {
  if (!patternsPromise) {
    patternsPromise = fetch("/data/patterns.json").then((r) => {
      if (!r.ok) throw new Error(`patterns.json ${r.status}`);
      return r.json();
    });
  }
  return patternsPromise;
}

let statePathsPromise: Promise<StatePaths> | null = null;
export function loadStatePaths(): Promise<StatePaths> {
  if (!statePathsPromise) {
    statePathsPromise = fetch("/data/us-state-paths.json").then((r) => {
      if (!r.ok) throw new Error(`us-state-paths.json ${r.status}`);
      return r.json();
    });
  }
  return statePathsPromise;
}

// Sample-size-weighted average share per region, for a §03 subject. Used by the
// region rollup (robust to the map's partial state coverage).
export function regionAverages(
  regional: Record<string, number>,
  region: Record<string, string>,
  stateN: Record<string, number>,
): { region: string; share: number }[] {
  const agg: Record<string, [number, number]> = {
    NE: [0, 0],
    MW: [0, 0],
    S: [0, 0],
    W: [0, 0],
  };
  for (const st in regional) {
    const r = region[st];
    if (!agg[r]) continue;
    const n = stateN[st] ?? 0;
    agg[r][0] += regional[st] * n;
    agg[r][1] += n;
  }
  return Object.entries(agg)
    .map(([r, [sum, n]]) => ({ region: r, share: n ? sum / n : 0 }))
    .sort((a, b) => b.share - a.share);
}
