# Remove the `/spectrum` "How laws differ" page (2026-06-25)

The `/spectrum` page (two `SpectrumExplorer` islands — a draggable rail per
dimension with a plain-language ⇄ original toggle and a readability "squint")
was removed at the user's request, along with its nav link and homepage card.

## Removed

- `src/pages/spectrum.astro` — the page.
- `src/components/SpectrumExplorer.tsx` — the island (only used by that page).
- `src/lib/readability.ts` — readability facts, imported only by `SpectrumExplorer`.
- `loadSpectrum` + `SpectrumLaw` / `SpectrumFile` types in `src/lib/data.ts`
  (read only by the page).

## Links / nav cleaned up

- `src/components/Header.astro` — dropped the "How laws differ" nav entry.
- `src/pages/index.astro` — removed the "How laws differ" card from the "Or
  explore" row, leaving a single "Explore cities" card (container changed from a
  two-column grid to a single `max-w-md` block).

## Kept on purpose

`public/data/spectrum.json` and the pipeline that builds it (`pipeline/spectrum.py`,
`build_spectrum` in `pipeline/build.py`) are **retained**. They are now unused by
the site, but:

- **The hand-authored plain-language translations live only in `spectrum.json`.**
  With `/spectrum` gone they have **no display surface anywhere on the site**. The
  data is kept so a future surface (e.g. inline translations on a place page) can
  reuse them without re-authoring. This is the one user-visible consequence worth
  remembering — flagged in `CLAUDE.md` under the plain-language guardrail.

Dropping the pipeline step + data file would be a separate, larger change (edits
`build.py`, deletes committed data); not done here.

## Note: in-town search already exists

Unrelated to this removal, but often asked alongside it: every city/county page
already has a search box — `LawBrowser` in the "Dig deeper: browse every rule"
section ranks that town's laws by title-prefix > title > section > body. No new
search infrastructure is needed for per-page search.
