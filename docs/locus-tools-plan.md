# LOCUS Local-Law Tools: Implementation Plan

Status: **v2 reframe shipped locally** (v1 pilot live at https://locallaw.pages.dev)
Last updated: 2026-06-23

## Build status

### v2 — "portrait, not a list" reframe (this pass)

The jurisdiction page no longer opens as a searchable list of laws. It opens with
a synthesized portrait of how the place governs, then answers everyday questions,
then surfaces distinctive rules, and only then offers the full browse as a "dig
deeper" tail. All text-only (no LLM at build time). New work:

- **Pipeline (`pipeline/build.py`):**
  - National baseline pass — one cheap `GROUP BY` aggregation over the whole
    corpus (avg of the 4 score dimensions + per-topic counts, ~8s, never touches
    `content`). Emits `public/data/baselines.json` (101 percentile breakpoints per
    dimension and per topic-share over 2,287 jurisdictions).
  - Per-jurisdiction enrichment written into each `<state>/<slug>.json`:
    `portrait` (plain-language comparative sentences + percentiles, plus
    `lowConfidence` / `limitedCoverage` flags), `questions` (`{id, matches[]}`,
    law ids only), `notable` (`{id, reason}`, law ids only). `index.json` entries
    gain a compact `portraitTeaser`.
  - `QUESTIONS` + `NOTABLE_GROUPS` lexicons; `match_questions` (title-hit required,
    body text too noisy to qualify), `score_notable` (distinctiveness + boilerplate
    /generic-header exclusion + per-category diversity cap), `build_portrait`.
  - **San Francisco** added to the pilot (19 jurisdictions). NB: LOCUS's SF entry
    is only ~580 charter/admin provisions (83% topic "Other"), so its questions/
    notable come up empty and the portrait flags `limitedCoverage` (Other-share
    ≥ 0.65; calibrated — real codes top out near 55%).
- **Frontend:** new `PlacePortrait`, `CommonQuestions`, `NotableRules` modules,
  rendered by a single `JurisdictionModules` island that fetches the
  per-jurisdiction file once and shares it (incl. with `LawBrowser`, now accepting
  a preloaded `data` prop). Extracted shared `TopicBar` + `LawCard`. Picker cards
  show the portrait teaser. `/about` documents the comparison method.

Honesty guardrails baked in: portrait dimensions are labeled machine estimates;
`problem_salience` is omitted from visible copy until its meaning is verified
against the paper; questions surface "rules that mention this," never a yes/no;
notable copy states it matches words, not meaning.

### v1 — pilot (prior pass)
- Pipeline extracts pilot jurisdictions, cleans headers, tags lenses, emits
  `public/data/`. Astro + React + Tailwind v4 site: picker, per-jurisdiction pages
  with three lenses, within-jurisdiction search, topic filter, opacity flag,
  best-effort "find in official code" links. Attribution + disclaimers per
  CC-BY-NC-4.0. Deployed to Cloudflare Pages project `locallaw`.

### Known follow-ups (not yet done)
- **Verify `problem_salience`** against arXiv 2606.19334, then write non-judgmental
  copy and un-hide it in the portrait (data + `verifyCopy` flag already present).
- **Confirm z-score sign conventions** against the dataset README (a flipped sign
  inverts portrait sentences).
- **LLM upgrade for Notable Rules:** replace `score_notable`'s keyword scoring with
  a "is this surprising to a resident?" classification (Batch API, cached by law
  id) — no data-contract change needed.
- **Big-city payload:** largest cities ship a multi-MB per-jurisdiction JSON
  (Chicago ~3.3 MB gzip). The single-fetch island avoids multiplying it, but before
  scaling, split content into a lazy chunk or a title-only index + on-demand content.
- **Scale coverage:** run over all ~1,600 cities (+counties) — download parquet
  locally first. Decide manifest UX for non-built towns; baselines already cover all.
- **Custom domain:** add e.g. locallaw.nickberkconsulting.com in the CF dashboard.
- **Plain-language summaries (D1 Option B):** scoped LLM rewrites for high-opacity
  laws, via Claude Batch API.

## 1. Goal

Build a free, public-good website that lets an ordinary person look up the local
ordinances that govern daily life where they live, presented in plain, organized
form with links back to the official source.

We are building three tools the user selected. They are three lenses on one
shared engine:

1. **Everyday rules explainer** (tool 1): the broad view. Pick a city or county,
   browse the substantive rules grouped by topic (pets, noise, permits, signs,
   property, rentals).
2. **Starting a business guide** (tool 2): the business lens. The same data
   filtered to licensing, permits, fees, and zoning relevant to opening a small
   business, presented as a checklist.
3. **Renting and property lookup** (tool 4): the housing lens. Nuisance,
   occupancy, noise, and property-maintenance rules for renters and landlords.

One pipeline, one index, three framings. This plan covers all three.

## 2. What the data gives us (and its limits)

Source: HuggingFace `LocalLaws/LOCUS-v1`, CC-BY-NC-4.0 (noncommercial). Paper:
arXiv 2606.19334.

- 2,211,516 ordinance chunks, 50 states, ~1,644 cities, ~345 counties.
- Per chunk: `header`, `content`, `is_substantive`, `function`
  (Rules/Enforcement/Context/Process), `topic`
  (Zoning/Nuisance/Buildings/Business/Other/null), `source_jurisdiction_type`
  (cities/counties), `state`, `city`, `county`, and four z-scored model dimensions
  (`enforcement_discretion`, `opacity`, `paternalism`, `problem_salience`).

Hard limits that shape the product:

- **Not legal advice.** Text is OCR'd and labels are model-generated. No effective
  dates, no amendment history, no guarantee a rule is still in force. Every page
  must disclaim this and link to the official code.
- **It does not resolve authority.** We can show city or county text. We cannot
  say whether the city, county, or state rule controls a given question. The UI
  must never imply it does.
- **Coverage is partial.** Roughly 1,644 cities and 345 counties. A user's town
  may not be present. The UI must degrade gracefully.
- **Noncommercial only.** Free public tool is fine. No paid product without
  separate licensing. Attribution to LOCUS required.
- **No source URLs in the dataset.** We do not have a direct link to each
  ordinance on its hosting platform. See open decision D4.

## 3. Architecture

Two clean halves with a flat-file contract between them.

```
  LOCUS parquet (HF)                         Static site (browser)
        |                                            ^
        v                                            |
  [ build pipeline (Python + DuckDB) ]   ---->  public/data/*.json
   - filter is_substantive                         (manifest + per-jurisdiction)
   - select/clean/group
   - (optional) LLM summarize
   - emit static JSON
```

### 3.1 Build pipeline (offline, Python + DuckDB)

Runs locally or in CI, not on every request. Steps:

1. Query LOCUS remotely via DuckDB `hf://` (no full download needed for
   metadata/aggregation; for content extraction we pull per-state slices).
2. Keep `is_substantive = true`. Drop boilerplate.
3. Clean each `header` into a human title (strip leading `#`, strip the section
   number, split on `--`).
4. Group by jurisdiction. Compute per-jurisdiction topic counts and an opacity
   summary for the manifest.
5. Apply view lexicons (section 5) to tag each law with which lens(es) it belongs to.
6. Emit:
   - `public/data/index.json` (the manifest, small, loaded once).
   - `public/data/<state>/<slug>.json` (per-jurisdiction laws, loaded on demand).
7. (Optional, see D1) generate plain-language summaries and fold them in.

Re-runnable and idempotent. Output committed or uploaded to the static host.

### 3.2 Static frontend

A single-page app that loads `index.json` for the picker, then lazy-loads one
jurisdiction file when the user selects a place. All filtering, search, and the
three lenses run client-side over that one small file. No backend.

## 4. Data model (the flat-file contract)

`index.json` (manifest):

```json
{
  "generated": "2026-06-23",
  "jurisdictions": [
    {
      "id": "tx/austin",
      "name": "Austin",
      "state": "tx",
      "type": "cities",
      "county": null,
      "counts": { "total": 1240, "Zoning": 210, "Nuisance": 180,
                  "Buildings": 160, "Business": 150, "Other": 540 },
      "medianOpacity": 0.31
    }
  ]
}
```

`<state>/<slug>.json` (per jurisdiction):

```json
{
  "id": "tx/austin",
  "name": "Austin",
  "laws": [
    {
      "id": "austin-9-2-1",
      "header": "9-2-1 Noise; prohibited hours",
      "title": "Noise; prohibited hours",
      "content": "It shall be unlawful ...",
      "topic": "Nuisance",
      "function": "Rules",
      "lenses": ["everyday", "renting"],
      "scores": { "opacity": 1.8, "paternalism": 0.2,
                  "enforcement_discretion": -0.4, "problem_salience": 0.9 },
      "summary": null
    }
  ]
}
```

`lenses` is precomputed in the pipeline so the client just filters on it.
`summary` is null until/unless we run summarization (D1).

Size sanity check: a large city is on the order of 1,000 to 2,000 substantive
laws, roughly a few hundred KB of JSON, smaller gzipped. The browser only ever
holds one jurisdiction at a time, so this scales fine. We never ship all 2.2M
rows to the client.

## 5. The three lenses (filters and framing)

The dataset has only five topics, so the housing and business lenses need keyword
filtering on top of topic. Lexicons are defined once in the pipeline.

**Everyday rules (tool 1)**
- Include: all substantive laws.
- Group by `topic`; within topic, optionally sub-group by header keywords.
- Framing: neutral, browsable, "the rules that affect daily life here."

**Starting a business (tool 2)**
- Base: `topic = Business`, plus `Zoning`/`Buildings` laws whose header/content
  match a permit lexicon: license, permit, fee, registration, vendor, food,
  sign, occupancy, inspection, zoning use, home occupation.
- Framing: checklist. "Before you open, check these."

**Renting and property (tool 4)**
- Base: `topic = Nuisance`, plus `Buildings`/`Other` laws matching a housing
  lexicon: noise, rental, tenant, landlord, occupancy, property maintenance,
  trash, weeds, nuisance, dwelling, habitability, registration.
- Framing: sub-themed (Noise, Property upkeep, Occupancy, Rental rules).

Lexicons are best-effort and tunable. We will validate them against a few real
jurisdictions during the build and iterate.

## 6. Plain-language summarization (key cost decision: D1)

The pitch for tool 1 is "plain English," but summarizing 2.2M chunks with an LLM
is a real, bounded-but-nontrivial cost incurred at build time. Options:

- **Option A (MVP, recommended): no LLM in v1.** Present cleaned original text
  with the human-readable title and topic badges. Headers are already
  descriptive. Zero build cost, ships fast, fully honest (no paraphrase risk).
- **Option B: scoped summaries.** Summarize only a pilot set (e.g. the laws in
  the housing and business lenses, or only high-opacity laws) using the Claude
  Batch API with prompt caching. Bounds cost while delivering the plain-language
  hook where it matters most.
- **Option C: full summarization.** All substantive laws, Batch API + caching.
  Highest value, highest build cost; defer to v2 once the product is proven.

Recommendation: ship A, then layer in B for the high-opacity laws (where plain
language helps most and the `opacity` score is doing real work). Treat C as v2.

## 7. UX flow

1. **Landing.** "Find the local laws where you live." State dropdown, then
   city/county autocomplete fed by the manifest.
2. **Not covered.** If the town is absent: clear message plus fallbacks (its
   county code if present, or nearest covered jurisdiction), never a dead end.
3. **Jurisdiction page.** Three tabs/lenses: Everyday rules, Starting a business,
   Renting and property. Within-jurisdiction search box.
4. **Law card.** Clean title, topic badge, plain text (or summary if present),
   an opacity flag ("Heads up: this one is written in dense legal language") when
   `opacity` is high, and a "view the official code" action (D4).
5. **Persistent disclaimer.** Not legal advice; OCR'd and machine-labeled;
   snapshot in time; verify against the official code. Attribution to LOCUS.

## 8. Tech stack (mirrors the legalbenchmarks project)

Decided: mirror the stack and design of `legalbenchmarks`
(https://benchmarks.nickberkconsulting.com) and deploy on Cloudflare.

- Build pipeline: Python 3 + DuckDB (already validated against the dataset).
- Frontend: **Astro 6** (static generation) with **React islands** for the few
  interactive pieces, **TypeScript** (strict), **Tailwind CSS v4** (theme defined
  inline in `src/styles/global.css` via `@theme {}`, no separate config file).
  Package manager: **Bun**.
- Static generation: one prebuilt page per jurisdiction at build time, fed by the
  pipeline JSON. Interactive components (`client:load`): the jurisdiction picker /
  search and the within-jurisdiction filter/lens controls. Search via MiniSearch,
  as in the benchmarks project.
- Dev server must bind `0.0.0.0` (see global note on preview host binding).
- Hosting: **Cloudflare Pages** (same as legalbenchmarks). Configure `site` in
  `astro.config.mjs`; add sitemap.

## 8.1 Design system (mirror legalbenchmarks)

Reuse the benchmarks visual language verbatim so the two sites feel like a family.
Light mode only. Clean, editorial, no gradients.

**Color tokens** (Tailwind v4 `@theme`, plus `:root` CSS vars):
- Background `--bg: #fbfbf9` (warm off-white); panels/cards `#ffffff`; borders
  `--rule: #d8d8d4` (ink-200).
- Ink (text) scale: ink-900 `#161610` (primary), ink-500 `#6b6b63` (muted),
  ink-400 `#8a8a82`, down to ink-50 `#f7f7f6`.
- Accent (legal blue): accent-500 `#3d63b3`, accent-700 `#243c79` (hover),
  accent-100 `#e3eaf6`, accent-50 `#f2f5fb`.

**Typography** (Google Fonts, weights 400-700):
- Display/headings: **Source Serif 4** (`.font-display`, letter-spacing -0.015em).
- Body/UI: **Inter**.
- Data/IDs/counts: **JetBrains Mono**.

**Layout shell** (copy structure from benchmarks):
- Sticky header `h-14`, `border-b`, `bg-[var(--bg)]/80 backdrop-blur`, inner
  `max-w-7xl mx-auto px-6`. Small serif logo mark.
- Content containers `max-w-7xl` (listings), `max-w-5xl` (jurisdiction detail),
  `max-w-3xl` (about/prose). Horizontal `px-6`.
- Footer `border-t`, `py-8 text-[12px] text-ink-500`, holds the attribution
  (section 9). Two-column on `md:`.

**Components, mapped from benchmarks to our domain:**
- `PracticeAreaCard` -> **JurisdictionCard**: `border border-[var(--rule)]
  bg-white rounded-lg p-5`, hover `border-ink-300 shadow-sm`, title shifts to
  `text-accent-700` on group hover. Shows a topic-composition bar.
- `WorkTypeBar` -> **TopicBar**: stacked `rounded-full` 6px histogram of a
  jurisdiction's topic mix.
- Work-type badges -> **TopicBadges** (5 topics): Zoning `bg-accent-100
  text-accent-700`, Business `bg-accent-50 text-accent-600`, Buildings `bg-ink-100
  text-ink-700`, Nuisance `bg-ink-100 text-ink-700`, Other `bg-ink-50
  text-ink-700`; `text-[10.5px] font-medium px-1.5 py-0.5 rounded`.
- `StatCard` -> coverage stats (states, cities, counties, total laws) in mono.
- `SearchBox` (React, MiniSearch, Cmd-K) -> jurisdiction picker.
- An "opacity flag" pill reuses the subtle tag style (`bg-ink-50 border
  border-ink-100`) for the "written in dense legal language" heads-up.
- Buttons: primary `bg-ink-900 text-white rounded-md`, secondary outline
  `border-ink-200`.

**Copy tone:** serif headings, measured and factual, no exclamation marks,
uppercase mono micro-labels ("LAWS", "JURISDICTIONS"), muted secondary text.

## 9. Attribution, ethics, legal (hard requirement)

LOCUS-v1 is **CC-BY-NC-4.0**. Attribution and noncommercial use are mandatory,
not optional. This must be visible, not buried.

**Where attribution lives:**
- Site footer (every page): a credit line plus license link.
- A dedicated `/about` page with the full citation, license terms, and the
  data-provenance disclaimer.
- `README.md` of the repo and a `DATA_LICENSE`/`ATTRIBUTION.md` file.

**Footer credit line (draft copy):**
> Local-law text from the LOCUS-v1 corpus (Peskoff, Barrow, Vu & Davenport,
> 2026), used under CC BY-NC 4.0. Not legal advice.

**Full citation (from the dataset README):**
```bibtex
@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}
```
Required elements per the license/README: authors (Denis Peskoff, Joe Barrow,
Christopher Vu, Diag Davenport), title, arXiv id 2606.19334, and a clear
CC-BY-NC-4.0 notice with a link to the license.

**Noncommercial compliance:** no ads, no paywall, no resale. The site is a free
public good. If a commercial use is ever wanted, separate licensing is required.

**Provenance disclaimer (persistent, every view):** the dataset README states
LOCUS is not appropriate as legal guidance, to replace professional analysis, as
a comprehensive representation of U.S. local law, or for consequential use without
human validation, and that its ~2.2M labels are automated and unaudited. Our
disclaimer must say, in plain terms: text is OCR'd from source PDFs, labels and
scores are machine-generated estimates, there are no effective dates or amendment
tracking, coverage is partial, and users must verify against the official code.

**Other guardrails:**
- Never present the four model dimensions as fact; always label them estimates.
- Never imply the shown rule is the controlling legal authority (the corpus is a
  county-harmonized access layer, not an authority resolver).

## 10. Build phases

- **Phase 0:** Repo scaffold (Bun + Vite + React + TS + Tailwind), docs, license/attribution.
- **Phase 1:** Build pipeline produces `index.json` and per-jurisdiction files
  for a handful of pilot jurisdictions. Validate lexicons.
- **Phase 2:** Frontend: picker, jurisdiction page, three lenses, search,
  disclaimers. Wire to pilot data.
- **Phase 3:** Scale pipeline to all covered jurisdictions. Coverage/edge-case UX.
- **Phase 4 (optional):** Plain-language summaries per D1 Option B.
- **Phase 5:** Deploy to static host; SEO/discoverability pass.

## 11. Open decisions (need input before coding)

All resolved (2026-06-23):

- **D1 Summarization scope:** RESOLVED. Original text only for v1 (no LLM at
  build time). Present cleaned ordinance text with readable titles + topic badges.
  Summaries are a later enhancement.
- **D3 Hosting target:** RESOLVED. Cloudflare Pages (mirrors legalbenchmarks).
- **D4 Official-source links:** RESOLVED. Best-effort search link: build a
  search-engine query from jurisdiction name + section number + "municipal code".
- **D5 Pilot jurisdictions:** RESOLVED. Largest covered cities plus a sample of
  small towns spread across different states.

## 12. UX testing pass (2026-06-23)

Walked the live pilot through realistic user journeys (resident with a specific
question; starting a business; renting/property; small-town browse; city not in
pilot; trust/method check). Findings and changes:

**Fixed**
- **Search relevance ranking** (`LawBrowser.tsx`). Search was a pure source-order
  substring filter, so an incidental body mention outranked the law actually about
  the term ("parking" → "Aldermanic expense allowance" first). Now ranks
  title-prefix > title > section > body-only. "parking"/"noise" now lead with the
  right laws.
- **Default browse no longer leads with boilerplate.** Source order front-loads a
  city's administrative front-matter (code numbering, penalties, flags, seals), so
  every lens opened with junk. The default (unsearched) view now sinks the model's
  `Other` bucket plus a conservative, anchored pattern for the city's own
  ceremonial provisions (mislabeled by the topic classifier, e.g. "Municipal flag"
  tagged Nuisance). Non-destructive — boilerplate is demoted, still searchable.
- **Removed redundant chrome:** "Not legal advice" header eyebrow (already in the
  per-page banner, footer, and homepage box); the "N matches" counter now shows
  only while searching (it had tripled with the tab badge and header count);
  "substantive ordinances" → plain "local laws"; fixed the misleading "grouped by
  topic" lens blurb (the everyday lens is a filterable flat list).

**Mobile pass (375px):**
- **Header had no navigation on mobile** — the nav was `hidden md:flex` with no
  hamburger, so "About the data" was unreachable from the header on a phone. Now
  "About the data" shows at all widths; "Find your town" (redundant with the logo)
  is `hidden md:inline`.
- **Homepage search was below the fold** on mobile (the hero + four stat cards +
  caption pushed it to y≈717 on an 812px screen). Reordered to
  hero → city search/picker → corpus-scale stats → disclaimer, so the primary
  action sits at y≈438. Desktop benefits too (action-first instead of vanity
  metrics first). Stats kept, just demoted to context below the picker.
- Jurisdiction pages already render well at 375px (single-column cards, wrapping
  topic chips, stacked lens tabs) — no change needed.

**Known limitations / recommended follow-ups (data/pipeline level)**
- The corpus has no clean "resident-relevant" signal. `problem_salience` is a
  *social-problem* axis (skews to crime/loitering), not relevance, so it's not a
  good default sort. A proper fix is at build time: drop administrative chapters
  (or score relevance with an LLM pass) instead of the UI-side demotion stopgap.
- The everyday lens still opens with business-license rules in big cities (first
  substantive block in source order). Curation or a smarter default topic would
  improve "daily life" framing.
- Small-town entries often have uninformative titles ("Ordinance No. 2016-03") and
  raw OCR emphasis artifacts (`**`, `++`) rendered literally. Cleaning these is a
  display/content decision left open given the "original text only" principle.
  **Decision (2026-06-23): leave the original text as-is** — the artifacts stay
  visible rather than risk altering displayed legal text.

## 13. Planned: pipeline-level relevance ordering (not yet built)

The UI-side demotion in §12 is a stopgap. The clean fix moves ordering into the
build, where we have the full provision and can compute it once instead of on
every render. Approved approach: **plan only, build later.**

**Goal.** Each lens should open with the rules a resident actually cares about,
without a brittle keyword blocklist living in `LawBrowser.tsx`.

**Where it goes.** `pipeline/build.py`, at the point each provision is emitted to
the per-jurisdiction JSON. Add one field per law:

```jsonc
"rank": 0.0   // higher = lead with this; used as the default (unsearched) sort key
```

The React component drops its `BOILERPLATE` regex and `isBoilerplate()` entirely
and sorts the default view by `rank` desc (search ranking stays in the UI — that's
query-dependent and belongs there).

**How to compute `rank` (two options, cheapest first):**

1. **Heuristic, no model calls.** Score each provision:
   - `−` if it's administrative front-matter: detect by section path (Chapter 1 /
     "General Provisions" / "Administration" headings), `topic == Other`, or the
     anchored ceremonial pattern already validated in §12.
   - `−` for very short or definition-only provisions.
   - `+` for substantive topics (Zoning/Nuisance/Buildings/Business) and for
     provisions whose title contains an action verb / prohibition.
   This reproduces the stopgap but with section-path context the UI doesn't have,
   so it catches the mislabeled ceremonial provisions structurally, not by keyword.

2. **LLM relevance pass (higher quality, has a cost).** For each provision, one
   cheap classification call: "Is this a rule a resident/renter/business-owner
   would search for, or internal government administration?" Cache by provision id
   so it runs once. Use the latest small Claude model (e.g. Haiku) for cost. Gate
   behind a `--score-relevance` flag so the default build stays free/offline.

**Coverage note.** This pairs naturally with Phase 3 (scaling beyond the 18-pilot
set) — compute `rank` in the same pass that downloads and processes the full
parquet, so it's done once for every jurisdiction.

**Why not `problem_salience`.** Tested during the §12 pass: it's a social-problem
axis (skews to crime/loitering/nuisance) and is wrong for the business/renting
lenses. Do not use it as the relevance sort.
```

## 14. v3 — comparative & playful layer (BUILT 2026-06-23, local)

Five features that push the site from "look up one town" toward "feel how this
town compares, and have fun poking at the data." All preserve the honesty
guardrails (§9): scores stay labeled machine estimates, phrased as percentiles,
never verdicts.

**Status: all five built and building green** (`bun run build`, 23 pages). New
data artifacts (`index.json` `dimensions`, `legalese.json`) were derived from the
committed per-jurisdiction JSON (logic mirrored from `build.py`, which was also
updated to emit them canonically — a future `bun run data:build` reproduces them
identically). Not yet committed/deployed. Files added: `RankingsTable`,
`LegaleseMeter`, `DimensionLaws` components; `readability.ts`; `rankings.astro`,
`legalese.astro` pages. Deferred nicety: reusing the gauge inside the Feature-2
opacity expander (kept separate to avoid coupling the meter to the `Law` shape).

**Decisions locked (user, 2026-06-23):**
- **`problem_salience` stays hidden.** Sliders + ranking use only the three
  verified dimensions: `opacity`, `paternalism`, `enforcement_discretion`. The
  `verifyCopy` guardrail is untouched. (Un-hiding still gated on verifying it
  against arXiv 2606.19334 — see §13 / Known follow-ups.)
- **Ranking is national-percentile, not a leaderboard.** We place the 19 pilots
  on the full ~2,287-jurisdiction US distribution ("plainer than 80% of US
  towns"), never "#1 most X city in America." Avoids implying the pilots are the
  national extremes and reuses `baselines.json`.
- **Dimension explorer lives inside the Portrait.** Each portrait dimension bar
  expands to reveal the actual laws behind the score.

### 14.0 Shared groundwork

- **`DIMENSION_META` in `src/lib/topics.ts`** — single source of truth for the
  three visible dimensions: `{ key, label, highMeans, lowMeans, inverted }`.
  `opacity` has `inverted: true` (shown as "plainness" = `100 − percentile`,
  matching `displayPercentile`). Reused by features 2, 3, 5 so labels/direction
  never drift between views.
- Honesty copy helper: every dimension surface carries a one-line "machine
  estimate" caveat near the number.

### 14.1 Feature 1 — "What this is" on the homepage  (no data change)

Put the "most fragmented body of law in America" framing on the landing page,
with the concrete scale and a link to the source dataset.

- **Where:** homepage (`src/pages/index.astro`), below the city picker so the
  primary action stays above the fold (per §12 mobile pass). Mirror the scale
  line + dataset link on `/about` and add the dataset link to the footer.
- **Copy (plain, per house style; final headline TBD — options below):**
  > Local ordinances are the most scattered body of law in the United States.
  > There is no central index. Every town's code lives on a different site or in
  > a PDF, in its own format, impossible to compare. LOCUS collected them, read
  > them with OCR, and labeled every provision into one uniform table. That makes
  > something new possible: putting your town's rules side by side with everyone
  > else's.
- **Scale line (from the live index, exact):** 2,211,516 provisions · 1,644
  cities + 345 counties · all 50 states · machine-labeled and scored. **This
  pilot renders 19.**
- **Source links:** dataset → `https://huggingface.co/datasets/LocalLaws/LOCUS-v1`;
  paper → arXiv 2606.19334.
- **Headline options (pick one):** "The most scattered law in America, in one
  place" · "Local law, finally comparable" · "Every town writes its own rules.
  We put them side by side." · "What is this?" · "The fine print of 2,000 towns,
  in one table" · "Your town's rules, measured against everyone else's."

### 14.2 Feature 2 — Dimension explorer inside the Portrait  (no data change)

Each law already carries all four raw z-scores (verified 100% populated in a
158-law town and a 7,541-law city), and `JurisdictionModules` already holds the
full document — so this is pure frontend.

- **Interaction:** in `PlacePortrait`, each of the 3 visible dimension rows
  becomes expandable. Expanded, it shows *this town's* laws ranked by that
  dimension's raw z-score, with a "rank rail": a draggable scrubber where the
  left end is the most extreme law and the right end the least, plus **"Most"**
  and **"Least"** snap buttons. Moving the scrubber swaps the law shown (reusing
  a compact `LawCard`), with its z-score and where it sits in the town's spread.
- **Why this placement helps honesty:** it turns an abstract "+1.2 opacity" into
  the concrete paragraph that earned it — the score becomes inspectable, not
  asserted.
- **New piece:** `src/components/DimensionLaws.tsx` (the rail + card), rendered
  by `PlacePortrait`. Guards against null scores (filter them out of the ranking).

### 14.3 Feature 3 — City ranking page  (small pipeline change)

- **Pipeline (`pipeline/build.py`):** `build_portrait` already computes each
  town's national percentile per dimension. Also write a compact copy into the
  `index.json` summary:
  ```jsonc
  "dimensions": {
    "opacity":                { "percentile": 71, "displayPercentile": 29 },
    "paternalism":            { "percentile": 64 },
    "enforcement_discretion": { "percentile": 48 }
  }
  ```
  (`problem_salience` deliberately omitted.) Type added to `JurisdictionSummary`
  in `topics.ts`.
- **Page:** `src/pages/rankings.astro` + a `RankingsTable.tsx` island. One row per
  pilot, a dimension toggle (Plainness / Paternalism / Enforcement discretion),
  rows sorted by the chosen dimension's national percentile, rendered as labeled
  percentile bars. Opacity shown as "plainness" (`displayPercentile`) to match
  the portrait convention.
- **Framing (honesty):** header reads "Where these 19 towns sit on the national
  scale — out of ~2,287 US jurisdictions in LOCUS. Machine estimates, not
  verdicts." No superlatives.
- **Nav:** add "Rankings" to the header.

### 14.4 Feature 4 — Search suggestions in the browse tail  (no data change)

Give people a starting point that never dead-ends.

- **Place-aware chips:** `Jurisdiction.questions` already lists which of the 12
  curated "Can I…?" questions have matches *here*. Add a `searchTerm` to each
  `QUESTIONS_META` entry (e.g. `backyard_chickens → "chicken"`). In `LawBrowser`,
  render a chip per question that has matches in this town; clicking sets the
  search query.
- **Evergreen fallback set:** a small everyday list (chickens, noise, parking,
  fence, dogs, fireworks, trees, garbage, signs). Filter it the same way — only
  show a chip if it returns ≥1 result in this town's laws (cheap scan; reuse the
  existing search). No chip ever leads to "no results."
