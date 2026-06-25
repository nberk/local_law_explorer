# Redesign pass — "self-explanatory & cleaner" (2026-06-25)

> **Status: implemented.** All 8 parts shipped + the Legalese generator removed
> from the pipeline (`build_legalese`, `legalese.json`). `bun run build` passes
> (2,292 pages); verified in the browser preview (homepage, place page, /map,
> /spectrum, removed /legalese 404s). Net −227 lines.
>
> **Follow-up (same day):**
> - **State directory pages** at `/[state]` (`src/pages/[state]/index.astro`),
>   reached by the now-clickable state in the place-page breadcrumb. Server-rendered
>   from `index.json`, grouped Cities/Counties, vanilla-JS name filter.
> - **Gauge → static spectrum.** The place-page report-card gauges used a round
>   knob with a ring that looked draggable. Replaced with a filled gradient bar +
>   a caret pointer (`DIMENSION_META.gradient`), unambiguously a spectrum, not a
>   slider. (The `/spectrum` explorer keeps its thumb — that one IS draggable.)
> - **Mobile pass.** Header overflowed at 375px (long wordmark + nav). Added an
>   `xs` (400px) breakpoint in `global.css`; wordmark collapses to the "L" mark
>   below it, and the nav can shrink/scroll (`min-w-0 overflow-x-auto`). All key
>   pages verified overflow-free at 375px. Build → 2,342 pages.


Guiding principle from the user: **the experience should be more self-explanatory
and cleaner.** This doc is the plan for an 8-part redesign. Parts 1–7 are
mechanical/structural and specified; part 8 (the place page) is a design choice
with four candidate directions (see the bottom + the inline visual mockups).

## The eight changes

### (1) Lead with the dataset explainer + disclaimer, not bury them
Homepage currently ends with the "Local ordinances… most scattered law in
America" explainer + the corpus stat cards, then the "not legal advice"
disclaimer. **Move both to the top**, right under the hero, as the lead context.
The stat cards (Ordinances / States / Cities / Counties) ride with the explainer.

- File: `src/pages/index.astro` — reorder sections.

### (2) Keep "Use my location" + nearest city/county; make the cards obviously clickable
`FindMyTown` already shows the nearest city + county as cards. Make it explicit
they're clickable (e.g. a clearer "Open this town →" affordance / hover state),
and remove the per-card synthesized **summary line** (the `portraitTeaser.headline`,
e.g. *"light on nuance rules, densely written"*) from the little preview box.

- Files: `src/components/FindMyTown.tsx` (drop `portraitTeaser` line in `ResultCard`,
  strengthen the click affordance).

### (3) Move "pick a place" to its own "Explore cities" tab, combined with the map
The homepage `JurisdictionPicker` ("Already know the town?") moves off the
homepage into a dedicated page. That page is the **map on top, the searchable
city cards (high-population first) below it** — one "browse the country" surface.
Nav label: **"Explore cities"** (page H1: "Explore cities across the country").

- Rename/replace `/map` → this combined page (map + picker), or keep `/map` route
  and retitle. Decision: reuse the `/map` route, retitle nav + page, append
  `JurisdictionPicker` under `JurisdictionMap`. Remove picker from homepage.
- Files: `src/pages/map.astro`, `src/components/Header.astro`, `src/pages/index.astro`.

### (4) Move the spectrum explorers to their own page with a real explanation
The two `SpectrumExplorer` islands leave the homepage. New page (e.g.
`/spectrum`, nav "How laws differ" or "The spectrum") that **clearly explains
what the spectrum is**: every ordinance in LOCUS is scored by AI on a few
dimensions; here are two of them; drag the handle to read a real law at each
point on the scale, plain-language beside the original. Kill the cryptic title
"The law isn't one thing. Slide across it."

- Files: new `src/pages/spectrum.astro`, `src/components/Header.astro`,
  `src/pages/index.astro` (remove section). Reuse `SpectrumExplorer` as-is.

