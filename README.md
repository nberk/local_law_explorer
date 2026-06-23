# Local Law Lookup

A free, non-commercial website for reading the U.S. city and county ordinances
that shape everyday life (noise, pets, fences, permits, rentals, starting a
business), in plain, browsable form. Built on the open
[LOCUS-v1](https://huggingface.co/datasets/LocalLaws/LOCUS-v1) corpus.

> Not legal advice. Text is OCR'd and labels are machine-generated. See
> [ATTRIBUTION.md](./ATTRIBUTION.md) and `/about`.

## How it works

Two halves with a flat-file contract between them:

1. **Build pipeline** (`pipeline/build.py`, Python + DuckDB): queries the LOCUS
   parquet files over HuggingFace's `hf://` protocol, keeps substantive laws for
   the pilot jurisdictions, cleans headers, tags each law with the lenses it
   belongs to, and writes static JSON into `public/data/`.
2. **Static site** (Astro + React islands + Tailwind v4): statically generates a
   page per jurisdiction; the browser lazy-loads one small per-jurisdiction JSON
   file and filters it client-side across three lenses.

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

Static output. Build command `bun run build`, output directory `dist`. Set the
production domain in `astro.config.mjs` (`site`).

## Design

Mirrors the sibling `legalbenchmarks` project: Inter / Source Serif 4 / JetBrains
Mono, an ink + accent-blue palette, light mode only.
