# Global Semantic Search ("Ask anything")

> **DEPRECATED (2026-06-24).** This feature was removed — its index files were
> never committed, so `/search` was a dead end. The product moved to in-town
> search only (`LawBrowser`). See `docs/homepage-declutter-search.md`. This
> document is kept only as the design record if "direction B" is ever revived.

## Context

Today search is **per-jurisdiction and lexical**: `LawBrowser` does
`title/content.includes(term)` over one town's laws, ranked by *where* the term
hits (title-prefix > title > section > body). It can't answer a plain-language
question, can't cross jurisdictions, and misses anything phrased differently from
the ordinance wording ("my neighbor revs his bike at 2am" never finds a *noise*
ordinance).

We want a **global, plain-language search**: type a question, get the actual
ordinances that best match it — ranked by **meaning**, across all 19 pilots, with
suggested questions to ask.

### What "an answer" means here (guardrail-compliant by design)

The result is **the real ordinance text, semantically ranked** — never an
AI-written answer. This is deliberate and preserves every load-bearing guardrail:

- **"Original ordinance text only / no LLM summaries."** The only model call is to
  embed the *user's query string* into a vector. We never generate, rewrite, or
  summarize legal text. Results are verbatim ordinances.
- **"Rules that mention this, not yes/no."** Copy frames results as "ordinances
  most related to your question," labeled estimates, with the existing
  not-legal-advice / OCR / machine-label caveats reused verbatim.

### Decisions (locked with the user)

| Fork | Choice |
|---|---|
| Answer style | Real text, ranked by meaning (no AI paraphrase) |
| Scope | New **global** surface across all 19 jurisdictions |
| Query embedding | **Cloudflare Pages Function + Workers AI** (`@cf/baai/bge-small-en-v1.5`) |
| Similarity topology | **Ship ~17 MB precomputed vectors; cosine runs in the browser** |

Recurring cost: **$0** (Pages Function + Workers AI free daily allocation; static
vector/metadata files). No Vectorize, no Workers Paid, no API token in the repo.

---

## Architecture

The existing "two halves meet only at JSON in `public/data/`" contract is
preserved, plus one tiny serverless surface that does exactly one thing.

```
Offline (Python)            Static assets                 Runtime
─────────────────           ──────────────────────        ────────────────────────
build_search.py    ──────►  public/data/search/
  embed 44,759 laws           vectors.bin  (~17 MB int8)   browser: cosine(query, 44k)
  (fastembed, bge-small)      meta.json    (~13 MB)         │  └─ Web Worker
                                                            ▼
                            functions/api/search.ts  ◄──── browser: POST { q }
                              Workers AI embeds the         (returns 384-float
                              ONE query string only          query vector)
```

**Why this shape:** the heavy, occasional work (embedding 44k laws) stays offline
and committed, exactly like the rest of `public/data/`. The function is
stateless and trivial — it embeds one short string. Similarity is plain arithmetic
in a Web Worker. If the function is ever down, the UI **degrades to lexical
search** over the metadata, so the page never hard-fails.

### The one model-matching risk (must validate)

Ranking only works if the **query vector and the law vectors come from the same
embedding space**. Precompute uses `fastembed`'s ONNX `BAAI/bge-small-en-v1.5`;
runtime uses Workers AI's `@cf/baai/bge-small-en-v1.5` — same weights, but we must
confirm the pooling/normalization match. **Gate:** embed ~20 sample strings both
ways (one-time, using a CF API token pulled from Keychain — never `.env.local`,
per operator-secret policy) and assert cosine ≥ 0.98. If it fails, switch
precompute to call the Workers AI REST API so both sides are identical.

BGE convention: prepend the query instruction
`"Represent this sentence for searching relevant passages: "` to the **query
only** (not to the law passages), on both the validation and runtime paths.

---

## Data artifacts (new, committed under `public/data/search/`)

Produced by a new offline step. One vector + one metadata row per law, index-aligned.

- **`vectors.bin`** — flat `Int8Array`, row-major, `44,759 × 384` ≈ **17.2 MB**.
  - Each law vector is L2-normalized, then quantized `int8 = round(c × 127)`,
    clamped to `[-127, 127]`. Dequant at read time is `c/127`.
  - Cosine ≈ dot(query_float_normalized, law_int8/127). Validated: int8 top-30 must
    overlap the float top-30 by ≥ 0.95 (printed by the build script).
- **`meta.json`** — parallel array, `meta[i]` ↔ vector row `i`:
  `{ id, jId, name, state, title, section, topic, snippet }`
  (`snippet` = first ~200 cleaned chars of `content`). ~13 MB raw, ~3–4 MB
  brotli over the wire (Cloudflare compresses). Lets results render without
  fetching any multi-MB jurisdiction file.

