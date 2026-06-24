#!/usr/bin/env python3
"""
LOCUS local-law tools: build pipeline.

Reads the LOCUS-v1 corpus (HuggingFace parquet), filters to substantive laws for
the pilot jurisdictions, cleans headers, tags each law with the lenses it belongs
to (everyday / business / renting), and synthesizes three higher-level views:

  * a Place Portrait      -- how this town compares to the rest of the US, derived
                             from the four z-scored model dimensions + topic mix;
  * Common questions      -- which laws answer everyday "Can I ...?" questions;
  * Notable rules         -- a text-only heuristic surfacing distinctive ordinances.

It emits flat JSON the static Astro site consumes:

    public/data/index.json            -- manifest (picker + corpus stats + teaser)
    public/data/baselines.json        -- national percentile breakpoints
    public/data/<state>/<slug>.json   -- per-jurisdiction laws + portrait/questions/notable

Source defaults to the remote HF dataset via DuckDB's hf:// protocol, so it is
reproducible without a local download. Pass --source to point at local parquet.

Usage:
    python3 pipeline/build.py
    python3 pipeline/build.py --source '/path/to/local/*.parquet'
"""

import argparse
import bisect
import json
import re
from pathlib import Path

import duckdb

import spectrum  # local module (pipeline/ is on sys.path when run as a script)

