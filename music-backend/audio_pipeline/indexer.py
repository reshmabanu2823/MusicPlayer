"""
indexer.py — FAISS Vector Index Builder
=========================================
Responsibility: take a dict of {song_id → embedding_vector} and build
a FAISS index that supports sub-millisecond nearest-neighbor search.

WHY FAISS?
----------
FAISS (Facebook AI Similarity Search) is the industry standard for dense
vector search. It is:
  - Pure C++ with a Python wrapper → extremely fast even on CPU
  - Offline / self-contained — no network, no API key, no running server
  - Supports exact search (flat index) and approximate search (IVF/HNSW)
    on the same API, so scaling up is a one-line change

WHY A FLAT INDEX (not IVF or HNSW)?
-------------------------------------
At N = 156 songs, a flat brute-force index is the *correct* choice:
  - Brute force at 156 × 113 dims takes < 0.1 ms — imperceptibly fast
  - IVF (Inverted File Index) requires N > ~10,000 vectors before its
    approximate quantization error is worth the speed gain
  - HNSW (Hierarchical Navigable Small World) graph needs N > ~50,000
    to beat flat search in practice

When to upgrade:
  - N > 10k   → IndexIVFFlat(quantizer, dim, nlist=100)
  - N > 100k  → IndexIVFPQ (product quantization, 4–16× compression)
  - N > 1M    → IndexIVFPQ + GPU + sharding across nodes

HOW COSINE SIMILARITY WORKS HERE:
-----------------------------------
  All vectors are L2-normalized in extractor.py (unit length).
  For unit vectors: cosine_similarity(u, v) = dot_product(u, v)
  FAISS's IndexFlatIP (Inner Product) computes dot products.
  → Cosine similarity becomes a free dot product at query time. ✓

  WHY COSINE, not Euclidean distance?
    Euclidean distance is sensitive to vector magnitude (loudness).
    Cosine similarity only cares about direction (tonal character).
    A quiet version of Beethoven's 5th and a loud version should be
    close — cosine gets this right, Euclidean doesn't.
"""

import faiss
import numpy as np
import json
import os

# ─── Paths ─────────────────────────────────────────────────────────────────

# Directory where all pipeline outputs are stored (relative to this file)
EMBEDDINGS_DIR = os.path.join(os.path.dirname(__file__), "..", "embeddings")
EMBEDDINGS_JSON = os.path.join(EMBEDDINGS_DIR, "embeddings.json")
FAISS_INDEX_PATH = os.path.join(EMBEDDINGS_DIR, "index.faiss")
ID_MAP_PATH = os.path.join(EMBEDDINGS_DIR, "id_map.json")

# Embedding dimensionality — must match extractor.py's output (113)
EMBEDDING_DIM = 113


# ─── Build Index ────────────────────────────────────────────────────────────

def build_index(embeddings: dict[str, list[float]]) -> None:
    """
    Build a FAISS flat inner-product index from a dict of embeddings.

    Args:
        embeddings: {song_id (str) → embedding (list[float], len=113)}

    Writes three files to embeddings/:
        embeddings.json   — raw embedding dict (source of truth)
        index.faiss       — binary FAISS index (fast query)
        id_map.json       — list of song_ids in FAISS row order
                            (FAISS uses integer row indices internally;
                             this maps row_index → song_id)
    """
    os.makedirs(EMBEDDINGS_DIR, exist_ok=True)

    if not embeddings:
        print("⚠️  No embeddings to index.")
        return

    # ── 1. Materialize the id→row mapping ─────────────────────────────────
    # FAISS identifies vectors by integer row index (0, 1, 2…).
    # We need a stable mapping from that index back to our song_id strings.
    song_ids = list(embeddings.keys())  # deterministic order (Python 3.7+)
    id_map = {i: sid for i, sid in enumerate(song_ids)}

    # ── 2. Stack vectors into a (N, D) float32 matrix ────────────────────
    # FAISS requires contiguous float32 arrays — no Python lists.
    matrix = np.array(
        [embeddings[sid] for sid in song_ids],
        dtype=np.float32
    )

    # Sanity check: all vectors should be unit length (from extractor.py)
    norms = np.linalg.norm(matrix, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-5):
        print("⚠️  Some vectors are not unit-normalized. Re-normalizing...")
        # Avoid division by zero for zero-vectors (silent/corrupt files)
        safe_norms = np.where(norms == 0, 1.0, norms)
        matrix = matrix / safe_norms[:, np.newaxis]

    # ── 3. Build FAISS IndexFlatIP (exact cosine similarity) ─────────────
    # IndexFlatIP = Flat (brute-force) Inner Product index.
    # "Flat" means no compression or approximation — 100% recall guaranteed.
    index = faiss.IndexFlatIP(EMBEDDING_DIM)

    # FAISS also offers IndexIDMap so we could use string-like int64 IDs,
    # but since MongoDB ObjectIds are 24-char hex strings (not int64), we
    # manage the id→row mapping ourselves via id_map.json. Simpler + clearer.
    index.add(matrix)

    print(f"[OK] FAISS index built: {index.ntotal} vectors, {EMBEDDING_DIM} dims")

    # ── 4. Persist everything to disk ─────────────────────────────────────
    faiss.write_index(index, FAISS_INDEX_PATH)
    print(f"   Written: {FAISS_INDEX_PATH}")

    with open(EMBEDDINGS_JSON, "w") as f:
        json.dump(embeddings, f)
    print(f"   Written: {EMBEDDINGS_JSON}")

    with open(ID_MAP_PATH, "w") as f:
        json.dump(id_map, f)
    print(f"   Written: {ID_MAP_PATH}")


# ─── Load Index ─────────────────────────────────────────────────────────────

def load_index() -> tuple[faiss.Index, dict, dict]:
    """
    Load the pre-built FAISS index and id maps from disk.

    Returns:
        (index, id_map, embeddings)
        where id_map = {row_index (str) → song_id (str)}
        and   embeddings = {song_id → vector list}
    """
    if not os.path.exists(FAISS_INDEX_PATH):
        raise FileNotFoundError(
            f"FAISS index not found at {FAISS_INDEX_PATH}. "
            "Run batch_process.py first."
        )

    index = faiss.read_index(FAISS_INDEX_PATH)

    with open(ID_MAP_PATH) as f:
        id_map = json.load(f)  # keys are str (JSON), values are song_id str

    with open(EMBEDDINGS_JSON) as f:
        embeddings = json.load(f)

    return index, id_map, embeddings


# ─── Self-test ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Create a tiny synthetic index to verify FAISS is installed and working
    print("Running FAISS self-test with 5 random unit vectors…")
    rng = np.random.default_rng(42)
    fake = {
        f"song_{i}": (v / np.linalg.norm(v)).tolist()
        for i, v in enumerate(rng.standard_normal((5, EMBEDDING_DIM)).astype(np.float32))
    }
    build_index(fake)

    idx, id_map, embs = load_index()
    print(f"Loaded index: {idx.ntotal} vectors")
    print(f"ID map sample: {list(id_map.items())[:3]}")
    print("✅  FAISS self-test passed")
