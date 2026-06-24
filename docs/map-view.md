# Map view — design exploration

Status: **v1 built and shipped 2026-06-24.** `/map` page +
`src/components/JurisdictionMap.tsx` island + a "Map" nav link. One deviation
from the plan below: v1 uses Leaflet's **canvas renderer** (`preferCanvas: true`)
drawing `circleMarker`s directly, NOT `leaflet.markercluster` — that plugin
supports only `L.Marker`, not `circleMarker` (which we need for variable size +
topic color). Clustering for dense metros is deferred to v2. The map initial view
uses `fitBounds` on the lower-48 rather than a fixed center/zoom. Tile provider:
CARTO "light_all". Sections below are the original exploration. Date: 2026-06-24.

A national map that plots every covered jurisdiction as a dot at its lat/lon,
shows "which laws are there" at a glance, and clicks through to the jurisdiction
page. A sibling surface to `/rankings`: both place covered towns on a national
backdrop, one as a ranked list, one as a map.

## Why this fits the existing app

The data and patterns are already in place. Nothing new needs to be fetched or
built on the data side:

- `index.json` (1.2 MB, committed, served from the Pages origin) already holds
  all 2,287 entries with everything a dot needs: `id`, `name`, `state`,
  `stateName`, `type`, `counts` (per-topic + total), `medianOpacity`, `size`,
  `portraitTeaser`, `dimensions` (opacity / paternalism / enforcement_discretion
  percentiles), and `lat` / `lon`. **Every entry is geocoded — 0 null coords.**
- `loadIndexClient()` in `src/lib/clientData.ts` is already the memoized,
  client-side fetch of that manifest, reused by `FindMyTown`,
  `JurisdictionPicker`, and `RankingsTable`. The map reuses it verbatim.
- The page pattern is fixed: a thin `.astro` shell (`rankings.astro`,
  `legalese.astro`) that mounts one `client:load` React island. The map follows
  the same shape.

**The map needs only `index.json`.** It must NOT touch the per-jurisdiction R2
files (those are multi-MB each and only `JurisdictionModules` / `LawBrowser`
fetch them, on a place page). Confirmed against the types: every field a dot or
its tooltip shows lives on `JurisdictionSummary`, not on the full `Jurisdiction`.
Clicking a dot navigates to `/[state]/[city]`; the heavy fetch happens there, as
it does today.

## 1. What a dot encodes — the resolved decision

"Which laws are there" is ambiguous. It could mean *how many* laws, *what kind*
(topic mix), or *what character* (opacity / paternalism). Resolving it:

**Primary encoding (v1):**

- **Color = dominant topic** (the topic with the largest `counts` value among
  Zoning / Nuisance / Buildings / Business, with `Other` as the fallback). This
  answers "what is local law mostly about here" — the most legible at-a-glance
  read. Reuse `TOPIC_COLOR` from `topics.ts` verbatim (those are the literal hex
  strings already used in `TopicBar` and the fingerprint, so the map matches the
  rest of the site).
- **Size = total law count** (`counts.total`), on a compressed scale (sqrt or
  log — a 50-law town and an 8,000-law town must both be visible without the big
  ones swallowing the map). This is "how much law," the second natural reading.

So a dot says, at a glance: a blue medium dot is a town whose law is mostly
zoning, of middling volume.

**Honesty caveat baked into the encoding.** Topics are noisy model predictions
and `Other` is the classifier's junk drawer (often the plurality). Two
consequences:

- The legend must label topics "estimated topic mix" and never imply the dot's
  color is the town's official focus.
- "Dominant topic" should **exclude `Other`** when picking the color, because
  `Other` wins on raw count for many towns and would paint the map a meaningless
  grey. Color by the largest *substantive* topic; surface the `Other` share only
  in the tooltip. (If even the substantive topics are tiny, the dot can fall back
  to a neutral grey, which honestly reads as "no clear focus.")

**Toggleable encodings (v2), not v1:**

- A topic **filter**: pick "Zoning" and every dot resizes to that town's zoning
  share / count, dimming towns with little of it. This is the strongest
  "where is there a lot of X law" view but it is a second interaction layer.
- A **dimension** color ramp: color by `dimensions.opacity.displayPercentile`
  (plainness) or `paternalism.percentile`, reusing the exact percentile framing
  and `DIMENSION_META` labels from `RankingsTable`. Sequential ramp, percentile
  not raw z-score, labeled "machine estimate, percentile not verdict." Only the
  three verified dimensions — `problem_salience` stays out (the `verifyCopy`
  guardrail), same as rankings.

Keeping v1 to a single fixed encoding (topic color + count size) honors the
repo's "default to simple" ethos. The toggles are a clean v2 once the base map
proves out.

## 2. Map tech — recommendation: Leaflet + OSM raster tiles

Pick **Leaflet** with **OpenStreetMap raster tiles** and
**Leaflet.markercluster** for low-zoom clustering.

Rationale against the constraints:

