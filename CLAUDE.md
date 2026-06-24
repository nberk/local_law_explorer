# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local Law Lookup — a free, non-commercial static site that turns the open
**LOCUS-v1** local-ordinance corpus into plain, readable city/county law for
ordinary people. Live at https://locallaw.pages.dev. The **homepage** leads with
two interactive **spectrum explorers** (`SpectrumExplorer`: opacity and
paternalism) that sample ~20 real laws across a score dimension and pair the
verbatim text with a hand-authored plain-language translation; the city picker
sits below them. Each jurisdiction page opens with a synthesized **Place
Portrait** (how this town governs vs. the rest of the US), then everyday "Can
I…?" questions, then notable rules, and only then a full searchable browse ("dig
deeper"). Two site-level views round it out: `/rankings` (pilots on the national
scale) and `/legalese` (a playful opacity meter). Not legal advice; the text is
OCR'd, every label/score is a machine estimate, and plain-language translations
are AI paraphrases, not the law.

**Full rollout (in progress, see `docs/full-rollout.md`):** the code now supports
rendering **every city and county in LOCUS** (~1,644 cities + ~345 counties), not
just the original 19. The large per-jurisdiction JSON (~4.6 GB at full scale)
lives in **Cloudflare R2**, fetched on demand from `PUBLIC_DATA_BASE_URL`; only
the small `index.json` manifest + showcase files stay committed in `public/data/`.
The committed data is still the 19 pilots until the one-time full build + R2
upload is run (the "coordinate later" step). The homepage picker is search-first
and "find my town" returns the nearest **city and county**.

## Commands

```bash
bun install                 # deps (always use bun, not npm/yarn)
bun run dev                 # dev server at http://localhost:4321 (binds 0.0.0.0)
bun run build               # static output → dist/
bun run preview             # serve the built dist/
bun run data:build          # regenerate per-jurisdiction JSON (see pipeline below)
bun run data:search         # rebuild the global semantic-search index (needs: pip install fastembed)
bun run data:geo            # rebuild the ZIP→coords table for "Find my town" (needs: pip install certifi)
bun run data:geocode        # write lat/lon onto each jurisdiction + ZIP→county (needs: pip install certifi)
```

**Full-rollout build (all cities + counties — see `docs/full-rollout.md`):** read
from a LOCAL parquet copy (streaming `hf://` is far too slow to materialize ~2,000
jurisdictions). Download once with `huggingface_hub`
(`LocalLaws/LOCUS-v1` → `./locus-data`, gitignored), then:

```bash
# rehearse on a slice first (writes ONLY per-jurisdiction files to data-build/;
# committed showcase files are left untouched):
python3 pipeline/build.py --source 'locus-data/data/*.parquet' --limit 50
# full run (regenerates index/baselines/legalese/spectrum + all per-juris files):
python3 pipeline/build.py --source 'locus-data/data/*.parquet'
bun run data:geocode        # adds lat/lon to index.json + exact ZIP→county
# then upload data-build/ to R2 (see Deploy) and commit the small files.
```

`build.py` flags: `--limit N` (first N largest, slice rehearsal), `--only state/slug`
(single jurisdiction), `--juris-out` (per-jurisdiction dir, default gitignored
`data-build/`). Per-jurisdiction files go to `data-build/`, NEVER `public/data/`.
A single file is capped at ~24 MB (content truncated past that).

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
   - **Homepage spectra** (`build_spectrum`, in the dependency-free
     `pipeline/spectrum.py` so the selection rule is shared, not duplicated):
     picks ~20 legible laws evenly spaced across each of opacity/paternalism, one
     per jurisdiction where possible, and emits `public/data/spectrum.json`. The
     `plain` (plain-language translation) field is **hand-authored** and lives
     only in that committed file; `build_spectrum` reads the prior file and
     carries translations forward (keyed by `jurisId|section|title`) so a rebuild
     never clobbers them — only newly-selected laws come back with `plain: null`.

