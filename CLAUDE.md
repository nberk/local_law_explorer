# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local Law Lookup — a free, non-commercial static site that turns the open
**LOCUS-v1** local-ordinance corpus into plain, browsable city/county law for
ordinary readers. Live at https://locallaw.pages.dev. Not legal advice; the text
is OCR'd and the labels are machine-generated.

## Commands

```bash
bun install                 # deps (always use bun, not npm/yarn)
bun run dev                 # dev server at http://localhost:4321 (binds 0.0.0.0)
bun run build               # static output → dist/
bun run preview             # serve the built dist/
bun run data:build          # regenerate public/data/ from LOCUS (see pipeline below)
```

There is no test suite, linter, or typecheck script. `bun run build` (Astro's
build) is the closest thing to a correctness gate — it fails on type errors in
`.astro`/`.ts` and on broken static paths, so run it before committing.

The dev server intentionally binds `0.0.0.0` (in `astro.config.mjs`) so the
Claude preview headless browser (which hits `127.0.0.1`) can connect.

## Architecture: two halves, one flat-file contract

The app is a **build pipeline** and a **static site** that never talk directly —
they meet only at JSON files in `public/data/`.

1. **Pipeline** (`pipeline/build.py`, Python + DuckDB) — queries the LOCUS-v1
   parquet over HuggingFace's `hf://` protocol (no download needed; pass
   `--source '/path/*.parquet'` for local files). For each pilot jurisdiction it
   filters to `source_jurisdiction_type='cities' AND is_substantive`, cleans the
   header into a `(title, section)` pair, tags each law with the lenses it
   belongs to, and writes:
   - `public/data/index.json` — manifest: corpus-wide stats + one summary per
     jurisdiction (counts, size, medianOpacity).
   - `public/data/<state>/<slug>.json` — the full law list for one jurisdiction.

   It queries **one jurisdiction at a time** on purpose: simple equality
   predicates let DuckDB push down to the right parquet row groups; a combined
   `IN` on a computed key defeats pushdown and destabilizes the remote read.

2. **Static site** (Astro 6 + React islands + Tailwind v4) — at build time,
   `src/lib/data.ts` reads those JSON files from disk (`loadIndex`,
   `loadJurisdiction`) and `src/pages/[state]/[city].astro` statically generates
   one HTML page per jurisdiction via `getStaticPaths`. In the browser, the
   `LawBrowser` React island `fetch`es that jurisdiction's JSON and does all
   search/filter/sort client-side. All expensive work is at build time; the
   browser just downloads small JSON and filters it.

`public/data/` is **committed to the repo** (~92 MB; largest file ~15 MB) so the
site builds and deploys without running the Python pipeline. CI does not run the
pipeline. Re-run `bun run data:build` only when changing jurisdictions or the
data shape — it needs `python3` with `duckdb` (`pip install duckdb`) and network.

## Domain model (shared types in `src/lib/topics.ts`)

- **Topics** (`Zoning`, `Nuisance`, `Buildings`, `Business`, `Other`) are model
  predictions from LOCUS, not official categories. `Other` is effectively the
  classifier's junk drawer (code mechanics, penalties, ceremonial provisions),
  and the classifier sometimes mislabels (e.g. "Municipal flag" tagged
  `Nuisance`). Treat topics as noisy.
- **Lenses** (`everyday`, `business`, `renting`) are *our own* keyword groupings
  layered on top, assigned in `pipeline/build.py:lenses_for()`. Important:
  `everyday` contains **every** law (no filter); `business` = topic Business or a
  business keyword; `renting` = topic Nuisance or a housing keyword. The lens
  lexicons (`BUSINESS_KW`, `HOUSING_KW`) live in the pipeline.
- **Scores** (`opacity`, `paternalism`, `enforcement_discretion`,
  `problem_salience`) come straight from the LOCUS models. `opacity` drives the
  "densely worded" badge (z ≥ `OPACITY_FLAG`). **`problem_salience` is a
  social-problem axis (skews to crime/loitering/nuisance), NOT a relevance score
  — do not use it to sort the default browse.**

## Result ordering & search (`src/components/LawBrowser.tsx`)

This is where the most subtle product logic lives, because the corpus has no
clean "resident-relevant" signal:

- **Search** ranks by where the term hits: title-prefix > title > section > body.
  Without this, an incidental body mention outranks the on-topic law.
- **Default (unsearched) browse** demotes administrative boilerplate to the
  bottom via `isBoilerplate()` (topic `Other` OR an anchored ceremonial/code-
  mechanics title regex), keeping source order otherwise. This is a **UI-side
  stopgap**; the real fix is a build-time `rank` field. See
  `docs/locus-tools-plan.md` §12 (UX pass) and §13 (planned pipeline ranking)
  before touching ordering.

Tailwind is v4 via the `@tailwindcss/vite` plugin (no `tailwind.config`). Topic
badge/color classes in `topics.ts` are written as **literal strings** so
Tailwind's scanner picks them up — don't refactor them into computed class names.

## Deploy & CI

- Hosting: Cloudflare Pages project **`locallaw`** (account "Berk Labs"),
  production branch **`main`** → `locallaw.pages.dev`.
- `.github/workflows/deploy.yml` builds with Bun and runs
  `wrangler pages deploy dist --project-name=locallaw --branch=main` on every
  push to `main` (and via `workflow_dispatch`). Requires repo secrets
  `CLOUDFLARE_API_TOKEN` (Pages:Edit) and `CLOUDFLARE_ACCOUNT_ID`.
- Manual deploy (if needed): `bunx wrangler pages deploy dist --project-name=locallaw`.

## Constraints to preserve

- **Licensing:** code is MIT (`LICENSE`); the data in `public/data/` is LOCUS-v1
  under **CC BY-NC 4.0**. Keep the site non-commercial (no ads/paywall) and keep
  attribution in the footer, `/about`, and `ATTRIBUTION.md`.
- **Disclaimers are load-bearing.** "Not legal advice" + the OCR/machine-label
  provenance caveats appear on every view by design. Don't quietly remove them,
  and never present topics/lenses/scores as authoritative.
- **v1 shows original ordinance text only** — no LLM summaries or rewrites of the
  legal text (a deliberate product decision; see plan doc D1).

## Deeper context

`docs/locus-tools-plan.md` is the full design record: the product plan, the UX
testing pass and the fixes made (§12), and the planned (not-yet-built)
pipeline-level relevance ranking (§13).
