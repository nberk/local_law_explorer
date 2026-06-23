#!/usr/bin/env python3
"""
LOCUS local-law tools: build pipeline.

Reads the LOCUS-v1 corpus (HuggingFace parquet), filters to substantive laws for
the pilot jurisdictions, cleans headers, tags each law with the lenses it belongs
to (everyday / business / renting), and emits flat JSON the static Astro site
consumes:

    public/data/index.json            -- manifest (picker + corpus stats)
    public/data/<state>/<slug>.json   -- per-jurisdiction laws

Source defaults to the remote HF dataset via DuckDB's hf:// protocol, so it is
reproducible without a local download. Pass --source to point at local parquet.

Usage:
    python3 pipeline/build.py
    python3 pipeline/build.py --source '/path/to/local/*.parquet'
"""

import argparse
import json
import re
from pathlib import Path

import duckdb

# --- Pilot jurisdictions (state, city-slug) ---------------------------------
# Largest covered cities, geographically spread.
LARGE_CITIES = [
    ("il", "chicago"),
    ("ca", "san_diego"),
    ("mi", "detroit"),
    ("wa", "seattle"),
    ("or", "portland"),
    ("md", "baltimore"),
    ("ga", "atlanta"),
    ("la", "new_orleans"),
    ("hi", "honolulu"),
    ("tx", "houston"),
]
# A sample of small towns across different states.
SMALL_TOWNS = [
    ("ak", "utqiagvik"),
    ("nm", "cloudcroft"),
    ("ny", "lake_placid_village"),
    ("pa", "state_college_borough"),
    ("id", "grangeville"),
    ("ia", "steamboatrock"),
    ("mt", "terry"),
    ("wi", "marshfield"),
]
PILOT = LARGE_CITIES + SMALL_TOWNS

# Corpus-wide headline stats (verified from the full dataset, for the homepage).
CORPUS_STATS = {
    "total_laws": 2211516,
    "states": 50,
    "cities": 1644,
    "counties": 345,
    "topics": ["Zoning", "Nuisance", "Buildings", "Business", "Other"],
}

STATE_NAMES = {
    "ak": "Alaska", "al": "Alabama", "ar": "Arkansas", "az": "Arizona",
    "ca": "California", "co": "Colorado", "ct": "Connecticut", "dc": "District of Columbia",
    "de": "Delaware", "fl": "Florida", "ga": "Georgia", "hi": "Hawaii",
    "ia": "Iowa", "id": "Idaho", "il": "Illinois", "in": "Indiana",
    "ks": "Kansas", "ky": "Kentucky", "la": "Louisiana", "ma": "Massachusetts",
    "md": "Maryland", "me": "Maine", "mi": "Michigan", "mn": "Minnesota",
    "mo": "Missouri", "ms": "Mississippi", "mt": "Montana", "nc": "North Carolina",
    "nd": "North Dakota", "ne": "Nebraska", "nh": "New Hampshire", "nj": "New Jersey",
    "nm": "New Mexico", "nv": "Nevada", "ny": "New York", "oh": "Ohio",
    "ok": "Oklahoma", "or": "Oregon", "pa": "Pennsylvania", "ri": "Rhode Island",
    "sc": "South Carolina", "sd": "South Dakota", "tn": "Tennessee", "tx": "Texas",
    "ut": "Utah", "va": "Virginia", "vt": "Vermont", "wa": "Washington",
    "wi": "Wisconsin", "wv": "West Virginia", "wy": "Wyoming",
}

TOPICS = ["Zoning", "Nuisance", "Buildings", "Business", "Other"]

# Lens keyword lexicons (matched against lowercased title + content head).
BUSINESS_KW = [
    "licens", "permit", "fee", "registrat", "vendor", "peddl", "solicit",
    "business", "occupational", "home occupation", "food", "restaurant",
    "alcohol", "liquor", "sign", "signage", "inspect", "zoning", "commercial",
]
HOUSING_KW = [
    "noise", "rental", "rent ", "tenant", "landlord", "occupan", "lodging",
    "property maintenance", "maintenance", "trash", "garbage", "refuse",
    "weed", "nuisance", "dwelling", "habit", "housing", "sidewalk", "yard",
    "animal", "dog", "pet", "fence", "short-term", "short term", "vacation rental",
]

# --- Header cleaning --------------------------------------------------------
# Strip leading markdown hashes, pull off a leading section identifier, and
# tidy the remaining title. Returns (title, section_id_or_None).
_SECTION_RE = re.compile(
    r"""^
    (?:(?:sec(?:tion)?|art(?:icle)?|chapter|ch|title|part|div(?:ision)?|no|ordinance(?:\s+no)?)\.?\s*)*
    (?P<sec>[0-9][0-9A-Za-z]*(?:[.\-][0-9A-Za-z]+)*)
    [:.]?\s+
    """,
    re.IGNORECASE | re.VERBOSE,
)

_SMALL_WORDS = {"of", "the", "and", "a", "an", "to", "in", "for", "on", "or",
                "by", "with", "at", "from", "as", "vs", "per"}


