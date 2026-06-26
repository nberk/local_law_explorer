#!/usr/bin/env python3
"""Build public/data/patterns.json for the /patterns explorer.

Source of the national-aggregate + hand-authored content is the standalone
docs/conduct-explorer.html (its inline `const DATA = {…}` blob). This script:

  1. lifts that DATA object,
  2. resolves each §01 example town ("Chattanooga, TN") to its LOCUS
     jurisdiction id ("tn/chattanooga") against public/data/index.json, so the
     tiles can link to the town page (unresolved names keep id=null → plain
     text),
  3. adds a per-subject search term `q` (used to seed the town-page search when a
     tile is clicked),
  4. writes the trimmed result to public/data/patterns.json.

v1 treats the output as committed, hand-derived data (the numbers are already
computed; the §02 plain-language paraphrases are hand-authored). A future
pipeline step could regenerate the computable parts — see docs/patterns-integration.md.

Run: python3 scripts/build_patterns.py
"""

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "docs" / "conduct-explorer.html"
INDEX = ROOT / "public" / "data" / "index.json"
OUT = ROOT / "public" / "data" / "patterns.json"


def extract_data(html: str) -> dict:
    i = html.index("const DATA = ") + len("const DATA = ")
    depth = 0
    for j in range(i, len(html)):
        c = html[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
    return json.loads(html[i : j + 1])


def squash(s: str) -> str:
    """Accent-fold, lowercase, keep alphanumerics — mirrors the name-repair rule."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Good search terms per §01 subject (seeds the town-page LawBrowser on tile click).
# Keys not listed fall back to the first word of the label, lowercased.
Q_OVERRIDES = {
    "alcohol": "alcohol",
    "noise": "noise",
    "junk_vehicle": "junk vehicle",
    "leash": "leash",
    "dangerous_dogs": "dangerous dog",
    "fence": "fence",
    "fireworks": "fireworks",
    "parades": "parade",
    "weeds": "weeds",
    "chickens": "chicken",
    "snow_removal": "snow",
    "short_term_rental": "rental",
    "food_truck": "food truck",
    "peddlers": "peddler",
    "loitering": "loitering",
    "curfew": "curfew",
    "open_burning": "burning",
    "golf_cart": "golf cart",
    "marijuana": "marijuana",
    "bees": "bee",
    "goats": "goat",
    "swine": "swine",
    "horses": "horse",
    "pigeons": "pigeon",
    "drones": "drone",
    "kennel": "kennel",
}

EXAMPLE_RE = re.compile(r"^(.*),\s*([A-Z]{2})$")


def build_resolver(index: dict):
    """(state, squashed-name) -> jurisdiction id."""
    table = {}
    for e in index["jurisdictions"]:
        table[(e["state"], squash(e["name"]))] = e["id"]
    return table


def resolve_example(raw: str, table) -> dict:
    m = EXAMPLE_RE.match(raw.strip())
    if not m:
        return {"name": raw, "id": None}
    name, st = m.group(1).strip(), m.group(2)
    # Drop OCR county hints like "(monroe Co.)" before matching.
    clean = re.sub(r"\([^)]*\)", "", name).strip().rstrip(",").strip()
    jid = table.get((st, squash(clean)))
    display = f"{clean}, {st}"
    return {"name": display, "id": jid}


def main():
    data = extract_data(HTML.read_text())
    index = json.loads(INDEX.read_text())
    table = build_resolver(index)

    resolved = unresolved = 0
    for subj in data["prevalence"]:
        subj["q"] = Q_OVERRIDES.get(subj["key"], subj["label"].split()[0].lower())
        new_examples = []
        for raw in subj.get("examples", []):
            ex = resolve_example(raw, table)
            new_examples.append(ex)
            if ex["id"]:
                resolved += 1
            else:
                unresolved += 1
        subj["examples"] = new_examples

    out = {
        "nCities": data["nCities"],
        "prevalence": data["prevalence"],
        "topics": data["topics"],
        "topicPrev": data.get("topicPrev", {}),
        "regional": data["regional"],
        "region": data["region"],
        "stateNames": data["stateNames"],
        "stateN": data["stateN"],
        "regionalNotes": data["regionalNotes"],
        "labels": data["labels"],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))

    total = resolved + unresolved
    print(f"wrote {OUT.relative_to(ROOT)} — {OUT.stat().st_size // 1024} KB")
    print(f"example tiles resolved to town ids: {resolved}/{total} "
          f"({unresolved} stay plain text)")


if __name__ == "__main__":
    main()
