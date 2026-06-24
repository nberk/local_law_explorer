# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local Law Lookup — a free, non-commercial static site that turns the open
**LOCUS-v1** local-ordinance corpus into plain, readable city/county law for
ordinary people. Live at https://locallaw.pages.dev. Each jurisdiction page opens
with a synthesized **Place Portrait** (how this town governs vs. the rest of the
US), then everyday "Can I…?" questions, then notable rules, and only then a full
searchable browse ("dig deeper"). Two site-level views round it out: `/rankings`
(pilots on the national scale) and `/legalese` (a playful opacity meter). Pilot
covers **19 jurisdictions**. Not legal advice; the text is OCR'd and every
label/score is a machine estimate.

## Commands

```bash
bun install                 # deps (always use bun, not npm/yarn)
bun run dev                 # dev server at http://localhost:4321 (binds 0.0.0.0)
bun run build               # static output → dist/
bun run preview             # serve the built dist/
bun run data:build          # regenerate public/data/ from LOCUS (see pipeline below)
bun run data:search         # rebuild the global semantic-search index (needs: pip install fastembed)
bun run data:geo            # rebuild the ZIP→coords table for "Find my town" (needs: pip install certifi)
```

There is no test suite, linter, or typecheck script. `bun run build` (Astro's
build) is the closest thing to a correctness gate — it fails on type errors in
`.astro`/`.ts` and on broken static paths, so run it before committing.

The dev server intentionally binds `0.0.0.0` (in `astro.config.mjs`) so the
Claude preview headless browser (which hits `127.0.0.1`) can connect.

## Architecture: two halves, one flat-file contract

The app is a **build pipeline** and a **static site** that never talk directly —
they meet only at JSON files in `public/data/`.