### (5) Remove the Legalese-o-Meter entirely
Delete the page, component, nav link, data loader, and the `data:build` legalese
output is left in place (committed file can stay; just unreferenced) OR remove
the loader usage. Scoped removal — no orphaned imports.

- Files: delete `src/pages/legalese.astro`, `src/components/LegaleseMeter.tsx`;
  remove the nav link in `Header.astro`; drop `loadLegalese`/`LegaleseLaw`/
  `LegaleseFile` from `src/lib/data.ts` if unused elsewhere.

### (6) Rename "Local Law Lookup" → "Local Law Explorer"
Everywhere: header logo, `Layout.astro` default title, every page `<title>`,
`about.astro` body copy.

### (7) Map dots: one color, keep size
Drop the topic-based coloring in `JurisdictionMap`; all dots one neutral/brand
color. Keep `radius()` size-by-law-count. Simplify the legend (size only; keep
city-filled vs county-ring if we keep that distinction — TBD, lean: keep it).

- File: `src/components/JurisdictionMap.tsx`.

### (8) Revamp the place page — FOUR concepts (pick one)
Shared rules across all four:
- **Topic breakdown** (Zoning/Nuisance/etc.) demoted to the **bottom**.
- **Top = a genuinely interesting quick overview**, not a code breakdown.
- The **plainness / bright-line comparison stays but is spelled out in plain
  English** (what "plainer" means, what "bright-line vs. judgment-call" means).
- Remove the confusing **"See the laws behind this →"** affordance copy.
- Keep **Everyday Questions**, but show the **full law text** inline (today it's a
  2-line clamp with an external link).
- Remove all **"Find in official code →"** links (`sourceSearchUrl`) site-wide.

The four leads:
- **A. Plain-English Report Card** — hero = the headline rewritten as one human
  sentence + 3 spelled-out trait gauges (Plain↔Dense, Hands-off↔Controlling,
  Bright-line↔Judgment-call), each with a worked explanation + a real example law.
- **B. "What can you actually do here?"** — hero = the Everyday Questions as big
  cards (chickens, Airbnb, noise…), full law text on expand. Comparison section
  second. Topics last.
- **C. Two-spectrum personality** — hero = two bold horizontal spectrum bars
  placing this town between named extremes, each with a plain explanation + an
  example law pulled from this town. Questions next. Topics last.
- **D. Highlights reel** — hero = a curated set of this town's most surprising /
  notable real laws as magazine-style cards with plain glosses. Then comparison,
  questions, topics.

## Decisions (resolved 2026-06-25)
- **Part 8: Concept A — Plain-English Report Card.** Lead = one-sentence summary
  + three spelled-out trait gauges (Plain↔Dense, Hands-off↔Controlling,
  Bright-line↔Judgment-call). Each gauge carries a static plain-English
  explanation of *what the dimension means* plus this town's sentence. Topic mix
  to the bottom. Everyday Questions below the gauges, full text inline. "Notable
  rules" rides along (folds in concept D's idea). No place-page hero from B/C/D.
- **Part 3 nav:** route stays `/map`; nav label "Explore cities"; H1 "Explore
  cities across the country"; `JurisdictionPicker` appended below the map.
- **Part 4 nav:** new route `/spectrum`; nav label "How laws differ".
- Proceed with parts 1–7 as written, together with Concept A.

Nav after this pass: Find your town (/) · Explore cities (/map) · How laws
differ (/spectrum) · Rankings (/rankings) · About the data (/about). Legalese
removed.

## Out of scope (flag, don't touch)
- The pipeline (`build.py`, spectrum.py) — these changes are presentation-only.
- R2 / data shape — unchanged.
- `sourceSearchUrl` can stay in `topics.ts` as dead code or be removed; removing
  is cleaner (no orphaned helper). Lean: remove once no callers remain.