| Constraint | Leaflet + OSM raster | MapLibre GL (vector) | deck.gl / canvas |
|---|---|---|---|
| Bundle in a React island | ~42 KB gzipped core + small cluster plugin | ~200 KB+ gzipped | large; pulls luma.gl |
| 2,287 points | trivial; cluster plugin handles it | trivial | overkill |
| Tiles, no paid key | OSM tile server, free, attribution-only | needs a vector tile/style source (MapTiler etc. — usually a key) | n/a (you supply a basemap anyway) |
| License fit (non-commercial) | OSM is ODbL, attribution-only, fine | style providers often have commercial terms / keys | n/a |
| Offline / dev story | tiles 404 gracefully; dots still render | harder | n/a |
| WebGL requirement | none (canvas/DOM) | requires WebGL | requires WebGL |

**Why not the GL options:** 2,287 points is small. The case for MapLibre/deck.gl
is tens of thousands of points or smooth vector zoom, which we do not need. They
also cost more bundle and usually a tile/style provider key, which clashes with
"no paid keys" and the non-commercial posture. Leaflet wins on every axis that
matters here.

**Tile provider / attribution.** Default to OSM's standard tiles for dev and
low traffic, but note the OSM Foundation's tile-usage policy discourages heavy
production use of their tile servers. Two honest production options, decided at
ship time (this is the one real decision to flag):

- **CARTO** "Positron" / "Voyager" basemaps — free tier, no key for low volume,
  clean light style that suits the site's muted ink/accent palette. Attribution:
  "© OpenStreetMap contributors © CARTO."
- **Stadia Maps** free tier (key required, low effort) if CARTO's terms or volume
  ceiling become a problem.

Either keeps the **attribution control visible** (load-bearing: the site is
CC BY-NC and already keeps LOCUS attribution in the footer; map tile attribution
sits in the standard Leaflet bottom-right control). No paid key in v1.

**Dependencies added:** `leaflet`, `leaflet.markercluster`, and
`@types/leaflet`. Leaflet is not React-aware; either drive it imperatively from a
`useEffect` (simplest, no extra dep) or add `react-leaflet`. Recommend
**imperative Leaflet in a `useEffect`** for v1 — `react-leaflet` is another
dependency and version-coupling headache for a single map; the imperative path is
~40 lines and matches how `FindMyTown` already drives non-React APIs
(geolocation) from effects.

## 3. Cities vs counties

Both are dots at a point (counties use their Census internal point). Both layers
of local law apply to one spot — a core product idea from `FindMyTown`, which
already shows "your city" and "your county" side by side. The map should echo
that, not hide one layer.

**Recommendation: shape, not a second color channel.**

- **Cities = filled circles. Counties = hollow rings** (same topic color on the
  stroke, transparent fill). Shape carries the city/county distinction so color
  stays free for topic. A ring reads naturally as "an area, not a point," which
  matches what a county is.
- **A layer toggle** ("Cities · Counties · Both", default Both) so a user can
  isolate one layer when the overlap is busy. Counties are far fewer (376 vs
  1,911) so the ring layer is sparse and rarely clutters.

Avoid encoding city/county in color — color is already topic, and a third visual
variable (color + size + shape) is the ceiling before a map gets noisy. Shape +
an optional layer toggle is enough.

## 4. Interaction & data flow

- **Mount point: a new `/map` page.** `src/pages/map.astro` — a thin Layout
  shell (mirroring `rankings.astro`) that renders `<JurisdictionMap client:load />`
  with the standard honesty intro block. Not the homepage: the homepage already
  leads with `FindMyTown` (the primary "laws where I live" action) and is
  deliberately decluttered. The map is a richer exploration surface and earns its
  own page, linked from the nav alongside `/rankings`. A small "explore the map"
  link can sit near `FindMyTown` later.
- **Data:** the island calls `loadIndexClient()` on mount (exactly as
  `RankingsTable` does), filters to entries with coords (all of them today, but
  keep the `lat != null && lon != null` guard for safety, matching `geo.ts`), and
  builds the Leaflet layer. No other fetch.
- **Hover / focus → tooltip** showing `name`, `state`, the `portraitTeaser.headline`,
  `counts.total`, and a tiny topic readout. All from `JurisdictionSummary`.
- **Click → navigate** to `/${j.id}` (which is `/[state]/[city]`), same as the
  rankings rows and `FindMyTown` cards. The per-jurisdiction R2 fetch happens on
  that page, never on the map.
- **No SSR inlining.** Like every other island, the 2,287-entry array is
  client-fetched, never baked into the page HTML.

Data-flow summary: `index.json` (Pages origin, memoized) → `loadIndexClient()` →
map markers → click → place page → (only then) R2 file. The map adds zero new
data artifacts and zero R2 reads.

## 5. Performance & accessibility

**Performance.** 2,287 markers is small, but 2,287 live DOM nodes at full zoom-out
is wasteful and laggy on pan. Use **markercluster** so low zoom shows a few dozen
cluster bubbles (with counts) and individual dots only appear as you zoom in.
This keeps the DOM light and reads better (a cluster bubble over a metro is more
honest than an unreadable pile of overlapping dots). If clustering ever feels
limiting, Leaflet's canvas renderer (`L.canvas()`) draws all dots on one canvas
element — a drop-in upgrade, no library change. v1: markercluster.