2. **Static site** (Astro 6 + React islands + Tailwind v4) — at build time
   `src/lib/data.ts` reads `index.json`/`baselines.json`/etc. (`loadIndex`,
   `loadBaselines`, `loadLegalese`, `loadSpectrum`) and `src/pages/[state]/[city].astro`
   statically generates one page per jurisdiction via `getStaticPaths`.
   **Build-cost rule:** pages use only **summary** fields from `index.json`;
   `loadJurisdiction()` is gone — never read a per-jurisdiction file at build time
   (at ~2,000 places that would read the whole ~4.6 GB during `astro build`). In
   the browser, a **single** `JurisdictionModules` island `fetch`es that
   jurisdiction's file **once** from `` `${DATA_BASE_URL}/${id}.json` `` (R2 in
   prod; `/data` locally — see `src/lib/clientData.ts`) and shares the parsed
   document across `PlacePortrait`, `CommonQuestions`, `NotableRules`, and the
   `LawBrowser` browse tail (avoiding a 4× refetch of a multi-MB file). The
   `index.json` manifest is **client-fetched** (`loadIndexClient`, memoized), not
   SSR-inlined, so a ~2,000-entry array never bloats every page's HTML — the
   homepage islands (`JurisdictionPicker`, `FindMyTown`) and `RankingsTable` fetch
   it on mount.

   Site-level surfaces sit on top of the per-jurisdiction pages: the **homepage**
   leads with two `SpectrumExplorer` islands over `spectrum.json` (a draggable
   tick-marked rail per dimension, plain-language ⇄ original toggle; opacity also
   shows readability facts + a "squint" blur), then the **search-first**
   `JurisdictionPicker` (a largest-first shortlist until you type, then name/state
   filtering capped at ~60 results — it must not render ~2,000 cards) and
   `FindMyTown`, then a compact dataset explainer; `/rankings` (`RankingsTable`)
   places covered jurisdictions on the national distribution per dimension
   (top-100 on the chosen axis; national-percentile framing, never a leaderboard
   verdict); and `/legalese` (`LegaleseMeter`) is a playful gauge over
   `legalese.json`. Inside a place page, the topic mix renders as
   `TopicFingerprint` (`.astro`, server-rendered: per-topic bars vs. the national
   median share, the fix for the old confusing "more laws of X" copy), and each
   Place Portrait dimension bar expands into `DimensionLaws` — the town's own laws
   ranked by that raw z-score. `NationalPositionBar` (shared by the portrait and
   rankings) shows a place's 0–100 position with a "typical town" (50th) mark.
   `LawBrowser` shows place-aware starter chips (`BROWSE_SUGGESTIONS`, filtered to
   terms that actually match locally). Shared dimension labels/direction live in
   `DIMENSION_META` (`topics.ts`); readability math lives in
   `src/lib/readability.ts` (deterministic facts counted from the text, not model
   output).

The **small** files in `public/data/` are **committed** (`index.json`,
`baselines.json`, `legalese.json`, `spectrum.json`, `geo/`, `search/`; the 19
pilot per-jurisdiction files remain too as an offline-dev fallback) so the site
builds and deploys without running the pipeline; CI never runs it. The **large**
per-jurisdiction files are NOT committed — at full scale they live in R2 and are
written to gitignored `data-build/` by the pipeline. Re-run `bun run data:build`
only when changing jurisdictions or the data shape — it needs `python3` + `duckdb`
(`pip install duckdb`) and, for the full set, a local parquet copy (see Commands).

