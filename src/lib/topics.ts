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

// --- Place Portrait (how a town compares to the rest of the US) ------------
// Percentiles and sentences are precomputed in the pipeline against national
// baselines. The four dimensions are machine estimates, never asserted as fact.
export interface PortraitDimension {
  key: "opacity" | "paternalism" | "enforcement_discretion" | "problem_salience";
  percentile: number;
  displayPercentile?: number; // opacity is shown as "plainness" (100 - percentile)
  sentence: string | null;
  estimate: true;
  verifyCopy?: boolean; // problem_salience: meaning unverified vs the paper -> hide
}

export interface PortraitTopic {
  topic: string;
  share: number;
  percentile: number;
  sentence: string;
}

export interface Portrait {
  lawCount: number;
  lowConfidence: boolean; // very few laws -> comparisons are rough
  limitedCoverage: boolean; // corpus skewed to charter/admin, not the live code
  headline: string;
  dimensions: PortraitDimension[];
  topicMix: PortraitTopic[];
}

export interface QuestionMatch {
  id: string; // matches a QUESTIONS_META id
  matches: string[]; // law ids, resolved against Jurisdiction.laws
}

export interface NotableRef {
  id: string; // law id
  reason: string; // a NOTABLE_REASON_LABEL key
}

export interface Jurisdiction {
  id: string;
  name: string;
  state: string;
  stateName: string;
  type: string;
  portrait: Portrait;
  questions: QuestionMatch[];
  notable: NotableRef[];
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
  portraitTeaser?: { headline: string; lowConfidence: boolean };
}

// Display metadata for the common-questions lens. Keep ids in sync with the
// QUESTIONS list in pipeline/build.py.
export const QUESTIONS_META: { id: string; label: string; question: string }[] = [
  { id: "backyard_chickens", label: "Chickens & bees", question: "Can I keep chickens or bees?" },
  { id: "noise_hours", label: "Noise", question: "What are the noise and quiet-hours rules?" },
  { id: "street_parking_rv", label: "RV / boat parking", question: "Can I park an RV, boat, or trailer on the street?" },
  { id: "fence_shed_permit", label: "Fences & sheds", question: "Do I need a permit for a fence or shed?" },
  { id: "short_term_rental", label: "Short-term rentals", question: "Can I run a short-term rental?" },
  { id: "yard_sale", label: "Yard sales", question: "Are there rules for yard and garage sales?" },
  { id: "backyard_fire", label: "Backyard fires", question: "Can I have a backyard fire or fire pit?" },
  { id: "dogs_pets", label: "Dogs & pets", question: "What are the rules for dogs and pets?" },
  { id: "grass_weeds", label: "Weeds & grass", question: "Do I have to cut weeds and tall grass?" },
  { id: "sidewalk_snow", label: "Snow & sidewalks", question: "Must I clear snow from my sidewalk?" },
  { id: "signs", label: "Signs", question: "What are the rules for signs and banners?" },
  { id: "home_business", label: "Home business", question: "Can I run a business from home?" },
];

export const NOTABLE_REASON_LABEL: Record<string, string> = {
  animals: "Animals",
  recreation: "Recreation & events",
  conduct: "Public conduct",
  tech: "Drones & tech",
  vice: "Vice & licensing",
  vending: "Street vending",
  property: "Property",
};

// Administrative/ceremonial boilerplate. Mirrors the _BOILERPLATE regex in
// pipeline/build.py. In the client browse view we additionally treat topic
// "Other" as boilerplate to sink it; the pipeline does not (notable rules are
// often "Other"). Single source of truth for the regex lives here.
export const BOILERPLATE =
  /(municipal flag|city flag|official flag|corporate seal|city seal|official seal|seal and emblem|coat of arms|\bpennant\b|decorations on public|honorary|commemorat|naming and renaming|municipal device|code revision|numbering of code|references? to (the )?(former|section))/i;

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
