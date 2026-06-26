# Patterns explorer: site integration plan

How the standalone `docs/conduct-explorer.html` becomes a real, navigable part of
the Local Law Explorer site. This is the plan; no code is written until it is
reviewed (per the "plan before code" workflow).

## What we are integrating

`conduct-explorer.html` is a self-contained "field notes" page built from the
LOCUS corpus. It is **horizontal** (how local law works *across* towns), where the
rest of the site is **vertical** (what the law is in *your* town). It has three
independent modules:

1. **The breadth** (§01) — 47 subjects ranked by how many town codes have a rule
   on each, grouped into shared-core / optional-middle / quirk-tail, filterable by
   category, tap a row for example towns.
2. **Patterns of approaches** (§02) — 5 relatable topics (dangerous dogs,
   fireworks, backyard chickens, noise, short-term rentals). Each has a menu of
   approaches and 31 real ordinances shown in plain English with a "Show the
   actual law" toggle to the verbatim OCR'd text.
3. **Regional variation** (§03) — pick a subject and see how its prevalence
   varies by U.S. region, with a written explanation of *why* (climate, state
   preemption, legalization, culture).

The standalone also has a closing "two hidden dials" note. **It is being cut** (see
Design revisions below); not interesting enough to carry over.

## Decisions locked (2026-06-26)

| Decision | Choice |
| --- | --- |
| Does a national "how towns differ" layer belong, given `/rankings` and `/spectrum` were just removed? | **Yes.** Those showed abstract machine scores; this shows concrete real ordinances in plain English. Different category, clears the bar. |
| Homepage entry point | **Option A, refined (2026-06-26)** — lead with **three featured topic cards** (dangerous dogs, fireworks, backyard chickens) framed as "see how cities regulate the same rule differently", linking into §02. The breadth view ("what cities regulate") is **demoted to a single quiet link** beneath them, not removed. Plus a header nav link. |
| How to land it technically | **Go straight to a real Astro page** (no interim `public/*.html` drop-in). |
| Town-page deep-links | **Yes** — contextual links from each place page into the relevant explorer topic. Highest-leverage discovery path. |

## Design revisions (2026-06-26)

Three changes to the standalone's design before it ships as `/patterns`:

1. **Cut "two hidden dials."** The closing dense-≠-strict / code-vintage note is
   dropped. Not interesting enough.
2. **§02 law cards become a horizontal swipe rail.** Today each ordinance is a
   full-width card stacked vertically, so the dogs topic is a very tall column.
   Instead, lay the laws on one line as a `scroll-snap` row of fixed-width cards
   the reader swipes/drags through (arrows on desktop). Keeps a 15-law topic
   compact. The "Show the actual law" expander still works inside a card (the card
   grows; the rail height follows). Mobile-friendly by default.
