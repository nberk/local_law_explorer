# Full rollout: all LOCUS cities + counties on the free tier

Scale the site from **19 hand-picked pilots** to **every city and county in
LOCUS-v1** (~1,644 cities + ~345 counties, ~2.2M laws). Stay on Cloudflare's
**free tier**. No vector search, no database. The only new infrastructure is
**Cloudflare R2** for the large per-jurisdiction JSON.

Status of the locked decisions (2026-06-24):

1. **Execution split** — I write all code and validate end-to-end on a `--limit 50`
   slice (parquet downloaded locally by me). The multi-hour full build + R2 upload
   is a coordinated step we run together afterward.
2. **R2 provisioning** — via `wrangler` (OAuth login, no stored token). The S3-API
   token for the bulk sync is an operator secret kept in the macOS Keychain.
3. **ZIP→county** — exact mapping included: each ZIP carries its containing county
   (when we cover it) so ZIP lookups return the exact county, not a nearest
   centroid. Device/IP geo still uses nearest-centroid.

---

## Why R2 (the one real constraint)

Per-jurisdiction law JSON is ~95% OCR'd ordinance text. At full scale it is
~4.6 GB (vs ~94 MB today) — too big to commit to git or ship as static Pages
assets.

- **Big per-jurisdiction files → R2** (free tier: 10 GB storage, egress free).
  Fetched on demand by the client, so total size is irrelevant; only per-file size
  matters (all < 25 MB). One Class-B read per place-page view; 10M/mo free.
- **`index.json` manifest → stays a small static file in the repo**, but is
  **fetched client-side**, not inlined into every page's HTML.
- **Other small static files stay committed and static**: `baselines.json`,
  `legalese.json`, `spectrum.json`, `geo/zip-centroids.json`, `search/*`. They are
  small and already work; only the per-jurisdiction `<state>/<slug>.json` relocate.
- The front-end keeps deploying from git via the existing Pages Git integration;
  only the **per-jurisdiction fetch base URL** changes (`PUBLIC_DATA_BASE_URL`).

---

## Architecture deltas (what actually moves)

The pipeline ↔ site contract is unchanged in *shape* (same JSON). What changes:

| Concern | Today | After |
| --- | --- | --- |
| Jurisdictions built | 19 hardcoded `PILOT` | every `cities`+`counties` row |
| Per-jurisdiction JSON | committed `public/data/<st>/<slug>.json` | gitignored `data-build/`, uploaded to R2 |
| Per-jurisdiction fetch | `/data/<id>.json` | `${PUBLIC_DATA_BASE_URL}/<id>.json` (R2) |
| `index.json` | committed + **SSR-inlined** into pages | committed + **client-fetched** |
| Geo coords | 19 hardcoded in `geo.ts` | `lat`/`lon` on every `JurisdictionSummary`, auto-geocoded |
| "Find my town" | nearest of 19 | nearest **city** AND nearest **county** |
| Picker | renders all 19 | search-first, capped at ~60 results |

**Inlining blast radius** (verified): only `index.astro` and `rankings.astro`
inline the full `jurisdictions` array as island props. `about.astro` and
`search.astro` only read `jurisdictions.length` (a build-time scalar — fine).
`[state]/[city].astro`'s `getStaticPaths` reads the array at build time and passes
**one summary per page** — fine, never the array.

**Build-cost trap to preserve:** place pages must use only **summary** fields from
`index.json`. Never call `loadJurisdiction()` in `getStaticPaths` or a page body —
that would read 4.6 GB during `astro build`. The heavy `laws[]` is always
client-fetched from R2.

---

## 1. Pipeline: build all cities + counties (`pipeline/build.py`)

- **Enumerate** all jurisdictions: `SELECT DISTINCT source_jurisdiction_type, state,
  coalesce(city, county) AS place FROM source WHERE source_jurisdiction_type IN
  ('cities','counties') AND is_substantive`. Replaces the hardcoded `PILOT`.
- **Per-jurisdiction query** filters by type + state + the right column
  (`city` for cities, `county` for counties) using equality predicates (pushdown).
- **Type** preserved into `index.json` as `"city"`/`"county"` (already in
  `JurisdictionSummary.type`; the picker groups on it).
- **ID collisions:** a city and county in the same state can share a slug. Compute
  all slugs, detect collisions, and for any colliding county append `-county`
  (e.g. `tx/houston` city vs `tx/harris-county`). Log every collision resolved.
- **Output dir:** per-jurisdiction JSON → gitignored `data-build/<state>/<slug>.json`
  (new `--out` default stays `public/data` only for the small shared files; the big
  files go to a separate `--juris-out` dir, default `data-build`). `index.json`,
  `baselines.json`, `legalese.json`, `spectrum.json` stay in `public/data`.
- **`--limit N`** — process only the first N jurisdictions (dress rehearsal).
- **`--only state/slug`** — process a single jurisdiction (incremental testing).
- **Size guard:** assert no single per-jurisdiction file exceeds ~24 MB. If one
  would, truncate the longest `content` fields and flag it. Print per-jurisdiction
  progress and a final total-size + largest-file report.
- Portrait / questions / notable / lenses / scores synthesis: **unchanged**.

Baselines, legalese, and spectrum passes are unchanged except that they now draw
from the full set. (Legalese/spectrum already cap per jurisdiction, so they scale.)

## 2. Geocode jurisdictions (`pipeline/geocode_jurisdictions.py`, new)

Reads `public/data/index.json`, resolves `[lat, lon]` per jurisdiction, writes
`lat`/`lon` back onto each summary. Adds `lat: number | null; lon: number | null`
to `JurisdictionSummary` in `topics.ts`. Leaves `null` on no confident match.
Logs match rate + unmatched list per type.