# --- Pilot jurisdictions (state, city-slug) ---------------------------------
# Largest covered cities, geographically spread.
LARGE_CITIES = [
    ("il", "chicago"),
    ("ca", "san_diego"),
    ("ca", "san_francisco"),
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
SCORE_DIMS = ["opacity", "paternalism", "enforcement_discretion", "problem_salience"]

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

# --- Common questions (the "Can I ...?" lens) -------------------------------
# Each question maps a real-life concern to a keyword lexicon plus an optional
# topic hint. Matching is title-weighted (see match_questions): OCR'd body text
# is noisy ("chicken" once matched a rat-control ordinance), so a hit in the
# cleaned title counts far more than a hit in the body, and a body-only hit does
# not by itself qualify a law as an answer. Keep ids in sync with QUESTIONS_META
# in src/lib/topics.ts.
QUESTIONS = [
    {"id": "backyard_chickens", "topic": "Nuisance",
     "kw": ["chicken", "poultry", "rooster", "fowl", "beekeep", "bees", "apiary", "livestock"]},
    {"id": "noise_hours", "topic": "Nuisance",
     "kw": ["noise", "quiet hours", "disturb", "amplified sound", "sound level", "decibel", "loudspeaker"]},
    {"id": "street_parking_rv", "topic": None,
     "kw": ["recreational vehicle", "motor home", "camper", "oversized vehicle", "parking of", "overnight storage", "overnight parking"]},
    {"id": "fence_shed_permit", "topic": "Buildings",
     "kw": ["fence", "shed", "accessory structure", "setback", "retaining wall", "building permit"]},
    {"id": "short_term_rental", "topic": None,
     "kw": ["short-term rental", "short term rental", "vacation rental", "transient occupancy", "bed and breakfast", "homestay"]},
    {"id": "yard_sale", "topic": "Business",
     "kw": ["yard sale", "garage sale", "rummage sale", "estate sale"]},
    {"id": "backyard_fire", "topic": "Nuisance",
     "kw": ["open burning", "open fire", "bonfire", "fire pit", "recreational fire", "incinerat", "burning of"]},
    {"id": "dogs_pets", "topic": "Nuisance",
     "kw": ["dog ", "dogs", "pets", "leash", "at large", "kennel", "barking", "animal control", "animal noise", "number of pets"]},
    {"id": "grass_weeds", "topic": "Nuisance",
     "kw": ["weed", "tall grass", "overgrown", "noxious weed"]},
    {"id": "sidewalk_snow", "topic": None,
     "kw": ["snow removal", "snow and ice", "ice and snow", "removal of snow", "clear snow", "unshoveled"]},
    {"id": "signs", "topic": "Business",
     "kw": ["signage", "billboard", "banner", "advertising display", "sign permit", "sign regulation"]},
    {"id": "home_business", "topic": "Business",
     "kw": ["home occupation", "home-based business", "home business", "cottage industry"]},
]
QUESTION_FLOOR = 3  # i.e. at least one title-keyword hit (see match_questions)

# --- Notable rules (text-only distinctiveness heuristic) --------------------
# Subjects that, when they appear in a cleaned TITLE, reliably signal a quirky or
# oddly-specific ordinance. Grouped so each surfaced law can show *why* it is
# here. This finds laws that mention distinctive subjects; it does not understand
# them, so it can be wrong (a definitions list that mentions "fowl"). The LLM
# curation pass is the future quality upgrade -- it can swap score_notable
# without changing the data contract.
NOTABLE_GROUPS = {
    "animals": ["chicken", "poultry", "rooster", "fowl", "beekeep", "bees", "apiary",
                "pigeon", "goat", "livestock", "horse", "equestrian", "kennel", "exotic animal"],
    "recreation": ["parade", "procession", "circus", "carnival", "fireworks", "festival",
                   "amusement", "arcade", "billiard", "skateboard", "golf cart", "snowmobile"],
    "conduct": ["curfew", "loiter", "panhandl", "begging", "spitting", "profan", "graffiti"],
    "tech": ["drone", "unmanned aircraft", "model rocket"],
    "vice": ["fortune", "palmist", "massage", "tattoo", "marijuana", "cannabis", "tobacco", "vaping"],
    "vending": ["peddler", "door-to-door", "ice cream truck", "mobile food", "pushcart"],
    "property": ["swimming pool", "hot tub", "abandoned vehicle", "inoperable", "junk vehicle"],
}
NOTABLE_FLOOR = 3
NOTABLE_MAX = 10
NOTABLE_PER_REASON = 2  # prefer variety over 7 near-identical tobacco rules

# Generic OCR section headers that are never "notable" even if they contain a
# keyword (e.g. a Definitions block listing "fowl").
_GENERIC_TITLE = re.compile(
    r"^(definitions?|general provisions|short title|purpose|scope|applicability|"
    r"severability|penalt|enforcement|administration|findings|intent|authority|"
    r"adoption|repeal|effective date|reserved|in general|construction of)\b",
    re.IGNORECASE,
)

# Canonical administrative/ceremonial boilerplate. Mirrors the BOILERPLATE regex
# in src/components/LawBrowser.tsx (keep the two in sync). Note: unlike the
# client browse filter we do NOT treat topic == "Other" as boilerplate here --
# many genuinely notable rules (parades, curfews) are labeled "Other".
_BOILERPLATE = re.compile(
    r"(municipal flag|city flag|official flag|corporate seal|city seal|official seal|"
    r"seal and emblem|coat of arms|\bpennant\b|decorations on public|honorary|"
    r"commemorat|naming and renaming|municipal device|code revision|numbering of code|"
    r"references? to (the )?(former|section))",
    re.IGNORECASE,
)


def is_admin_boilerplate(title: str) -> bool:
    return bool(_BOILERPLATE.search(title or ""))


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


# --- Question + notable matching (run over the cleaned per-jurisdiction laws) -

def match_questions(out_laws):
    """For each common question, return the ids of the 1-3 laws that best answer
    it. Title hits dominate; body-only hits never qualify a law on their own."""
    result = []
    for ql in QUESTIONS:
        scored = []
        for law in out_laws:
            title = (law["title"] or "").lower()
            # Require a hit in the cleaned title. OCR'd body text is too noisy to
            # qualify a law on its own (a body mention of "dog" once dragged in a
            # generic "Public Works and Property" header). Body hits only refine
            # the ranking among already title-matched laws.
            tscore = sum(3 for k in ql["kw"] if k in title)
            if tscore == 0:
                continue
            head = (law["content"] or "")[:300].lower()
            s = tscore + sum(1 for k in ql["kw"] if k in head)
            if ql["topic"] and law["topic"] == ql["topic"]:
                s += 1
            if is_admin_boilerplate(law["title"]):
                s -= 5
            if s >= QUESTION_FLOOR:
                scored.append((s, law["id"], re.sub(r"\s+", " ", title).strip()))
        scored.sort(key=lambda x: -x[0])
        matches, seen = [], set()
        for _, lid, key in scored:  # dedupe repeated titles (e.g. "... – Suspension" x3)
            if key in seen:
                continue
            seen.add(key)
            matches.append(lid)
            if len(matches) == 3:
                break
        result.append({"id": ql["id"], "matches": matches})
    return result


def score_notable(law):
    """Heuristic distinctiveness score for one law. Returns (score, reason) or
    (None, None) if the law is disqualified."""
    title = (law["title"] or "").lower()
    head = (law["content"] or "")[:300].lower()
    if not title or is_admin_boilerplate(law["title"]) or _GENERIC_TITLE.match(law["title"] or ""):
        return None, None

    s = 0
    reason = None
    for group, kws in NOTABLE_GROUPS.items():
        for k in kws:
            if k in title:
                s += 3
                if reason is None:
                    reason = group
            elif k in head:
                s += 1
                if reason is None:
                    reason = group
    if reason is None:
        return None, None

    # title specificity: reward concrete mid-length titles, dock bare headers
    nwords = len((law["title"] or "").split())
    if 3 <= nwords <= 10:
        s += 1
    elif nwords <= 2:
        s -= 1

    # small, capped nudge from the model dimensions (never the dominant term)
    ps = law["scores"].get("problem_salience")
    if ps is not None and ps >= 1.0:
        s += 1
    return s, reason


def notable_rules(out_laws):
    scored = []
    seen = set()
    for law in out_laws:
        s, reason = score_notable(law)
        if s is None or s < NOTABLE_FLOOR:
            continue
        key = re.sub(r"\s+", " ", (law["title"] or "").lower()).strip()
        if key in seen:
            continue
        seen.add(key)
        scored.append((s, law["id"], reason))
    scored.sort(key=lambda x: -x[0])

    # Two passes: first cap each category so one prolific subject (Chicago's
    # tobacco code) can't crowd out variety; then backfill any remaining slots.
    picked, per_reason = [], {}
    for _, lid, reason in scored:
        if per_reason.get(reason, 0) < NOTABLE_PER_REASON:
            picked.append((lid, reason))
            per_reason[reason] = per_reason.get(reason, 0) + 1
    if len(picked) < NOTABLE_MAX:
        chosen = {lid for lid, _ in picked}
        for _, lid, reason in scored:
            if lid not in chosen:
                picked.append((lid, reason))
                if len(picked) >= NOTABLE_MAX:
                    break
    return [{"id": lid, "reason": reason} for lid, reason in picked[:NOTABLE_MAX]]


# --- National baselines + Place Portrait ------------------------------------

def fetch_baselines(con, source):
    """One cheap GROUP BY aggregation over the whole corpus: per-jurisdiction mean
    of each score dimension and per-topic counts. Pulls only the small aggregated
    result down (never the huge `content` column, never a remote ORDER BY), so it
    streams in a few seconds. Returns sorted per-dimension / per-topic-share value
    lists used to place any town on the national distribution."""
    sql = f"""
        SELECT source_jurisdiction_type AS jtype, state,
               coalesce(city, county) AS place,
               count(*) AS total,
               avg(opacity) AS opacity,
               avg(paternalism) AS paternalism,
               avg(enforcement_discretion) AS enforcement_discretion,
               avg(problem_salience) AS problem_salience,
               count(*) FILTER (WHERE topic = 'Zoning')    AS Zoning,
               count(*) FILTER (WHERE topic = 'Nuisance')  AS Nuisance,
               count(*) FILTER (WHERE topic = 'Buildings') AS Buildings,
               count(*) FILTER (WHERE topic = 'Business')  AS Business
        FROM '{source}'
        WHERE is_substantive AND coalesce(city, county) IS NOT NULL
        GROUP BY source_jurisdiction_type, state, coalesce(city, county)
    """
    res = con.execute(sql)
    cols = [d[0] for d in res.description]
    rows = [dict(zip(cols, r)) for r in res.fetchall()]

    dim_vals = {d: [] for d in SCORE_DIMS}
    share_vals = {t: [] for t in TOPICS}
    for r in rows:
        for d in SCORE_DIMS:
            if r[d] is not None:
                dim_vals[d].append(r[d])
        total = r["total"] or 0
        if total:
            named = sum(r[t] for t in ["Zoning", "Nuisance", "Buildings", "Business"])
            for t in ["Zoning", "Nuisance", "Buildings", "Business"]:
                share_vals[t].append(r[t] / total)
            share_vals["Other"].append((total - named) / total)
    for d in dim_vals:
        dim_vals[d].sort()
    for t in share_vals:
        share_vals[t].sort()
    return {"n": len(rows), "dims": dim_vals, "shares": share_vals}


def percentile(value, sorted_vals):
    """Integer percentile of `value` within an ascending sorted list."""
    if value is None or not sorted_vals:
        return None
    i = bisect.bisect_right(sorted_vals, value)
    return round(100 * i / len(sorted_vals))


def _breakpoints(sorted_vals):
    n = len(sorted_vals)
    if not n:
        return []
    return [round(sorted_vals[min(n - 1, p * n // 100)], 4) for p in range(101)]


# Plain-language band thresholds (percentiles).
HIGH, LOW = 70, 30

_TOPIC_PHRASE = {
    "Zoning": "zoning and land use",
    "Nuisance": "nuisance and quality-of-life rules",
    "Buildings": "building and construction rules",
    "Business": "business and licensing",
}
_TOPIC_SHORT = {
    "Zoning": "zoning", "Nuisance": "nuisance rules",
    "Buildings": "building codes", "Business": "business rules",
}


def _opacity_sentence(pctl):
    plain = 100 - pctl  # higher opacity = denser = less plain
    if plain >= HIGH:
        return f"writes its laws more plainly than about {plain}% of the towns we cover", plain
    if plain <= LOW:
        return f"leans on denser legal language than most towns (plainer than only about {plain}%)", plain
    return "writes its laws about as plainly as the typical town", plain


def _band_sentence(pctl, high, mid, low):
    if pctl >= HIGH:
        return high.format(pctl=pctl)
    if pctl <= LOW:
        return low
    return mid


def build_portrait(laws_raw, counts, total, baselines):
    """Synthesize the Place Portrait for one jurisdiction from its mean scores and
    topic mix, placed against the national baselines."""
    means = {}
    for d in SCORE_DIMS:
        vals = [l[d] for l in laws_raw if l[d] is not None]
        means[d] = sum(vals) / len(vals) if vals else None

    dims = []
    # opacity -> plainness
    op_pctl = percentile(means["opacity"], baselines["dims"]["opacity"])
    if op_pctl is not None:
        sent, plain = _opacity_sentence(op_pctl)
        dims.append({"key": "opacity", "percentile": op_pctl,
                     "displayPercentile": plain, "sentence": sent, "estimate": True})
    # paternalism
    pat = percentile(means["paternalism"], baselines["dims"]["paternalism"])
    if pat is not None:
        dims.append({"key": "paternalism", "percentile": pat, "estimate": True,
                     "sentence": _band_sentence(
                         pat,
                         "regulates personal conduct more than about {pctl}% of towns",
                         "regulates personal conduct about as much as the typical town",
                         "regulates personal conduct less than most towns")})
    # enforcement discretion
    ed = percentile(means["enforcement_discretion"], baselines["dims"]["enforcement_discretion"])
    if ed is not None:
        dims.append({"key": "enforcement_discretion", "percentile": ed, "estimate": True,
                     "sentence": _band_sentence(
                         ed,
                         "leaves enforcement to officials' judgment more than about {pctl}% of towns",
                         "leaves about as much to officials' discretion as the typical town",
                         "writes more bright-line rules, leaving officials less discretion than most towns")})
    # problem salience: meaning unverified vs the paper -> keep in data, no copy
    ps = percentile(means["problem_salience"], baselines["dims"]["problem_salience"])
    if ps is not None:
        dims.append({"key": "problem_salience", "percentile": ps, "estimate": True,
                     "sentence": None, "verifyCopy": True})

    # topic standouts (only the notably-above / below ones, ranked by extremeness)
    topic_mix = []
    for t in ["Zoning", "Nuisance", "Buildings", "Business"]:
        if not total:
            continue
        share = counts.get(t, 0) / total
        p = percentile(share, baselines["shares"][t])
        if p is None:
            continue
        if p >= HIGH:
            sent = f"devotes more of its code to {_TOPIC_PHRASE[t]} than about {p}% of towns"
        elif p <= LOW:
            sent = f"spends less of its code on {_TOPIC_PHRASE[t]} than most towns"
        else:
            continue
        topic_mix.append({"topic": t, "share": round(share, 3), "percentile": p, "sentence": sent})
    topic_mix.sort(key=lambda x: -abs(x["percentile"] - 50))
    topic_mix = topic_mix[:3]

    headline = _headline(op_pctl, topic_mix)
    # Composition skew: a corpus dominated by "Other" (e.g. SF, whose LOCUS entry
    # is almost entirely the City Charter) means we captured the administrative
    # scaffolding, not the operational code. Calibrated against the pilots: real
    # codes top out near 55% Other, so >=65% reliably flags a coverage gap.
    other_share = counts.get("Other", 0) / total if total else 0
    return {
        "lawCount": total,
        "lowConfidence": total < 150,
        "limitedCoverage": other_share >= 0.65,
        "headline": headline,
        "dimensions": dims,
        "topicMix": topic_mix,
    }


def _headline(op_pctl, topic_mix):
    # most extreme topic standout drives the first half
    if topic_mix:
        top = topic_mix[0]
        if top["percentile"] >= HIGH:
            topic_part = f"Heavy on {_TOPIC_SHORT[top['topic']]}"
        else:
            topic_part = f"Light on {_TOPIC_SHORT[top['topic']]}"
    else:
        topic_part = "A broad mix of rules"
    if op_pctl is None:
        return topic_part
    plain = 100 - op_pctl
    if plain >= HIGH:
        style = "plainly written"
    elif plain <= LOW:
        style = "densely written"
    else:
        style = "average density"
    return f"{topic_part}, {style}"


# Per-jurisdiction national percentiles for the city-ranking page. Only the three
# verified dimensions; problem_salience is omitted (its meaning is unverified vs
# the paper, so it is never ranked or shown).
def summary_dimensions(portrait):
    keep = ("opacity", "paternalism", "enforcement_discretion")
    out = {}
    for d in portrait["dimensions"]:
        if d["key"] not in keep:
            continue
        entry = {"percentile": d["percentile"]}
        if d.get("displayPercentile") is not None:
            entry["displayPercentile"] = d["displayPercentile"]
        out[d["key"]] = entry
    return out


# Legalese-o-Meter gallery: the most opaque laws across the pilots, capped per
# jurisdiction so the "show me another baffling law" tour spans different towns
# instead of one big-city code dominating the list.
LEGALESE_N, LEGALESE_PER_JURIS, LEGALESE_CONTENT_CAP = 60, 6, 8000


def build_legalese(pool):
    pool = sorted(pool, key=lambda c: -c["opacity"])
    seen, picked = {}, []
    for c in pool:
        if seen.get(c["jurisId"], 0) >= LEGALESE_PER_JURIS:
            continue
        seen[c["jurisId"]] = seen.get(c["jurisId"], 0) + 1
        # Cap the wall of text: the densest laws can be 25k-char OCR run-ons, and
        # 8k chars is still plenty to demonstrate density and compute readability.
        picked.append({**c, "content": c["content"][:LEGALESE_CONTENT_CAP]})
        if len(picked) >= LEGALESE_N:
            break
    return picked


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

    # National baselines first (one cheap aggregation over the whole corpus).
    print("Building national baselines ...")
    baselines = fetch_baselines(con, args.source)
    print("  aggregated %d jurisdictions" % baselines["n"])
    baselines_doc = {
        "generated": "2026-06-23",
        "n_jurisdictions": baselines["n"],
        "dimensions": {d: {"breakpoints": _breakpoints(baselines["dims"][d])} for d in SCORE_DIMS},
        "topicShares": {t: {"breakpoints": _breakpoints(baselines["shares"][t])} for t in TOPICS},
    }
    (out / "baselines.json").write_text(json.dumps(baselines_doc, ensure_ascii=False))
    print("  wrote %s" % (out / "baselines.json"))

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
    legalese_pool = []
    spectrum_pool = []
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

        total = len(out_laws)
        portrait = build_portrait(laws, counts, total, baselines)
        questions = match_questions(out_laws)
        notable = notable_rules(out_laws)

        opacities = sorted(l["scores"]["opacity"] for l in out_laws if l["scores"]["opacity"] is not None)
        median_op = opacities[len(opacities) // 2] if opacities else None

        for law in out_laws:
            spectrum_pool.append(spectrum.flatten(state, slug, name, law))
            op = law["scores"]["opacity"]
            if op is None:
                continue
            legalese_pool.append({
                "jurisId": f"{state}/{slug}",
                "jurisName": name,
                "state": state.upper(),
                "slug": slug,
                "title": law["title"],
                "section": law["section"],
                "topic": law["topic"],
                "opacity": op,
                "content": law["content"],
            })

        juris_doc = {
            "id": f"{state}/{slug}",
            "name": name,
            "state": state.upper(),
            "stateName": STATE_NAMES.get(state, state.upper()),
            "type": "city",
            "portrait": portrait,
            "questions": questions,
            "notable": notable,
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
            "counts": {"total": total, **counts},
            "medianOpacity": median_op,
            "size": "large" if total >= 1000 else "small",
            "portraitTeaser": {"headline": portrait["headline"], "lowConfidence": portrait["lowConfidence"]},
            "dimensions": summary_dimensions(portrait),
        })
        nq = sum(1 for q in questions if q["matches"])
        print("  wrote %-28s %5d laws  | %d/%d questions, %d notable  | %s"
              % (f"{state}/{slug}", total, nq, len(QUESTIONS), len(notable), portrait["headline"]))

    index = {
        "corpus": CORPUS_STATS,
        "jurisdictions": sorted(manifest, key=lambda j: -j["counts"]["total"]),
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False))
    print("Wrote %s (%d jurisdictions)" % (out / "index.json", len(manifest)))

    legalese = build_legalese(legalese_pool)
    (out / "legalese.json").write_text(
        json.dumps({"generated": "2026-06-23", "laws": legalese}, ensure_ascii=False))
    print("Wrote %s (%d laws)" % (out / "legalese.json", len(legalese)))

    # Homepage spectra. build_spectrum reads the existing spectrum.json (if any)
    # and carries forward hand-authored plain-language translations, so a rebuild
    # never clobbers them (only newly-selected laws come back with plain=null).
    spectrum_doc = spectrum.build_spectrum(spectrum_pool, str(out / "spectrum.json"))
    spectrum_doc = {"generated": "2026-06-23", **spectrum_doc}
    (out / "spectrum.json").write_text(json.dumps(spectrum_doc, ensure_ascii=False))
    n_spec = sum(len(s["laws"]) for s in spectrum_doc["spectra"].values())
    n_plain = sum(1 for s in spectrum_doc["spectra"].values() for l in s["laws"] if l["plain"])
    print("Wrote %s (%d laws, %d translated)" % (out / "spectrum.json", n_spec, n_plain))


if __name__ == "__main__":
    main()
