// Client-side data access for the full rollout (see docs/full-rollout.md).
//
// Two distinct origins:
//   * The small `index.json` manifest stays a static file on the Pages origin
//     (committed), fetched here ONCE and shared across the homepage islands so a
//     ~2,000-entry array is never inlined into every page's HTML.
//   * The large per-jurisdiction files live in R2 and are fetched from
//     DATA_BASE_URL by JurisdictionModules / LawBrowser.
//
// Per-jurisdiction files live in R2 (public bucket `locallaw-data`). The base URL
// is baked in at build time: production builds (`astro build`, PROD=true) default
// to the R2 public URL so deploys stay purely git-driven (no dashboard env var);
// local dev (PROD=false) uses "/data" so the committed pilots work offline. Set
// PUBLIC_DATA_BASE_URL to override either (it's a public URL, not a secret).
import type { JurisdictionSummary } from "./topics";

// R2 public bucket URL + the `data/` prefix the upload uses. See docs/full-rollout.md.
const R2_DATA_URL = "https://pub-1c46fab60fd64b25b84391aef5a9e013.r2.dev/data";

// Trailing slash trimmed so `${BASE}/${id}.json` is always well-formed.
export const DATA_BASE_URL = (
  import.meta.env.PUBLIC_DATA_BASE_URL ??
  (import.meta.env.PROD ? R2_DATA_URL : "/data")
).replace(/\/$/, "");

export interface CorpusStats {
  total_laws: number;
  states: number;
  cities: number;
  counties: number;
  topics: string[];
}

export interface IndexFile {
  corpus: CorpusStats;
  jurisdictions: JurisdictionSummary[];
}

// The manifest stays on the static origin (NOT R2): it's small, committed, and
// needed by several islands. Memoized so the homepage's two islands share one
// request.
let indexPromise: Promise<IndexFile> | null = null;
export function loadIndexClient(): Promise<IndexFile> {
  if (!indexPromise) {
    indexPromise = fetch("/data/index.json").then((r) => {
      if (!r.ok) throw new Error(`index.json ${r.status}`);
      return r.json();
    });
  }
  return indexPromise;
}
