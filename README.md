# Local Law Lookup

A free, non-commercial website for reading the U.S. city and county ordinances
that shape everyday life (noise, pets, fences, permits, rentals, starting a
business), in plain, browsable form. Built on the open
[LOCUS-v1](https://huggingface.co/datasets/LocalLaws/LOCUS-v1) corpus.

**Live:** [locallaw.pages.dev](https://locallaw.pages.dev) — pilot release with
detailed pages for 19 jurisdictions (major cities and a sample of small towns).

> Not legal advice. Text is OCR'd and labels are machine-generated. See
> [ATTRIBUTION.md](./ATTRIBUTION.md) and `/about`.

## How it works

Two halves with a flat-file contract between them:

1. **Build pipeline** (`pipeline/build.py`, Python + DuckDB): queries the LOCUS
   parquet over HuggingFace's `hf://` protocol. It first computes national
   baselines from the whole corpus, then for each pilot jurisdiction keeps the
   substantive laws, cleans headers, tags lenses, and synthesizes a comparative
   **Place Portrait**, everyday-question matches, notable rules, and the homepage
   **spectrum** samples — writing it all as static JSON into `public/data/`. The
   pipeline makes no model calls; the plain-language translations shown on the
   homepage are hand-authored and committed in `public/data/spectrum.json`.
2. **Static site** (Astro + React islands + Tailwind v4): one statically generated
   page per jurisdiction. A single client island fetches that jurisdiction's JSON
   once and renders the portrait, common questions, notable rules, and a
   searchable full browse from it.

The homepage leads with two interactive **spectrum explorers** — drag a handle
from plain English to dense legalese, or from hands-off to conduct-regulating, and
read a real law at each stop with a plain-language version beside the original.
Below them is the city picker. Each jurisdiction page opens with the portrait (how
the place governs vs. the rest of the US), answers everyday "Can I…?" questions,
surfaces distinctive rules, and ends with the full searchable browse.

See [docs/locus-tools-plan.md](./docs/locus-tools-plan.md) for the full plan.

## Develop

```bash
bun install
bun run data:build   # (re)generate public/data from LOCUS — needs python3 + duckdb
bun run dev          # http://localhost:4321
bun run build        # static output in dist/
```

The pipeline needs Python with `duckdb` (`pip install duckdb`). It defaults to the
remote dataset; pass `--source '/path/*.parquet'` for local parquet files.

## Deploy (Cloudflare Pages)

Hosted on Cloudflare Pages with native Git integration: every push to `main`
builds and deploys automatically (pull requests get preview URLs). Build settings
(configured in the Cloudflare dashboard):

- Build command: `bun install && bun run build`
- Output directory: `dist`
- Env var: `BUN_VERSION` — required, because Cloudflare doesn't auto-detect the
  text `bun.lock`; without the explicit `bun install` + a pinned Bun version the
  build falls back to npm.

Set the production domain in `astro.config.mjs` (`site`).

## Design

Mirrors the sibling `legalbenchmarks` project: Inter / Source Serif 4 / JetBrains
Mono, an ink + accent-blue palette, light mode only.

## License

- **Code:** MIT — see [LICENSE](./LICENSE).
- **Data** (`public/data/`): the LOCUS-v1 corpus, used under
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (non-commercial),
  attributed in [ATTRIBUTION.md](./ATTRIBUTION.md), the site footer, and `/about`.
  This site carries no ads or paywall, in keeping with that license.
