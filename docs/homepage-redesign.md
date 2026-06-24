# Homepage redesign + data-viz pass (2026-06-23)

Implementation plan for four requested changes. Execute section by section after review.

## The four asks

1. **Simpler "what this is" copy.** The text under the hero must plainly say where the
   data comes from, what the LOCUS project is, that this site is only a *viewer* on top of
   that data, and that the data was **released June 2026**.
2. **Interactive, non-state-specific homepage tools.** Lead the homepage with engaging
   tools that show interesting things. Confirmed scope: an **opacity spectrum** and a
   **paternalism spectrum**. Each samples ~20 real laws across the scale and lets people
   read the **original text** and a **plain-language translation** side by side. The
   Legalese-o-Meter's gauge/squint idea folds into the opacity spectrum. City-specific
   pages move *below* these tools.
3. **Fix the confusing "more laws of X type" display.** Replace the abstract percentile
   dot + prose ("devotes more of its code to zoning than 80% of towns") with clearer
   comparative graphics.
4. **More visuals throughout.**

## Key decision (resolved 2026-06-23)

The project's "**original ordinance text only — no LLM rewrites**" guardrail (plan doc D1)
is **removed** per the user. We may publish **plain-language translations of laws**. They
are always shown *alongside* the original, never replacing it, and are clearly labeled as
an AI-generated plain-language summary, not the law. All other honesty guardrails stay
(machine-estimate labels, percentile framing, not-legal-advice, OCR caveats).

Translations are **hand-authored by Claude and committed** as static data (no API key, no
build-time model calls, fully reviewable in the diff). A pipeline step selects the laws
deterministically and *preserves* hand-authored translations across rebuilds.

---

## 1. Data layer — `public/data/spectrum.json` (new, committed)

One new flat file, consumed by the homepage exactly like the others.

```jsonc
{
  "generated": "2026-06-23",
  "spectra": {
    "opacity":     { "key": "opacity",     "laws": [ /* ~20, sorted by score asc */ ] },
    "paternalism": { "key": "paternalism", "laws": [ /* ~20, sorted by score asc */ ] }
  }
}
```

Each law entry (reuses the existing `LegaleseLaw` shape + two fields):

```jsonc
{
  "jurisId": "il/chicago", "jurisName": "Chicago", "state": "IL", "slug": "chicago",
  "title": "...", "section": "9-4-020", "topic": "Nuisance",
  "score": 1.83,            // raw z-score for this dimension
  "content": "original ordinance text (capped ~1200 chars)",
  "plain": "Plain-language translation (hand-authored)."
}
```

Percentile is **not stored** — derived client-side via the existing `zToPercentile(z)`
in `src/lib/readability.ts` (same function the Legalese-o-Meter already uses). DRY.

### Selection rule (deterministic)

