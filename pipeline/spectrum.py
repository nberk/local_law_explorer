"""
Spectrum selection for the homepage opacity / paternalism explorers.

Dependency-free (no duckdb) so both pipeline/build.py and a one-off authoring
driver can import it without drift. Picks ~20 legible laws evenly spaced across a
score dimension, preferring jurisdiction variety, and merges in any previously
hand-authored plain-language translations so a rebuild never clobbers them.

The plain-language `plain` field is authored by hand and lives only in the
committed spectrum.json; this module never generates it (no model calls).
"""

import json
import re
from pathlib import Path

SPECTRUM_N = 20
CONTENT_CAP = 1200
DIMS = ["opacity", "paternalism"]

# Generic OCR headers + ceremonial boilerplate that should never land on the rail
# (they read as junk and the classifier often mislabels them).
_SKIP_TITLE = re.compile(
    r"^(definitions?|general provisions|short title|purpose|scope|applicability|"
    r"severability|penalt|enforcement|administration|findings|intent|authority|"
    r"adoption|repeal|effective date|reserved|in general|construction of)\b"
    r"|municipal flag|city flag|corporate seal|city seal|coat of arms|commemorat",
    re.IGNORECASE,
)


def _eligible(law):
    """A law is rail-worthy if it has a clean, legible, medium-length body and a
    real (non-junk) title. Topic 'Other' is the classifier's junk drawer, so skip
    it for the showcase even though the browse keeps it."""
    title = (law.get("title") or "").strip()
    content = law.get("content") or ""
    if not title or law.get("topic") == "Other":
        return False
    if _SKIP_TITLE.search(title):
        return False
    if not (180 <= len(content) <= 1400):
        return False
    if content.count(" ") < 25:
        return False
    return True


def flatten(state, slug, name, law):
    """One pool entry from a per-jurisdiction law dict (the shape build.py and the
    committed <state>/<slug>.json files share)."""
    return {
        "jurisId": f"{state}/{slug}",
        "jurisName": name,
        "state": state.upper(),
        "slug": slug,
        "title": law.get("title"),
        "section": law.get("section"),
        "topic": law.get("topic") or "Other",
        "scores": law.get("scores", {}),
        "content": law.get("content") or "",
    }


def _key(law):
    return f'{law["jurisId"]}|{law.get("section") or ""}|{(law.get("title") or "").strip().lower()}'


def select(pool, dim, n=SPECTRUM_N):
    """Pick ~n eligible laws spanning the dimension's range, one per jurisdiction
    where possible. Deterministic: sort by score, take evenly-spaced ranks, and
    nudge each pick to the nearest law in an as-yet-unused jurisdiction."""
    cand = [l for l in pool if _eligible(l) and l["scores"].get(dim) is not None]
    cand.sort(key=lambda l: l["scores"][dim])
    if len(cand) <= n:
        return cand

    used, used_juris, picked = set(), set(), []
    for k in range(n):
        target = round(k * (len(cand) - 1) / (n - 1))
        chosen = _nearest(cand, target, used, used_juris)
        if chosen is None:  # all nearby jurisdictions already used -> nearest unused
            chosen = _nearest(cand, target, used, None)
        if chosen is None:
            continue
        used.add(chosen)
        used_juris.add(cand[chosen]["jurisId"])
        picked.append(chosen)
    return [cand[i] for i in sorted(picked)]


def _nearest(cand, target, used, used_juris):
    """Index nearest to `target` that is unused (and, if used_juris given, in a
    fresh jurisdiction). Returns None if none qualifies."""
    for off in range(len(cand)):
        for j in (target - off, target + off):
            if 0 <= j < len(cand) and j not in used:
                if used_juris is None or cand[j]["jurisId"] not in used_juris:
                    return j
    return None


def build_spectrum(pool, prior_path):
    """Return the spectrum.json document (sans `generated`). Carries forward any
    hand-authored `plain` translation found in the prior file at prior_path."""
    prior = {}
    p = Path(prior_path)
    if p.exists():
        try:
            old = json.loads(p.read_text())
            for spec in old.get("spectra", {}).values():
                for law in spec.get("laws", []):
                    if law.get("plain"):
                        prior[_key(law)] = law["plain"]
        except Exception:
            pass

    spectra = {}
    for dim in DIMS:
        laws = []
        for l in select(pool, dim):
            laws.append({
                "jurisId": l["jurisId"], "jurisName": l["jurisName"],
                "state": l["state"], "slug": l["slug"],
                "title": l["title"], "section": l["section"], "topic": l["topic"],
                "score": round(l["scores"][dim], 2),
                "content": l["content"][:CONTENT_CAP],
                "plain": prior.get(_key(l)),
            })
        spectra[dim] = {"key": dim, "laws": laws}
    return {"spectra": spectra}