1. **Pipeline** (`pipeline/build.py`, Python + DuckDB) — queries LOCUS-v1 parquet
   over HuggingFace's `hf://` protocol (no download; `--source '/path/*.parquet'`
   for local files). Two stages:
   - **National baselines** (`fetch_baselines`): one cheap `GROUP BY` over the
     *whole* corpus (~2,300 jurisdictions) computing per-jurisdiction mean of the
     four score dimensions + per-topic shares. Only the small aggregate streams
     down (never the `content` column). Emits `public/data/baselines.json` (101
     percentile breakpoints per dimension and per topic-share).
   - **Per jurisdiction** (queried one at a time — equality predicates let DuckDB
     push down to the right parquet row groups; a combined `IN` defeats pushdown):
     filter to `is_substantive`, clean each header into `(title, section)`, tag
     lenses, then synthesize three views — `build_portrait` (places this town's
     means/topic-mix against the baselines → plain-language comparative sentences
     + percentiles + `lowConfidence`/`limitedCoverage` flags), `match_questions`
     (the "Can I…?" lens), `notable_rules` (distinctiveness heuristic). Writes
     `public/data/<state>/<slug>.json` (portrait + questions + notable + laws) plus
     an `index.json` manifest entry (counts, size, `portraitTeaser`, and
     `dimensions` = per-dimension national percentiles for the ranking page).
   - **Legalese gallery** (`build_legalese`): collects the most opaque laws across
     all pilots (capped per jurisdiction), emits `public/data/legalese.json` for
     the Legalese-o-Meter page.

2. **Static site** (Astro 6 + React islands + Tailwind v4) — at build time
   `src/lib/data.ts` reads the JSON (`loadIndex`, `loadJurisdiction`,
   `loadBaselines`, `loadLegalese`) and `src/pages/[state]/[city].astro`
   statically generates one page per jurisdiction via `getStaticPaths`. In the
   browser, a **single** `JurisdictionModules` island `fetch`es that
   jurisdiction's file **once** and shares the parsed document across
   `PlacePortrait`, `CommonQuestions`, `NotableRules`, and the `LawBrowser` browse
   tail (avoiding a 4× refetch of a multi-MB file). All heavy work is at build
   time; the browser downloads JSON and filters/renders.

   Three site-level surfaces sit on top of the per-jurisdiction pages: the
   homepage opens with a "what this is" explainer + corpus scale + dataset link;
   `/rankings` (`RankingsTable`) places the pilots on the national distribution
   per dimension (national-percentile framing, never a leaderboard verdict); and
   `/legalese` (`LegaleseMeter`) is a playful gauge over `legalese.json`. Inside a
   place page, each Place Portrait dimension bar expands into `DimensionLaws` —
   the town's own laws ranked by that raw z-score. `LawBrowser` shows place-aware
   starter chips (`BROWSE_SUGGESTIONS`, filtered to terms that actually match
   locally). Shared dimension labels/direction live in `DIMENSION_META`
   (`topics.ts`); readability math for the meter lives in `src/lib/readability.ts`
   (deterministic facts, not model output — keeps the "original text only" rule).

`public/data/` is **committed** (~92 MB; largest file ~15 MB) so the site builds
and deploys without running the pipeline; CI never runs it. Re-run
`bun run data:build` only when changing jurisdictions or the data shape — it needs
`python3` + `duckdb` (`pip install duckdb`) and network (the baseline pass scans
the whole corpus, ~seconds).

### Global semantic search ("Ask the law", `/search`)

A site-wide plain-language search that returns the **real ordinances most related
to a question, ranked by meaning, across all pilots** — never an AI-written
answer (the only model touch is embedding the *query*, so the "original text only
/ no LLM summaries" guardrail holds). See `docs/global-semantic-search.md` for the
full design and the locked decisions.

- **Offline** (`pipeline/build_search.py`, `fastembed` bge-small-en-v1.5) embeds
  every law and emits `public/data/search/{vectors.bin, meta.json, manifest.json}`
  — int8 vectors (44k×384, ~17 MB) + index-aligned metadata rows. Committed like
  the rest of `public/data/`.
- **Runtime**: `functions/api/search.ts` (a Cloudflare Pages Function) embeds the
  user's query via Workers AI (same model). `GlobalSearch.tsx` downloads the
  vectors once (lazy, on first search), ranks them in a **Web Worker**
  (`searchWorker.ts`) by cosine, and renders results that deep-link to
  `/<jurisId>?law=<id>` (handled in `LawBrowser`). An instant **lexical** layer
  (`src/lib/search.ts` + `SEARCH_SYNONYMS`) shows results immediately and is the
  fallback if the function is down. Vector-space match between fastembed and
  Workers AI must be validated (see the doc's "validate" gate).

### Find my town (homepage geolocation)

`FindMyTown.tsx` learns the user's rough location three ways (zero-click IP geo via
`functions/api/where.ts` → precise browser Geolocation on click → manual ZIP/city)
and shows the **nearest pilot with the honest distance + a "we don't cover your
town yet" caveat** when it's far. Nearest-of-19 math + the hand-maintained coord
table live in `src/lib/geo.ts` (LOCUS has no coordinates — a deliberate exception
to "data comes from the pipeline"). ZIP→coords uses `public/data/geo/zip-centroids.json`
(built by `pipeline/build_geo.py` from GeoNames), lazy-loaded only on ZIP entry.
Precise coords never leave the browser.

## Domain model (shared types + constants in `src/lib/topics.ts`)

- **Topics** (`Zoning`, `Nuisance`, `Buildings`, `Business`, `Other`) are model
  predictions, not official categories. `Other` is the classifier's junk drawer
  (code mechanics, penalties, ceremonial provisions) and it sometimes mislabels
  (e.g. "Municipal flag" tagged `Nuisance`). Treat topics as noisy.
- **Lenses** (`everyday`, `business`, `renting`) are *our own* keyword groupings
  (`lenses_for()` in the pipeline). `everyday` = **every** law; `business` = topic
  Business or a business keyword; `renting` = topic Nuisance or a housing keyword.
- **Scores** (`opacity`, `paternalism`, `enforcement_discretion`,
  `problem_salience`) come from the LOCUS models. `opacity` drives the "densely
  worded" badge (`LawCard`, z ≥ `OPACITY_FLAG`) and the portrait's plainness line.
  **`problem_salience` is a social-problem axis (skews to crime/loitering), NOT a
  relevance score** — it's deliberately omitted from visible portrait copy
  (`verifyCopy` flag) until its meaning is verified against the paper; never sort
  the browse by it, and it is excluded from the dimension explorer and city
  ranking (`DIMENSION_META` lists only the three verified dimensions).
- **Synthesized views** (precomputed in the pipeline, rendered client-side):
  `portrait` (comparative percentiles + sentences, all labeled estimates),
  `questions` (`{id, matches[]}`; `QUESTIONS_META` ids ↔ `QUESTIONS` in the
  pipeline — surfaces "rules that mention this," never a yes/no), `notable`
  (`{id, reason}`; `NOTABLE_REASON_LABEL` ↔ `NOTABLE_GROUPS` — matches words, not
  meaning). These carry only law ids, resolved client-side against
  `Jurisdiction.laws`.

## Result ordering & search (`src/components/LawBrowser.tsx`)

The browse tail is where the subtlest logic lives, because the corpus has no clean
"resident-relevant" signal:

- **Search** ranks by where the term hits: title-prefix > title > section > body
  (an incidental body mention must not outrank the on-topic law).
- **Default (unsearched) browse** sinks administrative boilerplate via
  `isBoilerplate()` = topic `Other` OR the shared `BOILERPLATE` regex, keeping
  source order otherwise. A **UI-side stopgap**; the real fix is a build-time
  `rank` field (plan doc §13).
- `BOILERPLATE` is the single source of truth in `topics.ts`, **mirrored in
  `pipeline/build.py` as `_BOILERPLATE`** — keep them in sync. The pipeline does
  NOT also treat `Other` as boilerplate, because many genuinely notable rules
  (parades, curfews) are labeled `Other`.

Tailwind is v4 via `@tailwindcss/vite` (no `tailwind.config`). Topic badge/color
classes in `topics.ts` are **literal strings** so Tailwind's scanner finds them —
don't refactor them into computed names.

The homepage picker buckets jurisdictions by the `size` field (`>=1000` laws =
"large"), which is law-count, not city size — so San Francisco shows under "Small
towns" because its LOCUS entry is only ~580 charter/admin provisions (its portrait
also flags `limitedCoverage` when `Other`-share ≥ 0.65).

## Deploy & CI

- Hosting: Cloudflare Pages project **`locallaw`** (account "Berk Labs"),
  production branch **`main`** → `locallaw.pages.dev`.
- **Native Cloudflare Pages Git integration** — every push to `main` triggers a
  build + deploy; PRs get preview URLs. No GitHub Actions, no API token.
- Build config (set in the CF dashboard, not in-repo): build command
  `bun install && bun run build`, output dir `dist`, env var `BUN_VERSION`
  (currently `1.3.11`). The explicit `bun install` + pinned `BUN_VERSION` are
  **required** because Cloudflare doesn't auto-detect the text `bun.lock` (only
  the legacy binary `bun.lockb`) and otherwise falls back to npm.
- Deploys are Git-driven; there is no manual `wrangler pages deploy` step.
- **Pages Functions** live in `functions/` (repo root) and deploy automatically
  alongside the static `dist/` — no build-config change. `functions/api/search.ts`
  needs a **Workers AI binding named `AI`** on the Pages project (dashboard →
  Settings → Functions → bindings); without it, search degrades to the lexical
  fallback. `functions/api/where.ts` (IP geo) needs no binding. `astro dev` does
  **not** run Functions — use `bunx wrangler pages dev dist` (with CF login) to
  test the semantic/IP-geo paths locally; the lexical + browser-geo + ZIP paths
  work under plain `astro dev`.

## Constraints to preserve

- **Licensing:** code is MIT (`LICENSE`); data in `public/data/` is LOCUS-v1 under
  **CC BY-NC 4.0**. Keep the site non-commercial (no ads/paywall); keep
  attribution in the footer, `/about`, and `ATTRIBUTION.md`.
- **Disclaimers are load-bearing.** "Not legal advice" + OCR/machine-label caveats
  appear on every view by design. Never present topics/lenses/scores/portrait as
  authoritative.
- **Honesty guardrails (don't weaken):** portrait dimensions are labeled machine
  estimates and phrased as percentiles ("plainer than 70% of towns"), never
  verdicts; `problem_salience` stays out of visible copy until verified; questions
  surface "rules that mention this," not yes/no answers; notable rules state they
  match words, not meaning; **global search returns "ordinances most related to
  your question," ranked by meaning — never a written answer** (the only model
  call embeds the query, not the law text).
- **Original ordinance text only** — no LLM summaries/rewrites of legal text (a
  deliberate product decision; plan doc D1). Portrait/questions/notable are all
  text-only heuristics. The one model call at runtime is the search **query**
  embedding (Workers AI); the corpus is embedded offline and the law text is never
  generated or rewritten.

## Deeper context

`docs/locus-tools-plan.md` is the full design record: the v2 "portrait, not a
list" reframe (top of the doc), the original product plan, the UX testing pass
(§12), and planned/not-yet-built upgrades — build-time relevance `rank` (§13), an
LLM pass for Notable Rules, and verifying `problem_salience` against the paper.
