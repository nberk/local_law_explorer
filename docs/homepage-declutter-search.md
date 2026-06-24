# Homepage declutter + search resolution (2026-06-24)

Decisions captured from the PM pass on 2026-06-24. Supersedes the homepage IA in
`docs/homepage-redesign.md` for ordering and the search story.

## The problem

1. **Wrong hero.** The core job-to-be-done is "what are the local laws where I
   live?" — i.e. `FindMyTown`. Today it's the *third* section, below two abstract
   spectrum explorers.
2. **Clutter.** Four entry points compete on one page with equal billing: the
   hero search box, the spectrum explorers, `FindMyTown`, and the
   `JurisdictionPicker`.
3. **Search is broken.** The hero box posts to `/search`, which renders
   `GlobalSearch.tsx`. That fetches `/data/search/{manifest,meta}.json` — files
   that **do not exist in the repo** (never committed, not gitignored, just
   absent), despite `CLAUDE.md` claiming they're committed. With no `meta.json`
   even the lexical fallback has nothing to rank. The site's primary CTA leads to
   a dead page.

## Decisions (locked)

- **Hero = `FindMyTown`** (instructed).
- **Spectra: keep, demoted below the fold** (signature feature, but not the hero).
- **Search direction A: in-town search.** Search is an action you take *inside* a
  town you've located/opened (`LawBrowser` already does this over the town's
  loaded JSON — no global index infra, works at full rollout). The cross-town
  global semantic search does not fit direction A.
- **Translation: hand-authored only, no model call.** Plain-language text stays in
  `spectrum.json` (committed, hand-written, labeled "AI paraphrase, not the law").
  No runtime model call over law text. The spectrum explorers are the
  translation showcase.

## New homepage information architecture

Top → bottom, one clear intent per band:

1. **Hero — "Find your town."** Headline + one-line subhead + `FindMyTown`
   (zero-click IP guess → "use my location" → ZIP/name). This is the primary
   action, above the fold.
2. **Pick a specific town.** `JurisdictionPicker` (search-as-you-type over all
   ~2,287 cities & counties; largest-first shortlist until you type). The
   "I already know which town" path.
3. **See the law in plain language** *(demoted spectra).* The two
   `SpectrumExplorer` islands (opacity, paternalism), reframed as "what plain
   language looks like" — the hand-authored translation showcase. Below the fold.
4. **The dataset.** Corpus explainer + the 4 stat tiles (unchanged).
5. **Disclaimer** (unchanged, load-bearing).

Removed from the homepage: the hero free-text search box (it pointed at the dead
global search and doesn't fit direction A).

## Search resolution

**Retire the broken global-search stack.** It's non-functional, off-brand for
direction A, and a maintenance liability. Removal (reversible via git):

- `src/pages/search.astro` — delete.
- `src/components/GlobalSearch.tsx` — delete.
- `src/components/searchWorker.ts` — delete.
- `functions/api/search.ts` — delete (Workers AI search endpoint; no longer used).
- `src/lib/search.ts` — delete **iff** nothing else imports it (verify first;
  `SEARCH_SYNONYMS` / `lexicalRank` may be reused by `LawBrowser`).
- `Header.astro` — remove the `/search` ("Ask the law") nav link.
- `index.astro` — remove the hero search `<form>`.
- `CLAUDE.md` — remove the now-false "global semantic search" + committed-index
  claims; note search is in-town only.

**In-town search stays as-is** (`LawBrowser`) — it already searches the town's
laws with title-prefix > title > section > body ranking. No change required for
this pass; it's the search story going forward.

**Hand-authored translation surfacing (optional, phase 2 — not in this PR):**
where a law shown in `LawBrowser` matches a `spectrum.json` entry
(`jurisId|section|title`), show its `plain` text inline. Tiny overlap today
(~20 laws), so deferred; the spectra already showcase the translations.

## Out of scope (flag, don't build)

- Model-powered translation of arbitrary results (rejected this pass; revisit if
  hand-authoring proves too thin).
- Rebuilding the global semantic vector index (direction B — parked).

## Verification

- `bun run build` is the correctness gate (type errors in `.astro`/`.ts`, broken
  static paths). Run before committing.
- Preview the homepage: hero is `FindMyTown`, no dead search box, nav has no
  "Ask the law", `/search` 404s cleanly (or is removed from nav so it's
  unreachable).