def smart_titlecase(s: str) -> str:
    """Title-case ALL-CAPS headers, leaving already-mixed-case text alone and
    preserving short acronyms (RV, DUI, EMS)."""
    if any(c.islower() for c in s):
        return s
    words = s.split()
    out = []
    for i, w in enumerate(words):
        wl = w.lower()
        if w.isalpha() and w.isupper() and len(w) <= 3 and wl not in _SMALL_WORDS:
            out.append(w)  # keep acronyms
        elif i > 0 and wl in _SMALL_WORDS:
            out.append(wl)
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def clean_header(header: str):
    if not header:
        return "", None
    s = re.sub(r"^#+\s*", "", header).strip()
    section = None
    m = _SECTION_RE.match(s)
    if m:
        section = m.group("sec")
        title = s[m.end():].strip()
    else:
        title = s
    # tidy separators and trailing punctuation
    title = title.replace("--", " - ").strip(" .:-")
    title = re.sub(r"\s{2,}", " ", title)
    if not title:
        # header was only a section/ordinance number; keep the stripped form
        title = s.strip(" .:")
    return smart_titlecase(title), section


def display_name(slug: str) -> str:
    name = slug.replace("_", " ")
    return " ".join(w.capitalize() for w in name.split())


def lenses_for(topic, text):
    lenses = ["everyday"]  # everything is browsable in the everyday view
    if topic == "Business" or any(k in text for k in BUSINESS_KW):
        lenses.append("business")
    if topic == "Nuisance" or any(k in text for k in HOUSING_KW):
        lenses.append("renting")
    return lenses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--source",
        default="hf://datasets/LocalLaws/LOCUS-v1/data/*.parquet",
        help="Parquet glob (remote hf:// default, or a local path).",
    )
    ap.add_argument("--out", default="public/data", help="Output directory.")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")

    # Query each jurisdiction separately: simple equality predicates let DuckDB
    # push down to the relevant parquet row groups (a combined IN on a computed
    # key defeats pushdown and destabilizes the remote read).
    print("Querying LOCUS for %d pilot jurisdictions ..." % len(PILOT))
    by_juris = {}
    for state, city in PILOT:
        sql = f"""
            SELECT state, city, header, content, topic, function,
                   enforcement_discretion, opacity, paternalism, problem_salience
            FROM '{args.source}'
            WHERE source_jurisdiction_type = 'cities'
              AND is_substantive
              AND state = ? AND city = ?
        """
        res = con.execute(sql, [state, city])
        cols = [d[0] for d in res.description]
        rows = res.fetchall()
        by_juris[(state, city)] = [dict(zip(cols, r)) for r in rows]
        print("  %-28s %5d rows" % (f"{state}/{city}", len(rows)))

    manifest = []
    for (state, city), laws in sorted(by_juris.items()):
        slug = city
        name = display_name(city)
        counts = {t: 0 for t in TOPICS}
        out_laws = []
        for i, d in enumerate(laws):
            topic = d["topic"] or "Other"
            counts[topic] = counts.get(topic, 0) + 1
            title, section = clean_header(d["header"])
            text = (title + " " + (d["content"] or "")[:400]).lower()
            out_laws.append({
                "id": f"{slug}-{i}",
                "title": title,
                "section": section,
                "topic": topic,
                "function": d["function"],
                "lenses": lenses_for(topic, text),
                "scores": {
                    "opacity": round(d["opacity"], 2) if d["opacity"] is not None else None,
                    "paternalism": round(d["paternalism"], 2) if d["paternalism"] is not None else None,
                    "enforcement_discretion": round(d["enforcement_discretion"], 2) if d["enforcement_discretion"] is not None else None,
                    "problem_salience": round(d["problem_salience"], 2) if d["problem_salience"] is not None else None,
                },
                "content": d["content"],
            })

        opacities = sorted(l["scores"]["opacity"] for l in out_laws if l["scores"]["opacity"] is not None)
        median_op = opacities[len(opacities) // 2] if opacities else None

        juris_doc = {
            "id": f"{state}/{slug}",
            "name": name,
            "state": state.upper(),
            "stateName": STATE_NAMES.get(state, state.upper()),
            "type": "city",
            "laws": out_laws,
        }
        state_dir = out / state
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / f"{slug}.json").write_text(json.dumps(juris_doc, ensure_ascii=False))

        manifest.append({
            "id": f"{state}/{slug}",
            "name": name,
            "state": state.upper(),
            "stateName": STATE_NAMES.get(state, state.upper()),
            "type": "city",
            "counts": {"total": len(out_laws), **counts},
            "medianOpacity": median_op,
            "size": "large" if len(out_laws) >= 1000 else "small",
        })
        print("  wrote %-28s %5d laws" % (f"{state}/{slug}", len(out_laws)))

    index = {
        "corpus": CORPUS_STATS,
        "jurisdictions": sorted(manifest, key=lambda j: -j["counts"]["total"]),
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False))
    print("Wrote %s (%d jurisdictions)" % (out / "index.json", len(manifest)))


if __name__ == "__main__":
    main()
