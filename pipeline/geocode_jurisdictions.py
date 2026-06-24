#!/usr/bin/env python3
"""
Geocode every jurisdiction in index.json (full rollout — see docs/full-rollout.md).

LOCUS has no coordinates, so we resolve an approximate center for each place from
two public, free sources and write `lat`/`lon` onto each JurisdictionSummary:

  * Cities  -> GeoNames US populated places (feature class P), matched on
               normalized city name + state, highest-population row on ties.
  * Counties-> US Census Gazetteer counties file (internal point per county),
               matched on normalized county name + state.

It also augments geo/zip-centroids.json with the EXACT containing county per ZIP
(from the GeoNames ZIP dump's admin2 field), so a ZIP lookup returns the real
county rather than the nearest centroid. Entries become [lat, lon, countyId?].

Match misses are normal (slug/name drift, renamed places); we fail soft (null →
skipped by "find my town") and log the match rate + a sample of misses.

Sources are downloaded once and cached under --cache-dir. Run AFTER build.py and
build_geo.py:

    python3 pipeline/build.py --source 'locus-data/data/*.parquet'
    python3 pipeline/build_geo.py
    python3 pipeline/geocode_jurisdictions.py
"""

import argparse
import io
import json
import re
import ssl
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEONAMES_CITIES = "https://download.geonames.org/export/dump/US.zip"
GEONAMES_ZIP = "https://download.geonames.org/export/zip/US.zip"
CENSUS_COUNTIES = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "2023_Gazetteer/2023_Gaz_counties_national.zip"
)

# Tokens dropped when normalizing a place name to a match key. Governance suffixes
# and connective words only — never a place's distinctive part.
_DROP = {
    "of", "the", "and",
    # county-ish
    "county", "parish", "borough", "census", "area", "municipality",
    "police", "jury", "council", "consolidated", "government", "metropolitan",
    "metro", "unified", "parishwide", "townships",
    # city-ish governance suffixes (only used in the relaxed pass)
    "village", "township", "town", "city", "cdp", "plantation", "gore",
}
# "borough" is a city suffix in PA/NJ (and a county term in AK — handled separately).
_CITY_SUFFIX = {"village", "township", "town", "city", "cdp", "plantation", "gore",
                "borough"}
_COUNTY_SUFFIX = {"county", "parish", "borough", "census", "area", "municipality",
                  "police", "jury", "council", "consolidated", "government",
                  "metropolitan", "metro", "unified", "parishwide"}


# Common abbreviation aliases so "St. Louis" matches "Saint Louis", etc.
_ALIAS = {"st": "saint", "ste": "sainte", "mt": "mount", "ft": "fort"}
# Governance terms that mark the end of a county's distinctive name.
_GOV_TERMS = ("county", "parish", "borough", "municipality")


def _tokens(name: str):
    return [_ALIAS.get(t, t)
            for t in re.sub(r"[^a-z0-9]+", " ", name.lower()).split() if t]


def deglue_county(name: str) -> str:
    """County key for OCR-glued values with no separator before the governance
    term: 'pimacounty' -> 'pima', 'owencounty' -> 'owen', 'lakecounty' -> 'lake'."""
    compact = re.sub(r"[^a-z0-9]+", "", name.lower())
    for term in _GOV_TERMS:
        if compact.endswith(term) and len(compact) > len(term):
            return compact[: -len(term)]
    return ""


def county_core(name: str) -> str:
    """The distinctive token immediately before a governance term (county/parish/
    …). Resolves consolidated governments: 'Indianapolis Marion County' -> 'marion',
    'metro government of nashville and davidson county' -> 'davidson'."""
    toks = _tokens(name)
    for i, t in enumerate(toks):
        if t in _GOV_TERMS and i > 0:
            return toks[i - 1]
    return ""


def norm_full(name: str) -> str:
    """Keep every token except pure connectives — the strict key."""
    return " ".join(t for t in _tokens(name) if t not in {"of", "the", "and"})


def norm_city(name: str) -> str:
    """Relaxed city key: also drop governance suffixes (village/township/…)."""
    return " ".join(t for t in _tokens(name)
                    if t not in {"of", "the", "and"} and t not in _CITY_SUFFIX)


def norm_county(name: str) -> str:
    """Relaxed county key: drop county/parish/borough/… and their trappings."""
    return " ".join(t for t in _tokens(name)
                    if t not in {"of", "the", "and"} and t not in _COUNTY_SUFFIX)


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi
    except ImportError as e:
        raise SystemExit("Missing dependency: pip install certifi") from e
    return ssl.create_default_context(cafile=certifi.where())


def _download(url: str, cache: Path) -> bytes:
    cache.mkdir(parents=True, exist_ok=True)
    fname = cache / (re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("//", 1)[1]))
    if fname.exists():
        return fname.read_bytes()
    print(f"  downloading {url} …")
    with urllib.request.urlopen(url, timeout=120, context=_ssl_context()) as resp:
        raw = resp.read()
    fname.write_bytes(raw)
    return raw


def load_geonames_cities(cache: Path):
    """(state_upper, key) -> (lat, lon). Two keys per row (strict + suffix-relaxed);
    on collisions the higher-population row wins."""
    raw = _download(GEONAMES_CITIES, cache)
    best = {}  # key -> (population, lat, lon)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        with zf.open("US.txt") as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8"):
                f = line.rstrip("\n").split("\t")
                if len(f) < 15 or f[6] != "P":  # feature class P = populated place
                    continue
                name, ascii_name, lat, lon, state = f[1], f[2], f[4], f[5], f[10]
                try:
                    lat, lon = float(lat), float(lon)
                    pop = int(f[14] or 0)
                except ValueError:
                    continue
                if not state:
                    continue
                # asciiname handles accents ("Cañon City" -> "canon city"); the
                # spaceless variant catches OCR-glued slugs ("siouxfalls").
                keys = set()
                for nm in (name, ascii_name):
                    nf = norm_full(nm)
                    keys |= {nf, norm_city(nm), nf.replace(" ", "")}
                for key in keys:
                    if not key:
                        continue
                    k = (state.upper(), key)
                    if k not in best or pop > best[k][0]:
                        best[k] = (pop, lat, lon)
    return {k: (v[1], v[2]) for k, v in best.items()}