- **Where:** below the search box in `LawBrowser.tsx`, styled as subtle tags.

### 14.5 Feature 5 — The "Legalese-o-Meter"  (small pipeline change)

A playful surface for the densest laws, with a "show me another baffling one"
jump and a graphic that conveys *how hard to read* a law is. Honesty anchor: the
opacity score is a labeled machine estimate, but the readability stats shown
alongside it are **deterministic facts** computed from the actual text (sentence
length, long-word share, an estimated reading grade) — no rewrite of the legal
text, so the "original text only" guardrail (D1) holds.

- **Build artifact:** `pipeline/build.py` emits `public/data/legalese.json` — the
  top ~60 most opaque laws across all pilots: `{ jurisId, jurisName, state, slug,
  title, section, topic, opacity, content }`. (Client-side aggregation is
  impossible without loading every multi-MB file, so this is computed once at
  build.)
- **Page:** `src/pages/legalese.astro` + `LegaleseMeter.tsx` island reading that
  file. A "Show me another baffling law →" button cycles through the set. The
  same meter component is reused inside Feature 2's opacity expander.
- **Graphic direction (chosen 2026-06-23):** the **Legalese-o-Meter gauge** — a
  needle dial (Plain English → Pure Legalese) driven by the opacity percentile,
  plus deterministic readability facts (avg sentence length, longest sentence,
  estimated reading grade) and a playful band-keyed verdict line. The "squint
  test" blur is an **optional toggle** layered on top, off by default.

### 14.6 Data-contract summary & build order

- **Contract changes:** (a) `index.json` summaries gain `dimensions` (feature 3);
  (b) new `public/data/legalese.json` (feature 5). Features 1, 2, 4 are
  frontend-only.
- **Suggested order:** 14.0 shared meta → 14.1 homepage (cheap, high-visibility)
  → 14.4 suggestions (cheap, frontend-only) → 14.2 dimension explorer → 14.3
  ranking (pipeline + page) → 14.5 Legalese-o-Meter (pipeline + page + chosen
  graphic). Run `bun run build` after each as the correctness gate.