- **Cities:** GeoNames US dump (`download.geonames.org/export/dump/US.zip`,
  feature class `P`), matched on normalized **city name + state** (GeoNames US
  `admin1` = USPS state code). On ties, highest **population**. Normalize slugs:
  `san_francisco` → `san francisco`; strip `_borough`/`_village`/`_city`/`_town`.
- **Counties:** US Census Gazetteer counties file (`INTPTLAT`/`INTPTLONG` internal
  point per county), matched on **county name + state** (`USPS` column; `NAME`
  like "Harris County" / "… Parish" / "… Borough" / "… Census Area"). Normalize by
  stripping the county/parish/borough/census-area suffix on both sides.
- **ZIP→county (exact):** re-read the GeoNames ZIP dump (already used by
  `build_geo.py`); it carries `admin2` (county name) per ZIP. Match ZIP's
  county+state to our covered county jurisdictions by normalized name, and rewrite
  `geo/zip-centroids.json` entries from `[lat, lon]` to `[lat, lon, countyId|null]`.
  Fail soft (null when uncovered/unmatched).

Run order: `build.py` → `build_geo.py` (ZIP centroids) → `geocode_jurisdictions.py`
(coords into `index.json` + ZIP→county augmentation). Wire as `bun run data:geocode`.

## 3. Upload to R2

- `wrangler r2 bucket create locallaw-data`; enable public access (`r2.dev`); set
  a CORS rule allowing `GET` from the Pages origin + `http://localhost:4321`.
- Bulk upload `data-build/` under a `data/` prefix via `aws s3 sync` against R2's
  S3 endpoint (`aws s3 sync data-build/ s3://locallaw-data/data/ --endpoint-url
  https://<account>.r2.cloudflarestorage.com`). R2 token from Keychain
  (`security find-generic-password -s r2-locallaw -w`), never the repo/`.env`.
- Record bucket name + public base URL in `CLAUDE.md`.

## 4. Front-end: fetch per-jurisdiction data from R2

- New `src/lib/clientData.ts`: `DATA_BASE_URL = import.meta.env.PUBLIC_DATA_BASE_URL
  ?? "/data"` and a memoized `loadIndexClient()` that fetches `/data/index.json`
  once (the manifest stays on the static origin, not R2).
- `JurisdictionModules.tsx` + `LawBrowser.tsx`: fetch
  `` `${DATA_BASE_URL}/${jurisId}.json` ``.
- `index.astro` + `rankings.astro`: stop passing `jurisdictions` as props; the
  islands (`FindMyTown`, `JurisdictionPicker`, `RankingsTable`) call
  `loadIndexClient()` on mount with a loading state. SSR keeps using build-time
  scalars (`corpus`, `.length`) only.

## 5. Geolocation: nearest CITY and nearest COUNTY (`geo.ts` + `FindMyTown.tsx`)

- Delete hardcoded `JURISDICTION_COORDS`. Add `nearestByType(lat, lon, jurs)` →
  `{ city: NearestResult | null, county: NearestResult | null }`, computed
  independently via `haversineMiles`, skipping null-coord entries. Keep
  `COVERAGE_RADIUS_MILES` + honest-distance caveat (rarely fires now).
- `FindMyTown.tsx`: render up to two cards — "Your city" / "Your county" — each
  with its own distance + caveat; one card if only one resolves; graceful both-null.
  ZIP path uses the carried `countyId` for an **exact** county when present, else
  falls back to nearest county centroid. Device/IP geo use nearest-centroid.
  County card copy: "nearest county we cover" (centroid is an approximation;
  point-in-polygon is out of scope).

## 6. Picker at scale (`JurisdictionPicker.tsx`)

Search-first: show a short shortlist (e.g. largest by law count) until the user
types, then filter by name/state and **cap rendered results at ~60**. Reuse the
existing filter logic; keep the large/small grouping within the cap.

---

## Free-tier guardrails (verify, don't assume)

- R2 storage ~4.6 GB < 10 GB free. ✅
- R2 Class-B reads ~1/place-view; 10M/mo free. ✅  · R2 egress free. ✅
- Pages/Functions: static + the optional geo function only. ✅
- Confirm current R2 free storage before the first big upload.

## Verification

1. **Slice:** `python3 pipeline/build.py --source './locus-data/**/*.parquet'
   --limit 50` → `index.json` has cities+counties, files look right, none > 24 MB.
2. **Geocode quality:** logged match rate > ~90%; eyeball coords for each type.
3. **R2 wiring:** point `PUBLIC_DATA_BASE_URL` at the bucket; load a place page in
   `bun run dev`; confirm laws load from R2 (Network tab), no CORS error.
4. **Geo:** a covered ZIP returns BOTH a nearby city and county at small distance;
   a remote ZIP shows the caveat on each.
5. **Picker:** typing filters; never renders thousands of cards.
6. **Full build:** once slices pass — full pipeline → R2 upload → Pages preview →
   smoke-test several random cities and counties.

## Gotchas

- Don't inline `index.json` into HTML (~1–2 MB at full scale).
- Keep the build light: summary fields only in `getStaticPaths`/pages.
- CORS on R2 is required for browser `fetch`; a missing rule looks like a silent
  fetch failure.
- Geocoding misses are normal (slug/name mismatch, renamed places) — fail soft,
  log, move on.
- County ≠ nearest-centroid — copy must not overstate it.
- OCR variability is higher across ~2,000 jurisdictions; keep the
  not-legal-advice / OCR caveats prominent.

## Local-dev note

After this change the per-jurisdiction files are no longer committed, so local dev
needs per-jurisdiction data from somewhere: set `PUBLIC_DATA_BASE_URL` to the R2
URL in `.env`, **or** copy a `data-build/` slice into `public/data/`. The 19 pilot
files currently committed remain as an offline fallback for those places.
