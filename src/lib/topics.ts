// Topic + lens presentation, shared by Astro components and React islands.

export const TOPICS = ["Zoning", "Nuisance", "Buildings", "Business", "Other"] as const;
export type Topic = (typeof TOPICS)[number];

// Badge classes (literal strings so Tailwind's scanner picks them up).
export const TOPIC_BADGE: Record<string, string> = {
  Zoning: "bg-accent-100 text-accent-700",
  Buildings: "bg-accent-50 text-accent-600",
  Business: "bg-ink-100 text-ink-700",
  Nuisance: "bg-ink-200 text-ink-800",
  Other: "bg-ink-50 text-ink-500",
};

// Bar/segment colors for the topic-composition histogram.
export const TOPIC_COLOR: Record<string, string> = {
  Zoning: "#3d63b3",
  Buildings: "#9eb4dd",
  Business: "#535349",
  Nuisance: "#8a8a82",
  Other: "#d8d8d4",
};

export const LENSES = [
  {
    id: "everyday",
    label: "Everyday rules",
    blurb: "The local rules that shape daily life here. Filter by topic or search a term.",
  },
  {
    id: "business",
    label: "Starting a business",
    blurb: "Licensing, permits, fees, and zoning to check before you open.",
  },
  {
    id: "renting",
    label: "Renting & property",
    blurb: "Noise, nuisance, occupancy, and property-upkeep rules.",
  },
] as const;

export type LensId = (typeof LENSES)[number]["id"];

// Opacity z-score above which we flag a law as densely written.
export const OPACITY_FLAG = 1.0;

export interface LawScores {
  opacity: number | null;
  paternalism: number | null;
  enforcement_discretion: number | null;
  problem_salience: number | null;
}

export interface Law {
  id: string;
  title: string;
  section: string | null;
  topic: string;
  function: string;
  lenses: LensId[];
  scores: LawScores;
  content: string;
}

export interface Jurisdiction {
  id: string;
  name: string;
  state: string;
  stateName: string;
  type: string;
  laws: Law[];
}

export interface JurisdictionSummary {
  id: string;
  name: string;
  state: string;
  stateName: string;
  type: string;
  counts: Record<string, number>;
  medianOpacity: number | null;
  size: "large" | "small";
}

// Best-effort link to the official code (the corpus has no source URLs).
export function sourceSearchUrl(
  jurisName: string,
  stateName: string,
  law: Pick<Law, "section" | "title">,
): string {
  const ref = law.section ? `"${law.section}"` : law.title;
  const q = `${jurisName} ${stateName} municipal code ${ref}`;
  return "https://www.google.com/search?q=" + encodeURIComponent(q);
}
