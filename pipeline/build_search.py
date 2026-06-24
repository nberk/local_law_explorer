#!/usr/bin/env python3
"""
Build the global semantic-search index for the "ask anything" feature.

Reads the committed per-jurisdiction JSON (no LOCUS re-query needed), embeds every
law with bge-small-en-v1.5, and emits two index-aligned files:

    public/data/search/vectors.bin   -- flat int8 array, 44k x 384, L2-normalized
                                        then quantized (c -> round(c*127))
    public/data/search/meta.json     -- [{ i, id, jId, name, state, title,
                                          section, topic, snippet }], meta[i] <-> row i

At runtime the Pages Function embeds the user's *query* with the SAME model
(Workers AI @cf/baai/bge-small-en-v1.5); the browser dot-products the query
vector against these rows. Only the query is ever embedded live — the law text is
never summarized or rewritten (see docs/global-semantic-search.md).

The embedding model here (fastembed ONNX) must share Workers AI's vector space.
This script validates the int8 quantization against float; the fastembed-vs-Workers-AI
match must be validated separately with a CF token (see the doc's "validate" gate).

Usage:
    python3 pipeline/build_search.py
"""

import json
import re
import struct
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
OUT_DIR = DATA / "search"

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DIM = 384
# Title-forward embedding: the title is the clean signal (OCR bodies are noisy),
# so a short lead is enough. Keeping this well under bge's ~512-token limit also
# keeps per-doc compute low — embedding all 44k laws is otherwise CPU-bound.
MAX_CHARS = 400
SNIPPET_CHARS = 200
BATCH = 256

# Sample queries used only to validate that int8 ranking matches float ranking.
VALIDATION_QUERIES = [
    "can I keep chickens in my backyard",
    "my neighbor is too loud at night",
    "do I need a permit to build a fence",
    "rules for short term rentals",
    "parking an RV on the street",
]

_WS = re.compile(r"\s+")
_MD = re.compile(r"[*#>`]+")


def clean(text: str) -> str:
    """Strip markdown noise and collapse whitespace for embedding/snippets."""
    return _WS.sub(" ", _MD.sub(" ", text or "")).strip()


def embed_text(law: dict) -> str:
    """Title-forward embedding text (OCR bodies are noisy; titles are the signal)."""
    title = clean(law.get("title") or "")
    section = clean(law.get("section") or "")
    lead = clean(law.get("content") or "")[:MAX_CHARS]
    return f"{title}. {section}. {lead}".strip()


def main() -> None:
    index = json.loads((DATA / "index.json").read_text())
    jurisdictions = index["jurisdictions"]

    texts: list[str] = []
    meta: list[dict] = []
    for j in jurisdictions:
        state, slug = j["id"].split("/")
        path = DATA / state / f"{slug}.json"
        doc = json.loads(path.read_text())
        for law in doc["laws"]:
            texts.append(embed_text(law))
            meta.append(
                {
                    "i": len(meta),
                    "id": law["id"],
                    "jId": j["id"],
                    "name": j["name"],
                    "state": j["state"],
                    "title": law.get("title") or "",
                    "section": law.get("section"),
                    "topic": law.get("topic") or "Other",
                    "snippet": clean(law.get("content") or "")[:SNIPPET_CHARS],
                }
            )

    total = len(texts)
    print(f"Embedding {total:,} laws with {MODEL_NAME} (first run downloads the model)…", flush=True)
    model = TextEmbedding(model_name=MODEL_NAME)
    # fastembed yields one embedding per text; collect with progress so a long
    # CPU run is observable.
    rows = []
    for idx, emb in enumerate(model.embed(texts, batch_size=BATCH)):
        rows.append(emb)
        if (idx + 1) % 5000 == 0 or idx + 1 == total:
            print(f"  embedded {idx + 1:,}/{total:,}", flush=True)
    vecs = np.array(rows, dtype=np.float32)  # (N, 384)
    assert vecs.shape == (total, DIM), vecs.shape

    # L2-normalize so dot product == cosine, then int8-quantize.
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True).clip(min=1e-9)
    q = np.clip(np.round(vecs * 127), -127, 127).astype(np.int8)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "vectors.bin").write_bytes(q.tobytes())
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))

    # Write a tiny manifest so the client knows the dims/count without guessing.
    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"count": len(texts), "dim": DIM, "model": MODEL_NAME, "quant": "int8/127"})
    )

    vbytes = (OUT_DIR / "vectors.bin").stat().st_size
    mbytes = (OUT_DIR / "meta.json").stat().st_size
    print(f"Wrote vectors.bin ({vbytes/1e6:.1f} MB) + meta.json ({mbytes/1e6:.1f} MB) → {OUT_DIR}")

    # --- Validation: int8 ranking must track float ranking ------------------
    qf = np.array(list(model.query_embed(VALIDATION_QUERIES)), dtype=np.float32)
    qf /= np.linalg.norm(qf, axis=1, keepdims=True).clip(min=1e-9)
    qi = np.clip(np.round(qf * 127), -127, 127).astype(np.int8)

    overlaps = []
    for k in range(len(VALIDATION_QUERIES)):
        float_scores = vecs @ qf[k]
        int8_scores = (q.astype(np.int32) @ qi[k].astype(np.int32)).astype(np.float64)
        top_f = set(np.argsort(-float_scores)[:30])
        top_i = set(np.argsort(-int8_scores)[:30])
        overlap = len(top_f & top_i) / 30
        overlaps.append(overlap)
        best = meta[int(np.argmax(float_scores))]
        print(f"  q='{VALIDATION_QUERIES[k]}' top30 overlap={overlap:.2f}  top1={best['name']}: {best['title'][:50]}")

    mean_overlap = sum(overlaps) / len(overlaps)
    print(f"int8-vs-float top30 overlap: mean={mean_overlap:.3f} (target ≥ 0.95)")
    if mean_overlap < 0.95:
        print("WARNING: int8 quantization is degrading ranking — consider int16 or no quant.")


if __name__ == "__main__":
    main()