def load_census_counties(cache: Path):
    """(state_upper, county_key) -> (lat, lon) from the Census Gazetteer."""
    raw = _download(CENSUS_COUNTIES, cache)
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        inner = next(n for n in zf.namelist() if n.endswith(".txt"))
        with zf.open(inner) as fh:
            text = io.TextIOWrapper(fh, encoding="latin-1")
            header = next(text).rstrip("\n").split("\t")
            cols = {h.strip(): i for i, h in enumerate(header)}
            for line in text:
                f = line.rstrip("\n").split("\t")
                if len(f) <= cols["INTPTLONG"]:
                    continue
                state = f[cols["USPS"]].strip().upper()
                name = f[cols["NAME"]].strip()
                try:
                    lat = float(f[cols["INTPTLAT"]])
                    lon = float(f[cols["INTPTLONG"]].strip())
                except ValueError:
                    continue
                for key in {norm_full(name), norm_county(name)}:
                    if key:
                        out[(state, key)] = (lat, lon)
    return out


def load_zip_counties(cache: Path):
    """zip -> (state_upper, county_key) from the GeoNames ZIP dump (admin2)."""
    raw = _download(GEONAMES_ZIP, cache)
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        with zf.open("US.txt") as fh:
            for f in (line.rstrip("\n").split("\t")
                      for line in io.TextIOWrapper(fh, encoding="utf-8")):
                # country, postal, place, admin1, admin1_code, admin2(name),
                # admin2_code, admin3, admin3_code, lat, lon, accuracy
                if len(f) < 6:
                    continue
                zip_code, state, county = f[1].strip(), f[4].strip(), f[5].strip()
                if len(zip_code) == 5 and zip_code.isdigit() and state and county:
                    out.setdefault(zip_code, (state.upper(), norm_county(county)))
    return out


def lookup_city(idx, state, name):
    for key in (norm_full(name), norm_city(name)):
        hit = idx.get((state, key))
        if hit:
            return hit
    return None


def lookup_county(idx, state, name):
    for key in (norm_full(name), norm_county(name), county_core(name), deglue_county(name)):
        if key:
            hit = idx.get((state, key))
            if hit:
                return hit
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", default=str(ROOT / "public" / "data" / "index.json"))
    ap.add_argument("--zip", default=str(ROOT / "public" / "data" / "geo" / "zip-centroids.json"))
    ap.add_argument("--cache-dir", default=str(ROOT / "data-build" / ".geo-cache"))
    args = ap.parse_args()
    cache = Path(args.cache_dir)

    index = json.loads(Path(args.index).read_text())
    jurs = index["jurisdictions"]

    print("Loading geocode sources …")
    cities = load_geonames_cities(cache)
    counties = load_census_counties(cache)
    print(f"  {len(cities):,} city keys, {len(counties):,} county keys")

    # County name -> id (per state), so ZIP admin2 can resolve to a covered county.
    county_id_by_key = {}
    for j in jurs:
        if j["type"] == "county":
            for key in {norm_full(j["name"]), norm_county(j["name"]),
                        county_core(j["name"]), deglue_county(j["name"])}:
                if key:
                    county_id_by_key.setdefault((j["state"].upper(), key), j["id"])

    n_city = n_city_hit = n_county = n_county_hit = 0
    misses = []
    for j in jurs:
        state = j["state"].upper()
        if j["type"] == "city":
            n_city += 1
            hit = lookup_city(cities, state, j["name"])
        else:
            n_county += 1
            hit = lookup_county(counties, state, j["name"])
        if hit:
            j["lat"], j["lon"] = round(hit[0], 4), round(hit[1], 4)
            if j["type"] == "city":
                n_city_hit += 1
            else:
                n_county_hit += 1
        else:
            j["lat"], j["lon"] = None, None
            misses.append(j["id"])

    Path(args.index).write_text(json.dumps(index, ensure_ascii=False))
    cpct = 100 * n_city_hit / n_city if n_city else 0
    kpct = 100 * n_county_hit / n_county if n_county else 0
    print(f"Geocoded cities  : {n_city_hit}/{n_city} ({cpct:.1f}%)")
    print(f"Geocoded counties: {n_county_hit}/{n_county} ({kpct:.1f}%)")
    if misses:
        print(f"  {len(misses)} unmatched (skipped): {', '.join(misses[:20])}"
              + (" …" if len(misses) > 20 else ""))

    # ZIP -> exact containing county id. Rewrite zip-centroids as [lat, lon, id?].
    zip_path = Path(args.zip)
    if zip_path.exists():
        table = json.loads(zip_path.read_text())
        zip_county = load_zip_counties(cache)
        matched = 0
        for z, val in table.items():
            lat, lon = val[0], val[1]
            cid = None
            sc = zip_county.get(z)
            if sc:
                cid = county_id_by_key.get(sc)
            if cid:
                table[z] = [lat, lon, cid]
                matched += 1
            else:
                table[z] = [lat, lon]
        zip_path.write_text(json.dumps(table, separators=(",", ":")))
        print(f"ZIP→county: {matched:,}/{len(table):,} ZIPs mapped to a covered county")
    else:
        print(f"  (no {zip_path}; run build_geo.py first to enable ZIP→county)")


if __name__ == "__main__":
    main()