**Local dev after the rollout:** per-jurisdiction files for non-pilot places are
not committed, so either set `PUBLIC_DATA_BASE_URL` to the R2 URL in `.env`, or
copy a `data-build/` slice into `public/data/`. The default `PUBLIC_DATA_BASE_URL`
is `/data`, which serves the committed pilots offline.

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
and shows **two cards — the nearest city and the nearest county** (both layers of
local law apply to one spot), each with its own honest distance + a "we don't cover
your town yet" caveat when far. `nearestByType()` in `src/lib/geo.ts` computes
nearest-of-each over the `lat`/`lon` on every `JurisdictionSummary` (skipping
null-coord entries). Coordinates are no longer hardcoded: `pipeline/geocode_jurisdictions.py`
fills them in (cities → GeoNames populated places; counties → US Census Gazetteer
internal points; townships/towns/boroughs → US Census Gazetteer **county
subdivisions**, disambiguated by the county hint LOCUS appends to township names,
e.g. "Bedford Township, (Monroe Co.)") — LOCUS has no coordinates, a deliberate
exception to "data comes from the pipeline". Accent-folding + glued-suffix degluing
handle OCR-mangled slugs ("ogdencity"→Ogden, "Española"→Espanola); a small
`_OVERRIDES` table supplies *verified names* (never raw coords) for the few slugs
LOCUS garbled past repair ("aurel"→Aurelia, "hempstead bzo"→Town of Hempstead).
Coverage is **100%** (2287/2287) — every place appears in "find my town".
ZIP→coords uses `public/data/geo/zip-centroids.json` (built by
`pipeline/build_geo.py` from GeoNames), entries now `[lat, lon, countyId?]` so a
ZIP returns the **exact** containing county (added by `data:geocode`); device/IP
geo still use nearest-centroid. Precise coords never leave the browser.

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

The `size` field (`>=1000` laws = "large") is **law-count, not city size** — so
San Francisco is "small" because its LOCUS entry is only ~580 charter/admin
provisions (its portrait also flags `limitedCoverage` when `Other`-share ≥ 0.65).
The search-first picker no longer buckets on `size`; it orders by law count
(`index.json` is sorted that way) for the largest-first shortlist.

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
- **R2 (full rollout)** — large per-jurisdiction JSON lives in a public R2 bucket
  (planned name `locallaw-data`, prefix `data/`), set on the Pages project as the
  build env var **`PUBLIC_DATA_BASE_URL`** (the bucket's public `r2.dev`/custom
  URL). Bucket created via `wrangler r2 bucket create`; **CORS** must allow `GET`
  from the Pages origin + `http://localhost:4321`. Bulk upload with
  `aws s3 sync data-build/ s3://locallaw-data/data/ --endpoint-url
  https://<account>.r2.cloudflarestorage.com` (wrangler has no bulk sync). The R2
  S3 token is an **operator secret** — keep it in the macOS Keychain
  (`security find-generic-password -s r2-locallaw -w`), never the repo/`.env`. Free
  tier: 10 GB storage (≈4.6 GB used), egress free, Class-B reads 10M/mo. *(Bucket
  + env var are provisioned during the one-time rollout — see `docs/full-rollout.md`.)*
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
- **Plain-language translations: allowed, but always labeled and secondary.** The
  old "original text only" guardrail (plan doc D1) was **lifted (2026-06-23)** at
  the user's direction. We may publish plain-language translations of laws, but:
  they appear *alongside* the verbatim text (never replacing it), are labeled "AI
  paraphrase, not the law — verify before relying on it," and live only in
  `public/data/spectrum.json`. They are **hand-authored and committed**, never
  generated at build time. Portrait, questions, notable, and global search make no
  model calls at build time; global search's one runtime model call embeds the
  *query* only (Workers AI), never the law text.

## Deeper context

`docs/locus-tools-plan.md` is the full design record: the v2 "portrait, not a
list" reframe (top of the doc), the original product plan, the UX testing pass
(§12), and planned/not-yet-built upgrades — build-time relevance `rank` (§13), an
LLM pass for Notable Rules, and verifying `problem_salience` against the paper.
`docs/homepage-redesign.md` records the 2026-06-23 pass: the spectrum-explorer
homepage, the D1 plain-language reversal, and the `TopicFingerprint` /
`NationalPositionBar` data-viz upgrades.
`docs/full-rollout.md` records the 2026-06-24 scale-up to all cities + counties:
the R2 data store, the `data-build/` split, client-fetched `index.json`, the
geocoding step, the search-first picker, and the nearest-city-and-county geo.
