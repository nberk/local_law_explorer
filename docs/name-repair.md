# Repairing OCR-glued jurisdiction names (2026-06-25)

## The bug

The New York City page rendered its title as **"Newyorkcity"** (breadcrumb, H1,
disclaimer, topic heading). Other places were wrong the same way: "Grandisland",
"Coeurdalene", "Sioux Falls" shown as "Siouxfalls", "Mcminnville", etc.

## Why

`display_name()` in `pipeline/build.py` builds the display name by splitting the
slug on `_`/`-` and capitalizing each piece:

```python
def display_name(slug: str) -> str:
    name = slug.replace("_", " ").replace("-", " ")
    return " ".join(w.capitalize() for w in name.split())
```

LOCUS slugs are OCR'd and many have the words **glued together with no separator**
(`newyorkcity`, `grandisland`, `coeurdalene`). With nothing to split on, the whole
thing becomes a single capitalized token.

There is **no string rule** that fixes this: you cannot split `grandisland` →
"Grand Island" while leaving `chattanooga` / `minneapolis` / `springfield` intact.
The only difference between the two groups is whether the letters spell multiple
*real place names* — which requires a gazetteer, not an algorithm.

## The fix — adopt the gazetteer's name, but only for the same place

The geocoder (`pipeline/geocode_jurisdictions.py`) already matches every slug
against **GeoNames** (authoritative US place names) to get coordinates. It found
the "New York City" record all along — it just kept the lat/lon and threw the name
away. Now it writes that canonical name back onto `index.json`'s `name`, gated by a
safety check:

```python
def squash(name):  # accent-fold, lowercase, strip non-alphanumerics
    return re.sub(r"[^a-z0-9]+", "", _fold(name).lower())

# adopt the gazetteer name only when it is provably the same string of letters:
if canon_name and squash(canon_name) == squash(current_name):
    j["name"] = canon_name
```

- `squash("Newyorkcity") == squash("New York City")` → adopt → **"New York City"**.
- `squash("Jamestown") != squash("James")` → a deglue mismatch is **rejected**, so
  a real single-word name can never be renamed to a different word.
- `_OVERRIDES` entries carry a hand-verified name and are trusted outright
  ("Hempstead Bzo Town" → "Hempstead", "Newcordell" → "Cordell").

This is **proactive**: it fixes every city in one pass, not just NYC.

### Result

`bun run data:geocode` repaired **118 names**, e.g. New York City, Grand Island,
Coeur d'Alene, Sioux Falls, McMinnville, O'Fallon, Cañon City, Winston-Salem,
Charles Town, Brigham City, Iowa City. **0 coordinate changes, 0 coverage loss
(still 2287/2287), no false renames.** `zip-centroids.json` unchanged.

## Where the name is read

`index.json` is now authoritative for names. The place page
(`src/pages/[state]/[city].astro`) already used `j.name` (from `index.json`) for
the title/breadcrumb/H1, so those were fixed by regenerating the manifest.

The client island `JurisdictionModules` previously read `data.name` from the
fetched **per-jurisdiction file** (on R2, not regenerated). It now takes the name
as a **prop** threaded from the page (`name={j.name}`) and passes it to
`PlacePortrait` / `CommonQuestions` / `NotableRules`. So the manifest fix shows
everywhere **without** rebuilding + re-uploading ~2,000 R2 files. The per-juris
`data.name` is now dead (still emitted by `build.py`; harmless).

## Re-running

```bash
bun run data:geocode   # needs: pip install certifi; downloads GeoNames/Census once
```

Only `index.json` (and `zip-centroids.json`, unchanged here) are touched. A future
full `data:build` will still emit stale per-juris `data.name`s — that's fine, they
are unused — and `data:geocode` re-repairs the manifest afterward.
