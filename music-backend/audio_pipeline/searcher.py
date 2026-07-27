"""
searcher.py — K-Nearest-Neighbor Similarity Search
====================================================
Responsibility: given a song_id, query the FAISS index and return the
top-N most sonically similar song_ids with their similarity scores.

This module is the only one the Node.js backend needs to invoke.
It is completely stateless — load_index() is called once at startup
(or cached between calls) and search() is pure function.

COSINE SIMILARITY SCORE INTERPRETATION:
-----------------------------------------
  After L2 normalization, the inner product IS the cosine similarity:
    score = 1.0  →  identical  (same song queried against itself)
    score > 0.9  →  very similar  (same artist, same tempo, similar key)
    score > 0.7  →  similar  (same genre, similar energy)
    score > 0.5  →  loosely related  (shared some features)
    score < 0.5  →  unlikely recommendation

  We convert score → percentage for the frontend: round(score * 100).

ARCHITECTURE NOTE — why not call Python from Node at request time?
-------------------------------------------------------------------
  Option A: Python subprocess per request (slow, ~500ms cold start)
  Option B: Python FastAPI microservice (always hot, but adds infra)
  Option C: Pre-compute all-pairs similarity, store in JSON (our choice)

  We chose a hybrid of A and C:
    - At server startup, Node reads embeddings.json + id_map.json
    - Similarity search is done via a child_process.execFile() call to
      this script with a song_id argument
    - Results are cached in Node's memory (LRU cache, 1h TTL)

  This gives us: no extra infra + instant cache hits + fresh results
  on first query. At 156 songs, the Python call takes ~20ms.

  For production scaling: replace child_process with a FastAPI service
  running on a separate port, and add Redis for the similarity cache.
"""

import sys
import json
import numpy as np
import os

# Import sibling modules (works when run as script or imported)
sys.path.insert(0, os.path.dirname(__file__))
from indexer import load_index, EMBEDDINGS_DIR


# ─── Similarity Search ──────────────────────────────────────────────────────

def find_similar(
    song_id: str,
    top_n: int = 10,
    index=None,
    id_map: dict = None,
    embeddings: dict = None,
) -> list[dict]:
    """
    Find the top-N songs most similar to the given song_id.

    Args:
        song_id:    MongoDB ObjectId string of the query song
        top_n:      Number of results to return (default 10)
        index:      Pre-loaded FAISS index (optional — loads from disk if None)
        id_map:     {row_index → song_id} mapping (optional)
        embeddings: {song_id → vector} dict (optional)

    Returns:
        List of dicts sorted by similarity descending:
        [
          {"song_id": "abc123", "score": 0.94, "match_pct": 94},
          ...
        ]
        Returns [] if song_id is not in the index yet.

    COMPLEXITY:
        FAISS flat index search: O(N × D) where N=songs, D=dimensions.
        At N=156, D=113: ~17,628 multiply-add ops → < 0.1ms on CPU.
        At N=1M: ~113M ops → ~50ms → time to switch to IVF/HNSW.
    """
    # Load index from disk if not passed in (e.g. when called as script)
    if index is None:
        index, id_map, embeddings = load_index()

    # ── Look up the query vector ──────────────────────────────────────────
    if song_id not in embeddings:
        # Song hasn't been processed yet — caller should queue it
        return []

    query_vec = np.array(embeddings[song_id], dtype=np.float32).reshape(1, -1)

    # ── Run FAISS search ──────────────────────────────────────────────────
    # We request top_n + 1 results because the query song itself will appear
    # as the #1 result with score=1.0 (it's its own nearest neighbor).
    k = min(top_n + 1, index.ntotal)
    scores, row_indices = index.search(query_vec, k)
    # scores:      shape (1, k), float32, range [-1, 1] for cosine
    # row_indices: shape (1, k), int64 row positions in the index

    # ── Build result list, excluding the query song itself ────────────────
    # FAISS returns results sorted by descending inner product (= cosine sim)
    results = []
    reverse_id_map = {str(v): k for k, v in id_map.items()}  # song_id → row

    for score, row_idx in zip(scores[0], row_indices[0]):
        if row_idx == -1:
            # FAISS returns -1 for "not found" padding
            continue

        result_song_id = id_map[str(row_idx)]

        # Skip the query song itself
        if result_song_id == song_id:
            continue

        # Clamp score to [0, 1] — floating point can produce tiny negatives
        clamped_score = float(max(0.0, min(1.0, score)))

        results.append({
            "song_id":  result_song_id,
            "score":    round(clamped_score, 4),
            "match_pct": round(clamped_score * 100),
        })

    return results[:top_n]


# ─── Batch Pre-compute (all-pairs) ──────────────────────────────────────────

def precompute_all_similarities(top_n: int = 10) -> dict:
    """
    Pre-compute similar songs for every song in the library.

    Returns:
        {song_id → [{"song_id": ..., "score": ..., "match_pct": ...}, ...]}

    This is called by batch_process.py and the result is written to
    embeddings/similarity_map.json — Node reads this file at request time,
    making the API O(1) (hash map lookup) with no Python call at runtime.

    TRADEOFF: Pre-computation means similarity data is stale until the
    next batch run. For a growing library, batch_process.py should be
    run after every ~10 new uploads (or nightly via a cron job).
    For real-time freshness, replace this with live FAISS search.
    """
    index, id_map, embeddings = load_index()
    all_song_ids = list(embeddings.keys())

    similarity_map = {}
    for sid in all_song_ids:
        similarity_map[sid] = find_similar(
            song_id=sid,
            top_n=top_n,
            index=index,
            id_map=id_map,
            embeddings=embeddings,
        )

    return similarity_map


# ─── CLI entry point (called by Node child_process) ─────────────────────────

if __name__ == "__main__":
    """
    Usage: python searcher.py <song_id> [top_n]

    Prints JSON to stdout — Node reads this via child_process.execFile().
    Stderr is used for logging so it doesn't pollute the JSON output.
    """
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python searcher.py <song_id> [top_n]"}))
        sys.exit(1)

    query_id = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        results = find_similar(query_id, top_n=n)
        # Output pure JSON to stdout — Node.js will parse this
        print(json.dumps(results))
    except FileNotFoundError as e:
        print(json.dumps({"error": str(e), "code": "INDEX_NOT_FOUND"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e), "code": "SEARCH_FAILED"}))
        sys.exit(1)
