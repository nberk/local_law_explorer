# Remove the `/rankings` page (2026-06-25)

The national-scale "Rankings" page was removed. It placed covered jurisdictions
on the national distribution per dimension (top-100 on the chosen axis, framed as
percentiles, never a leaderboard verdict). The place-page report card
(`PlacePortrait`) already gives every town its percentile framing inline, so the
standalone page was redundant.

## What was removed

- `src/pages/rankings.astro` — the page shell.
- `src/components/RankingsTable.tsx` — the island it rendered (its only caller).
- `src/components/NationalPositionBar.tsx` — the 0–100 position bar, used only by
  `RankingsTable` after earlier passes moved it off the place page.

## Links / nav cleaned up

- `src/components/Header.astro` — dropped the `/rankings` nav entry.
- `src/pages/index.astro` — removed the "Rankings →" card from the "Or explore"
  row and shrank that grid from `sm:grid-cols-3` to `sm:grid-cols-2` (two cards
  left: "Explore cities" and "How laws differ").

## Orphaned code removed

- `DimensionMeta.rankLabel` (+ the three entries in `DIMENSION_META`) in
  `src/lib/topics.ts` — the column/toggle label was rankings-only.
- `JurisdictionSummary.dimensions` (the optional per-dimension percentile block)
  in `src/lib/topics.ts` — read only by `RankingsTable`. The place-page portrait
  uses its own `portrait.dimensions`, a different field, and is unaffected.
- Stale `/rankings` comment reference in `src/components/JurisdictionMap.tsx`.

## Left in place (intentionally)

The pipeline (`pipeline/build.py`) still emits a `dimensions` percentile block
into each `index.json` entry. It is now dead data, but purging it would require a
full data rebuild + R2 re-upload. It is small and harmless; drop it on the next
scheduled data rebuild rather than rebuilding just for this.

Historical design docs (`docs/homepage-redesign.md`, `docs/locus-tools-plan.md`,
`docs/map-view.md`) still mention rankings — those are dated records of past work
and were left as-is.