Pool = every pilot law with a non-null score for the dimension, where:
`180 ≤ len(content) ≤ 1400`, ≥ ~25 spaces (legible, translatable), non-empty title, not
boilerplate, `topic != "Other"` (the classifier's junk drawer). Sort ascending by score;
pick **20 evenly spaced by rank**; when a pick repeats a jurisdiction, nudge to the
nearest unused law in a small window preferring a new place (variety). This yields a
smooth low→high gradient sampling the whole range.

### Build path

- **Pipeline:** add `build_spectrum(pool, baselines)` to `pipeline/build.py`, accumulating a
  pool during the existing per-jurisdiction loop (like `legalese_pool`). On write it reads
  the prior `spectrum.json` (if present), keyed by `jurisId|section|title`, and carries
  forward any existing `plain` value so a rebuild never clobbers hand-authored
  translations (new/changed laws get `plain: null`).
- **Now (authoring):** run the same selection over the *committed* per-jurisdiction JSON to
  produce candidates, read them, hand-author `plain`, and commit `spectrum.json`.

`src/lib/data.ts`: add `SpectrumFile`/`SpectrumLaw` types + `loadSpectrum()`.

---

## 2. Homepage tools — `SpectrumExplorer.tsx` (new React island)

One flexible component drives both axes (props: `laws`, `dimKey`, endpoint labels, accent).

- **The rail.** A horizontal gradient track (opacity: green→amber→red = plain→dense;
  paternalism: calm→accent = hands-off→regulates). Each law is a tick placed by its
  percentile; a draggable thumb + click-to-select. Endpoint labels at each end.
- **The selected law.** Card with jurisdiction · section, title, score/percentile, and a
  **segmented toggle: [Plain language] · [Original]** (default Plain). The plain panel
  carries the label *"Plain-language summary · written by AI from the text below · not the
  law."* The original panel shows the verbatim (capped) text.
- **Opacity extras** (`dimKey === "opacity"` only): the readability facts (avg sentence,
  reading grade) from `readability()`, plus the **squint** blur toggle (ported from
  `LegaleseMeter`). Reuses `readability.ts`.
- Prev / next / "show me another", and a "More from {town} →" link to the city page.

`LegaleseMeter.tsx` and `/legalese` stay as-is (the standalone gauge page). The opacity
spectrum is the homepage realization of the same idea.

## 3. Homepage restructure — `src/pages/index.astro`

New top-to-bottom order:

1. **Hero** — keep the h1; rewrite the subtext (ask #1). Draft:
   > City and county ordinances govern noise, pets, fences, permits, and more. They're
   > public but scattered and hard to read. This site is a viewer for **LOCUS**, an open
   > dataset of U.S. local law released in **June 2026** that gathered millions of these
   > ordinances into one place. We don't write or change the law — we just make the
   > dataset easy to explore. *(restructured to avoid the em-dash in final copy)*
2. **Two spectrum tools** — `<SpectrumExplorer>` ×2 with a one-line intro each.
3. **Find your town** — the existing `JurisdictionPicker` (moved here).
4. **Corpus stats** (compact) + source/attribution links (LOCUS on HF, the paper, /about).
5. **Not-legal-advice** disclaimer banner.

---

## 4. Better data viz (asks #3 + #4)

### 4a. `TopicFingerprint.tsx` — replaces the topic bar on the city page

Renders server-side in `[city].astro` (which already has `counts`; add `loadBaselines()`
to get national median shares). For each of the 5 topics, one row:

```
Zoning      ▕████████████▏· typical          23%  (typical 16%)
Nuisance    ▕██████▏  · typical               11%  (typical 18%)
```

A track (0 → ~0.45 share), this town's share as a filled bar, a vertical tick at the
**national median** for that topic, and a label "this %" + "(typical N%)". Whether the bar
clears the tick instantly shows over/under-representation — no percentile prose needed.
Replaces the current thin stacked bar + count legend.

### 4b. `NationalPositionBar` — clearer than the `PercentileBar` dot

Used in `PlacePortrait.tsx` (dimension + topic standout rows). A 0–100 axis with a faint
"typical" mark at 50, low/high end labels, and this town's marker with the percentile
value shown. Turns the abstract dot into a labeled position on a national scale.

### 4c. `RankingsTable.tsx`

Add the same "typical (50th)" reference mark to its bars so a town's placement reads as
"vs. the typical US town," consistent with 4b.

---

## Files

**New:** `public/data/spectrum.json`, `src/components/SpectrumExplorer.tsx`,
`src/components/TopicFingerprint.tsx`.
**Edit:** `pipeline/build.py` (+`build_spectrum`), `src/lib/data.ts` (loader+types),
`src/pages/index.astro` (restructure), `src/pages/[state]/[city].astro` (fingerprint),
`src/components/PlacePortrait.tsx` (position bar), `src/components/RankingsTable.tsx`
(typical mark), `CLAUDE.md` + this `docs/` set (D1 reversal, new data file, new tools).

## Honesty / guardrails preserved

- Plain-language panels labeled "AI summary · not the law"; original always present.
- Spectrum scores labeled machine estimates; percentile framing kept.
- Not-legal-advice + OCR/machine-label caveats remain on every view.

## Build order

1. `data.ts` types + loader. 2. Selection script + author `spectrum.json`. 3.
`SpectrumExplorer`. 4. Homepage restructure + copy. 5. `TopicFingerprint` + city page.
6. `NationalPositionBar` in portrait + rankings. 7. `build_spectrum` in pipeline. 8. Docs.
9. `bun run build` gate + preview verification.