**Accessibility.** A map of dots is invisible to screen-reader and keyboard-only
users. The honest fix is **graceful degradation, not ARIA theater:**

- The page must carry a **text-equivalent path** so the map is never the only way
  to the data. We already have two: `/rankings` (the same towns as a navigable
  list) and `FindMyTown` (find your place by ZIP/name). Link both prominently
  from the map page intro ("Prefer a list? See the rankings or find your town").
- Provide a **visually-hidden, in-page list** of jurisdictions as real `<a>`
  links under the map (or reuse the picker), so keyboard/SR users reach every
  jurisdiction page without touching the canvas. This is the actual accessible
  surface; the map is a sighted-user enhancement on top.
- Give the map container a clear `aria-label` and `role="application"`, and make
  the layer/encoding toggles real buttons (as `RankingsTable` does).

Do not pretend pixel dots are individually keyboard-navigable in v1. The list
fallback is the supported a11y path; that is the honest design.

## 6. Honesty / disclaimers

Consistent with `/rankings` and every other view:

- An intro block (same style as `rankings.astro`'s ink-50 box) stating: the map
  shows ~2,287 cities and counties from the LOCUS corpus; **topic colors and
  scores are machine estimates, shown as topic mix / percentiles, not verdicts**;
  text is OCR'd; **not legal advice.**
- Dot color labeled "estimated dominant topic," never "this town's focus."
- Any dimension ramp (v2) labeled exactly as rankings labels it (percentile
  framing, `DIMENSION_META.note`, `problem_salience` excluded).
- `portraitTeaser.lowConfidence` towns: dim or annotate in the tooltip
  ("few laws — rough estimate"), matching how teasers are treated elsewhere.
- Tile attribution control stays visible (OSM/CARTO), plus the existing
  footer/`/about`/`ATTRIBUTION.md` LOCUS attribution is untouched.

## 7. Scope ladder

### v1 — smallest shippable

Dots + click-through + one fixed encoding.

- **New:** `src/pages/map.astro` (Layout shell + intro + honesty box + nav link,
  mirrors `rankings.astro`).
- **New:** `src/components/JurisdictionMap.tsx` — a `client:load` island.
  Imports: `loadIndexClient` (clientData), `TOPIC_COLOR` + `JurisdictionSummary`
  (topics), `leaflet` + `leaflet.markercluster`. Imperative Leaflet in a
  `useEffect`. Cities = filled circles, counties = rings, color = dominant
  substantive topic, size = sqrt(total). Cluster at low zoom. Tooltip from
  `portraitTeaser` + counts. Click → `/${id}`.
- **New (a11y fallback):** a visually-hidden or below-fold list of links under
  the map, or reuse the existing picker component; plus prominent links to
  `/rankings` and the homepage finder.
- **Deps:** add `leaflet`, `leaflet.markercluster`, `@types/leaflet` via `bun add`.
- **Nav:** add a "Map" link wherever `/rankings` is linked.
- Run `bun run build` before committing (the project's correctness gate).

### v2 — encodings & filters

- **Encoding toggle** (buttons, like rankings' dimension toggle): topic color
  (default) ↔ plainness ramp ↔ paternalism ramp ↔ enforcement-discretion ramp,
  all percentile-framed from `dimensions`.
- **Topic filter:** pick a topic, dots resize/dim by that topic's share — the
  "where is there a lot of X law" view.
- **Layer toggle:** Cities · Counties · Both.
- **Legend** component (color swatches + size scale + shape key).

### v3+ — richer map

- **Search-to-fly:** a name/ZIP box that pans/zooms to a jurisdiction, reusing
  `FindMyTown`'s ZIP table (`zip-centroids.json`) and name matching.
- **County polygons** instead of rings (real boundary GeoJSON), so counties read
  as areas. Heavier data (a US counties topojson, ~hundreds of KB gzipped); a
  deliberate add, kept off v1.
- **"My location" pin** integrating the existing IP/device geo from `FindMyTown`,
  dropping a marker and highlighting the nearest city + county dots.
- Consider Leaflet canvas renderer if marker count or interaction grows.

## File-level touch points (summary)

| Action | File | Imports / reuses |
|---|---|---|
| New page | `src/pages/map.astro` | `Layout`, the new island |
| New island | `src/components/JurisdictionMap.tsx` | `loadIndexClient`, `TOPIC_COLOR`, `JurisdictionSummary`, `leaflet`, `leaflet.markercluster` |
| a11y fallback | inline list in `map.astro` or reuse `JurisdictionPicker` | `loadIndexClient` |
| Nav link | wherever `/rankings` appears | — |
| Deps | `package.json` | `leaflet`, `leaflet.markercluster`, `@types/leaflet` |

No pipeline change, no new data file, no R2 read, no SSR change. The map is a
pure presentation layer over the manifest the site already ships.