3. **§03 regional, redesigned.** The ranked 42-state bar chart buries the regional
   story (you have to read state names and infer geography) and the subject is not
   obvious at a glance. Two better forms were prototyped on the real data:
   - **Choropleth map** — states colored by share; the regional clustering is
     visible at once. Caveat: LOCUS covers ~42 states unevenly, so several states
     (incl. parts of the low-share Northeast) show as "no data" holes.
   - **Four-region rollup** — NE / MW / S / W as four bars of the
     sample-size-weighted average share, sorted, led by a one-line punchline
     ("Fireworks: West 69% → Northeast 23%"). Robust to partial coverage, explicit
     about the regional contrast, great on mobile.

   Both lead with the punchline (fixing "the subject doesn't show what it's
   about"). **Decision (2026-06-26): ship the map as the hero with the four-region
   rollup beneath it.** They answer different questions: the map shows *where*, the
   rollup shows *how big the regional gap is*. Order per subject: punchline line →
   choropleth → four-region bars → the `regionalNotes` "why" prose. The raw
   42-state detail moves into an optional "show all states" expander for the
   curious, so the default view stays legible. The map keys on `properties.name`
   from `us-atlas@3/states-10m`; states absent from LOCUS render neutral-gray with
   a "not in dataset" note, and the rollup (sample-size-weighted) carries the
   regions the map leaves gray.

## Naming

Proposed route: **`/patterns`**. Clean, descriptive, matches the page's job
("patterns of approaches", "regional variation"). Alternatives considered:
`/field-notes` (matches the editorial voice but vaguer), `/whats-in-local-law`
(literal but long). **Open for veto** before build; everything downstream uses
`/patterns` as a placeholder.

## Architecture

The site's contract: Astro pages + React islands + Tailwind v4, with data in
committed JSON under `public/data/`. The explorer must adopt that contract.

### 1. Data: lift the embedded blob into a committed JSON

The standalone embeds everything as one `const DATA = {…}` object. We lift it
verbatim into **`public/data/patterns.json`** (small, national-aggregate, fully
static — it fits the "small committed files stay in the repo" rule, same as
`baselines.json` and `spectrum.json`).

Shape (already present in the standalone, carried over unchanged):

| Key | Feeds | Notes |
| --- | --- | --- |
| `nCities` | denominators | 1,652 substantive city codes |
| `prevalence[47]` | §01 bars | `{key, label, cat, share, examples[6]}` — **two fields added below** |
| `topics[5]` | §02 | `{id, label, emoji, color, question, intro, split, regional, approaches[], laws[]}` |
| `topics[].laws[]` | §02 cards | `{approach, city, state, title, plain, text}` — **`plain` is the AI paraphrase, `text` is verbatim OCR** |
| `regional`, `states`, `stateN`, `region`, `stateNames` | §03 chart | per-state shares + region map |
| `regionalNotes[10]` | §03 "why" copy | hand-authored explanations |
| `marquee[10]`, `topicSubj`, `topicPrev`, `labels` | headers / accents | |

**Two additions to `prevalence[]` for the clickable tiles (see §"Clickable city
tiles" below):**

- Each `examples[]` entry becomes `{name, id}` instead of a bare string, where
  `id` is the LOCUS jurisdiction id (`tn/chattanooga`) resolved against
  `index.json`. A one-time resolver script matches the display name to a manifest
  entry; names that do not resolve (OCR garble, county hints) keep `id: null` and
  render as plain text, not a link.
- Each subject gains a `q` field: the search term to seed on the target town page
  (e.g. `chickens` → `"chicken"`, `dangerous_dogs` → `"dangerous"`). Hand-set so
  we control exactly which laws light up.

**v1 commits `patterns.json` as hand-derived data** (the numbers are already
computed; the §02 paraphrases and example picks are hand-authored, like
`spectrum.json`'s translations). **Follow-up (out of scope for v1):** add a
`build_patterns()` step to `pipeline/build.py` that regenerates the *computable*
parts (`prevalence`, `regional`, `stateN`) from the corpus so they track data
rebuilds, while the hand-authored §02 laws/paraphrases are read-forward from the
prior file (the exact pattern `build_spectrum` already uses for translations).

### 2. The page: `src/pages/patterns.astro` + islands

- `patterns.astro` wraps everything in `Layout.astro`, so it inherits the shared
  Header, Footer, and Tailwind theme automatically. Server-renders the hero and
  the three section intros (static prose).
- The interactive parts become React islands, matching how the site already
  splits server shell from client interactivity:
  - `BreadthExplorer.tsx` — §01 category filter + prevalence bars + tap-for-towns
    (tiles now link to town pages, see §4b).
  - `ApproachExplorer.tsx` — §02 topic tabs + approach menu + law cards. **The law
    cards render as a horizontal swipe rail** (scroll-snap row), not a tall
    vertical stack, so a 15-law topic stays one line. Each card keeps the tag,
    place, plain-English summary, and the "Show the actual law" expander. See
    Design revisions.
  - `RegionalExplorer.tsx` — §03 redesigned away from the 42-state ranked bar
    chart. See Design revisions for the chosen approach.
- All three import `patterns.json` (small enough to bundle, or fetch once via the
  existing `clientData` pattern — decided in build; leaning bundle-at-build since
  it is static and shared).
- **Anchors for deep-linking (B3):** section ids `#breadth`, `#approaches`,
  `#regional`, plus the §02 island reads `location.hash` on mount to pre-select a
  topic (e.g. `/patterns#noise` opens with Noise active). A sticky in-page
  01/02/03 nav lets a visitor jump to the part they care about.

### 3. Theming reconciliation

The standalone uses literal cream/rust hexes and its own category palette. Porting
swaps those for the site's tokens: `font-display`, `font-mono`, `text-ink-*`, the
rust accent var, `--rule`. The explorer's **categories** (business / conduct /
property / animals / recreation / vice / modern-life) are a *new, finer-grained
subject grouping* and are **not** the LOCUS topics (`Zoning/Nuisance/Buildings/
Business/Other`). That is fine and intended; we keep the explorer's own category
colors as literal Tailwind-safe strings (same constraint as `topics.ts` badge
classes — the scanner needs literal class names).

### 4. Homepage teaser (Option A, refined) — `src/pages/index.astro`

Lead with the three topics, demote the breadth. Replaces the "The dataset, in
numbers" stat-card section.

**Prominent: three featured topic cards.** Dangerous dogs, fireworks, backyard
chickens, under an eyebrow ("Same rule, different town") and a line ("See how
cities handle the same rule, differently."). Each card: the topic's emoji, its
name, a one-line hook drawn from the §02 `split`/`intro` data, and "See how cities
differ →" linking to `/patterns#<topic>` (which opens the full page with that
topic preselected). These are the visual anchor of the section.

- Hooks (from the data, kept short and labeled-as-estimates in spirit):
  - Dangerous dogs: "95% judge a dog by its behavior. 21%, mostly in the South,
    name specific breeds."
  - Fireworks: "Some ban them outright. Others allow them only on July 3rd–4th."
  - Backyard chickens: "Allowed with conditions in about half of towns. Banned or
    zoned to farmland in the rest."

**Demoted: the breadth.** Below the three cards, one quiet row: "Or browse all 47
things cities regulate, from alcohol to drones → The breadth", linking to
`/patterns#breadth`. The breadth no longer renders its bars on the homepage; it is
a link, deliberately less prominent than the three topics.

**Corpus numbers.** The four figures (2.2M ordinances, 50 states, etc.) do not
vanish: fold them into a single quiet caption line, or into the `#about` block, so
the headline scale is not lost.

Server-rendered Astro partial with the three hooks inlined at build (they are
static and tiny, so no client fetch — consistent with the build-cost rule). The
`FindMyTown` hero is untouched and stays at the very top.

### 4b. Clickable city tiles in §01 — reverse deep-link back to town pages

In §01, tapping a prevalence row reveals example-town chips ("Chattanooga, TN").
Today those are static text. Make each one a **link to that city's page, landing
with the relevant law surfaced.**

- **Link target:** `/{state}/{city}?q=<subject q>` using the resolved `id` and the
  subject's `q` term (both added to `patterns.json` above). Chips with `id: null`
  stay plain text.
- **Highlighting the relevant law (reuse existing machinery):**
  `JurisdictionModules` already holds a `seed` state that prefills `LawBrowser` and
  scrolls the browse into view. We add a small client-side read on mount:
  `new URLSearchParams(location.search).get("q")` → if present, initialize `seed`
  to `{ q }`. So arriving at `/tn/chattanooga?q=chicken` opens Chattanooga with the
  chicken laws already searched and scrolled to. No Astro page change needed (the
  island runs in the browser); no new search code.
- This is the mirror image of the town-page → explorer links (§6): §01 sends you
  *from* the national view *into* a specific town, §6 sends you *from* a town *out*
  to the national view. Together they make the horizontal and vertical layers a
  loop.

### 5. Header nav link — `src/components/Header.astro`

Add `{ href: "/patterns", label: "Patterns", mobileHidden: false }` to the `links`
array. (Label wording open: "Patterns" / "How towns differ" / "Field notes".)

### 6. Town-page deep-links (B2) — the highest-leverage move

On each place page, surface the explorer topics *that the town actually
regulates*, linked into the matching section of `/patterns`.

- Scope to the **5 §02 topics** (dangerous dogs, fireworks, backyard chickens,
  noise, short-term rentals), since those are the ones with rich linkable content.
- Matching is **client-side against the already-loaded jurisdiction document** (no
  pipeline change, no refetch): the town's laws are in memory in
  `JurisdictionModules`; we test each of the 5 topics against the same kind of
  title/keyword match `match_questions` / `CommonQuestions` already use.
- Render as one compact "Zoom out" strip (e.g. just above `TopicFingerprint` at
  the bottom): "How does [Town] compare?" with a chip per matched topic linking to
  `/patterns#<topic>`. Example copy: "[Town] is one of ~50% of U.S. towns that
  allow backyard chickens with conditions. See how towns differ →".
- Honesty: the comparative percentage comes straight from `patterns.json`
  (`topicPrev`), so it is the same labeled estimate, not a new claim.

## Guardrails to honor (non-negotiable)

- **AI-paraphrase labeling.** The §02 `plain` fields are paraphrases. They must be
  labeled "AI paraphrase, not the law — verify before relying on it" and shown
  *alongside* the verbatim `text`, never replacing it. The "Show the actual law"
  toggle already does the alongside part; the port must add the label.
- **Not legal advice** + OCR/machine-estimate caveats appear on the page (footer
  of the explorer already carries a "How to read this" block; keep it).
- **Non-commercial + attribution.** LOCUS is CC BY-NC; keep the LOCUS attribution
  and the CC BY-NC note on the page (it is already in the standalone footer).
- **No model calls** at build or runtime over law text (paraphrases are
  hand-authored and committed, same posture as `spectrum.json`).

## Build order (execute section by section after review)

1. **`patterns.json`** — DONE. `scripts/build_patterns.py` (`bun run data:patterns`)
   lifts the embedded `DATA`, resolves `examples[]` to `{name, id}` against
   `index.json` (279/282 = 99% resolved; 3 stay plain text), and adds the `q`
   term per subject → `public/data/patterns.json` (64 KB, committed). The US map
   topology is precomputed to SVG paths by `scripts/build-map-paths.mjs`
   (`bun run data:map`) → `public/data/us-state-paths.json` (51 states, committed),
   so no map library ships to the client. New devDeps: `d3-geo`, `topojson-client`,
   `us-atlas` (build-only).
2. **`/patterns` page** — DONE. `src/pages/patterns.astro` (Layout shell, hero,
   sticky 01/02/03 jump-nav, section intros, "how to read this" footer) + three
   islands `BreadthExplorer` / `ApproachExplorer` / `RegionalExplorer`, themed to
   site tokens. Shared data via memoized `loadPatterns()` / `loadStatePaths()` in
   `src/lib/patternsData.ts` (one fetch each, not 3×). §02 is `client:load` and
   reads `location.hash` to preselect a topic + scroll into view; §01/§03 are
   `client:visible`. `bun run build` passes (2341 pages). Previewed: all three
   sections, clickable tiles, swipe rail + verbatim toggle, map fills + subject
   switching, mobile — all working, no console errors.
3. **Header nav link** — DONE. "Patterns" added to `Header.astro`.
4. **Homepage teaser (refined Option A)** — DONE. Three featured topic cards
   (dogs/fireworks/chickens) placed right after `FindMyTown`, before `#about`;
   breadth demoted to a "browse all 47 things" link; the static stats grid removed.
5. **Clickable §01 tiles (§4b)** — DONE. Tiles link to `/{state}/{city}?q=…`;
   `JurisdictionModules` reads `?q=` on mount and seeds `LawBrowser` (verified: the
   browse prefills the term and scrolls into view).
6. **Town-page deep-links (B2)** — DONE. A "The bigger picture" strip matches the
   five §02 topics against the town's law titles client-side and links each to
   `/patterns#<topic>`.
7. **Docs** — DONE. `CLAUDE.md` updated (homepage, `/patterns` surface, the two
   data builders, the deep-link loop) and this file added to "Deeper context".

**Simplification pass (2026-06-26):** per request, copy was tightened throughout —
shorter section intros, the `/patterns` hero stat cards removed, tier labels
shortened and de-em-dashed ("The shared core" / "The optional middle" / "The long
tail"), and micro-labels trimmed ("of cities", "Towns with this rule", "Show
actual law", "Actual text (OCR'd)", "gray = no data", the AI-paraphrase note).

Each step is independently shippable and verifiable in the preview.

## Open sub-decisions (resolve before / during build)

1. **Route name** — `/patterns` (recommended) vs `/field-notes` vs other.
2. **Nav label** — "Patterns" (recommended) vs "How towns differ" vs "Field notes".
3. **Stat numbers on homepage** — fold the four corpus figures into a one-line
   caption under the teaser bars (recommended), or drop them entirely, or keep a
   smaller 4-card row below the bars.
4. **Pipeline generation of `patterns.json`** — v1 commits it hand-derived;
   confirm we are fine deferring the `build_patterns()` generator to a follow-up.

## Out of scope for this pass

- A `build_patterns()` pipeline generator (follow-up; v1 commits the JSON).
- Re-introducing any score-based national comparison (rankings/spectrum stay
  removed; this layer is concrete-ordinance-based on purpose).
- Reviving global cross-jurisdiction search.