**Embedding text per law:** `f"{title}. {section}. {lead}"` where `lead` is the
first ~512 tokens of cleaned `content`. Title-forward because (per the existing
question-matcher's hard-won lesson) OCR'd bodies are noisy and titles are the
clean signal.

Both files lazy-load on the **first** search only, then cache. ~20 MB first-use
weight is in line with data the site already ships (Chicago page = 15 MB).

---

## Implementation

### 1. Offline index builder — `pipeline/build_search.py` (new)

- Reuses the same per-jurisdiction law objects `build.py` already emits (read the
  committed `public/data/<state>/<slug>.json` files, or hook into `build.py`'s
  in-memory `out_laws`). No new LOCUS query needed.
- New dep: **`fastembed`** (Qdrant; light ONNX runtime, ships `bge-small-en-v1.5`).
  Documented in the data-build prerequisites, not added to `package.json`.
- Writes `vectors.bin` + `meta.json`; prints the int8-vs-float overlap stat.
- New script: `"data:search": "python3 pipeline/build_search.py"`.

### 2. Pages Function — `functions/api/search.ts` (new)

```ts
export async function onRequestPost({ request, env }) {
  const { q } = await request.json();
  if (!q || typeof q !== "string" || q.length > 512)
    return Response.json({ error: "bad query" }, { status: 400 });
  const text = "Represent this sentence for searching relevant passages: " + q.trim();
  const { data } = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [text] });
  return Response.json({ vector: data[0] }); // 384 floats, normalized
}
```

- Binding `AI` (Workers AI) added in the **CF Pages dashboard** (Settings →
  Functions → bindings) — consistent with how build env vars are already
  dashboard-configured. No `wrangler.toml` required for native Git deploys.
- Optional: cache identical queries via the Cache API (cheap win).
- On any failure → non-2xx; client falls back to lexical. Never throws to the user.

### 3. Frontend

- **`src/pages/search.astro`** (new) — the global surface. Mounts one island.
- **`src/components/GlobalSearch.tsx`** (new island):
  - On first focus/submit: lazy-`fetch` `vectors.bin` (→ `Int8Array`) and
    `meta.json`; hand the `Int8Array` to a **Web Worker** so the 44k-row cosine
    loop never janks the main thread.
  - On submit: **(a)** instant lexical pass over `meta` (title/snippet + a small
    synonym map) renders results immediately; **(b)** in parallel POST `q` to
    `/api/search`; when the query vector returns, the Worker scores all 44k rows,
    returns top ~30, and results re-rank semantically.
  - Each result: title, jurisdiction + state, topic badge, snippet, reused
    "densely worded" badge — links to the place page **deep-linked to that law**.
  - **Suggested questions:** a curated evergreen set (extends the phrasings in
    `QUESTIONS_META`), shown as chips before searching and re-ordered after a
    search by the topics of the top results (data-driven, no model).
  - Reuses the not-legal-advice / OCR / machine-estimate caveats; frames results
    as "ordinances most related to your question."
- **`src/pages/index.astro`** (modify) — prominent search box → `/search?q=…`.
- **`src/lib/topics.ts`** (modify) — add `SUGGESTED_QUESTIONS` and a small shared
  `SYNONYMS` map (reused by the lexical fallback). Keep badge/color literals intact.
- **Place page deep-link** (modify `[state]/[city].astro` / `LawBrowser.tsx` /
  law card) — give each law card `id="law-<id>"`; read `?law=<id>` (or `#law-…`)
  on load to expand + scroll to it. Reuse from search results.

No new JS runtime dependencies: the cosine loop and lexical fallback are
hand-rolled (tiny); no search library needed.

### 4. Docs (part of "done")

- `CLAUDE.md`: document the `data:search` step + `fastembed` prereq, the
  `functions/api/search.ts` surface + `AI` binding (dashboard-set), the new
  `public/data/search/` artifacts, and the guardrail rationale (query-only
  embedding).
- `ATTRIBUTION.md` unchanged in substance (vectors derive from CC BY-NC text →
  site stays non-commercial; attribution already present).

---

## Verification

1. **Index quality (offline):** run `bun run data:build`-style step
   `python3 pipeline/build_search.py`; confirm artifact sizes and the printed
   int8-vs-float top-30 overlap ≥ 0.95.
2. **Embedding-space match (offline, one-time):** sample-validate fastembed vs
   Workers AI cosine ≥ 0.98 (CF token from Keychain).
3. **Semantic search end-to-end (local):** `bun run build` then
   `bunx wrangler pages dev dist` (CF login enables the `AI` binding); on
   `/search` type "can I keep chickens in my backyard", confirm chicken/poultry
   ordinances from *multiple* towns rank top; confirm a deep-link result opens the
   place page scrolled to that law.
4. **Lexical fallback:** block `/api/search` (or run plain `bun run dev`, which has
   no function) → confirm instant lexical results still render and the page never
   errors.
5. **Weight/mobile:** confirm `vectors.bin` + `meta.json` load lazily (only on
   first search) and the Worker keeps the UI responsive.

> Note: `astro dev` / `preview_start` do **not** run Pages Functions — semantic
> ranking needs `wrangler pages dev` or a deployed preview. The lexical layer is
> fully testable without it.

---

## Phasing (suggested execution order)

1. **P1 — Offline index + validation.** `build_search.py`, artifacts, the two
   validation gates. (Proves the data layer before any UI.)
2. **P2 — Function + raw plumbing.** `functions/api/search.ts`, `AI` binding,
   query→vector round-trip.
3. **P3 — Search UI.** `GlobalSearch.tsx` (lexical-first, semantic re-rank, Web
   Worker), `/search` page, homepage box, suggested questions.
4. **P4 — Deep-links + docs.** Place-page anchor/scroll, `CLAUDE.md`.

---

---

# Feature 2: "Find my town" (nearest-pilot geolocation)

## Context

There are only **19 pilot cities** scattered across the US, so a visitor rarely
lands on their own town by browsing. "Find my town" learns roughly where they are
and points them at the **nearest pilot** — honestly, including the distance, since
the nearest pilot is often far and is *not* their town's law.

### Decisions (locked with the user)

| Fork | Choice |
|---|---|
| Location sources (layered) | **IP geo (zero-click default)** → **browser Geolocation (precise, on click)** → **manual city/ZIP entry (fallback)** |
| Far-city framing | **Always show the nearest pilot, with the real distance + a "we don't cover your town yet" caveat** |
| Geocoding | Hand-maintained 19-point coord table + shipped US **ZIP-centroid** table (no third-party geocoder, $0/offline). *Assumption pending user's "something else" note.* |

Privacy: browser coords never leave the device — nearest-of-19 is computed
client-side. IP geo is read from Cloudflare request headers in the function only
to produce a coarse first guess.

## How it works

1. **Zero-click guess:** the existing `functions/api/search.ts` (or a sibling
   `functions/api/where.ts`) reads Cloudflare's `request.cf.latitude/longitude`
   (or `cf-ipcity`) and returns a coarse `{ lat, lon }`. Coarse, can be VPN-wrong.
2. **Precise upgrade:** a "Use my exact location" button calls
   `navigator.geolocation.getCurrentPosition` (permission prompt). Coords stay in
   the browser.
3. **Manual fallback:** a city/ZIP input. ZIP → lat/lon via the shipped
   `public/data/geo/zip-centroids.json` (compact `{ "94110": [37.75, -122.41] }`,
   US only; ~3 MB, lazy-loaded only when someone types a ZIP). City names match
   against the 19 pilots directly.
4. **Nearest-of-19:** `haversine(userLatLon, JURISDICTION_COORDS[i])` over the 19
   fixed points; pick the min. Show: pilot name + state, **distance in miles**, and
   if `distance > ~50 mi` a clear "We don't cover your town yet — this is the
   closest pilot we have" line. Link to that place page.

## Implementation

- **`src/lib/geo.ts`** (new) — `JURISDICTION_COORDS: Record<jurisId,[lat,lon]>`
  (19 hand-entered values), `haversineMiles()`, `nearestPilot(lat, lon)`. Pure,
  testable, no deps.
- **`public/data/geo/zip-centroids.json`** (new, committed) — built once by a small
  script (`pipeline/build_geo.py`) from a public US ZIP-centroid dataset; lazy-loaded
  only on manual ZIP entry.
- **`functions/api/where.ts`** (new, optional) — returns CF IP-geo `{lat,lon,city}`.
  Degrades silently; the feature works with just geolocation + manual entry if the
  function is absent.
- **`src/components/FindMyTown.tsx`** (new island) — the three-source flow + result
  card with honest distance/caveat. Reuses topic/colour and caveat styles.
- **`src/pages/index.astro`** (modify) — "Find my town" in the hero, beside the
  global search box.
- **Coords data** lives in `geo.ts` (hand-maintained), not the pipeline (LOCUS has
  no coordinates).

## Verification

1. `nearestPilot()` unit sanity: feed known coords (SF → `ca/san_francisco`,
   Miami → nearest pilot + a >400 mi distance shown).
2. Browser geolocation path: grant permission in a real browser; confirm the
   nearest pilot + distance render. (Geolocation needs https or localhost.)
3. Manual ZIP: type a ZIP far from all pilots → confirm the caveat appears.
4. IP-geo path: `wrangler pages dev` (CF provides geo headers on deployed/preview;
   may be absent in pure local — degrade to the button + manual entry).

---

## Open risks / notes

- **Model-space mismatch** — mitigated by the §"validate" gate; fallback is
  REST-precompute.
- **First-load weight (~20 MB)** — lazy + cached; consistent with existing pages.
  If mobile proves heavy, dimensionality reduction (PCA → 256-d) or Vectorize
  (Topology 2, ~$5/mo, featherlight client) are the upgrade paths.
- **OCR noise** — handled by title-forward embedding text + reused caveats.
- **Workers AI free allocation** — one tiny embed per search; daily free neurons
  comfortably cover a non-commercial site. Query-cache reduces repeats further.
```

