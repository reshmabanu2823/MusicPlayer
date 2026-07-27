"""
batch_process.py — Full Library Embedding Pipeline
====================================================
Responsibility: orchestrate the end-to-end pipeline:
  1. Fetch all songs from the MongoDB-backed Node.js API
  2. Extract audio embeddings for each song (skipping already-processed ones)
  3. Build/update the FAISS index
  4. Pre-compute the similarity map for all songs
  5. Write outputs to embeddings/ for Node to consume

USAGE:
------
  # First time (process everything):
  python batch_process.py

  # Incremental run (only new songs not yet embedded):
  python batch_process.py --incremental

  # Custom API URL (if backend runs on different port):
  python batch_process.py --api http://localhost:3001

  # Dry run (shows what would be processed, no writes):
  python batch_process.py --dry-run

WHEN TO RUN:
------------
  - Once after initial library seeding (your 156 songs)
  - After every batch of new uploads
  - Can be wired to run automatically after POST /songs via a Node
    child_process.spawn() call in the upload route (non-blocking)

ARCHITECTURE — WHY OFFLINE BATCH vs REAL-TIME?
-----------------------------------------------
  Real-time extraction (embed on upload) adds ~5-10s latency to each
  upload. For a music platform, upload UX matters more than immediate
  recommendations. The batch approach:
    - Upload is instant (audio saved to disk, no embedding wait)
    - Next batch run makes the song recommendable
    - Simple, restartable, no queue infrastructure needed

  For production real-time: use Celery + Redis task queue so embedding
  happens in a worker process without blocking the upload response.
"""

import os
import sys
import json
import time
import argparse
import traceback
import requests
import numpy as np
from tqdm import tqdm
from pathlib import Path

# Add pipeline directory to path for sibling imports
sys.path.insert(0, os.path.dirname(__file__))
from extractor import extract_embedding
from indexer import build_index, load_index, EMBEDDINGS_JSON, EMBEDDINGS_DIR, ID_MAP_PATH, FAISS_INDEX_PATH
from searcher import precompute_all_similarities

# ─── Paths ──────────────────────────────────────────────────────────────────

SIMILARITY_MAP_PATH = os.path.join(EMBEDDINGS_DIR, "similarity_map.json")

# Root of the music-backend — uploads/ lives here
BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"

# ─── Constants ──────────────────────────────────────────────────────────────

# How many consecutive extraction failures before we abort the batch
MAX_CONSECUTIVE_ERRORS = 10

# Login credentials for the internal API (same as seed.js)
DEFAULT_API_URL    = "http://localhost:3000"
INTERNAL_EMAIL     = "musicify@app.com"
INTERNAL_PASSWORD  = "musicify123"


# ─── API Helpers ────────────────────────────────────────────────────────────

def get_auth_token(api_url: str) -> str:
    """Authenticate with the Node API and return a JWT token."""
    resp = requests.post(
        f"{api_url}/auth/login",
        json={"email": INTERNAL_EMAIL, "password": INTERNAL_PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    token = resp.json().get("token")
    if not token:
        raise ValueError("Login succeeded but no token returned")
    return token


def fetch_all_songs(api_url: str, token: str) -> list[dict]:
    """Fetch all songs from the Node API."""
    resp = requests.get(
        f"{api_url}/songs",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ─── File Resolution ────────────────────────────────────────────────────────

def resolve_audio_path(song: dict) -> Path | None:
    """
    Convert the song's stored file path (e.g. '/uploads/track.mp3')
    to an absolute filesystem path.

    Returns None if the file doesn't exist or song has no file field.
    """
    file_field = song.get("file", "")
    if not file_field:
        return None

    # Strip leading '/' so we can join cleanly
    relative = file_field.lstrip("/")  # e.g. 'uploads/track.mp3'

    # Resolve against backend root
    absolute = BACKEND_DIR / relative

    if not absolute.exists():
        return None

    return absolute


# ─── Main Pipeline ──────────────────────────────────────────────────────────

def run_pipeline(
    api_url:     str  = DEFAULT_API_URL,
    incremental: bool = False,
    dry_run:     bool = False,
    top_n:       int  = 10,
) -> None:
    """
    Full batch pipeline: fetch → extract → index → precompute → write.

    Args:
        api_url:     Base URL of the running Node backend
        incremental: If True, skip songs already in embeddings.json
        dry_run:     If True, print plan but don't write any files
        top_n:       Number of similar songs to pre-compute per song
    """
    print("\n" + "=" * 60)
    print("  Musicify -- Audio Similarity Pipeline")
    print("=" * 60 + "\n")

    # -- Step 1: Authenticate and fetch songs --
    print("[*] Fetching song list from API...")
    try:
        token = get_auth_token(api_url)
        songs = fetch_all_songs(api_url, token)
    except Exception as e:
        print(f"[ERR] Could not reach Node API at {api_url}: {e}")
        print("    Make sure the backend is running: node server.js")
        sys.exit(1)

    print(f"   Found {len(songs)} songs in library\n")

    # ── Step 2: Load existing embeddings (for incremental mode) ───────────
    existing_embeddings: dict[str, list[float]] = {}
    if incremental and os.path.exists(EMBEDDINGS_JSON):
        with open(EMBEDDINGS_JSON) as f:
            existing_embeddings = json.load(f)
        print(f"   Loaded {len(existing_embeddings)} existing embeddings (incremental mode)\n")

    # ── Step 3: Determine which songs need processing ─────────────────────
    to_process = []
    skipped_no_file = 0
    skipped_existing = 0

    for song in songs:
        sid = str(song.get("_id", ""))
        if not sid:
            continue

        # Skip if already embedded and in incremental mode
        if incremental and sid in existing_embeddings:
            skipped_existing += 1
            continue

        audio_path = resolve_audio_path(song)
        if audio_path is None:
            skipped_no_file += 1
            continue

        to_process.append({
            "id":    sid,
            "title": song.get("title", "Unknown"),
            "artist": song.get("artist", "Unknown"),
            "path": audio_path,
        })

    print(f"   To process  : {len(to_process)} songs")
    print(f"   Already done: {skipped_existing} songs (incremental skip)")
    print(f"   No audio file: {skipped_no_file} songs (skipped)\n")

    if dry_run:
        print("--- DRY RUN -- no files will be written ---")
        for s in to_process:
            print(f"  Would embed: [{s['id'][:8]}...] {s['artist']} - {s['title']}")
        print(f"\nDry run complete. {len(to_process)} songs would be processed.")
        return

    if not to_process and not existing_embeddings:
        print("[!] Nothing to process. Check that audio files exist in uploads/")
        return

    # -- Step 4: Extract embeddings --
    print("[*] Extracting audio embeddings...\n")

    new_embeddings: dict[str, list[float]] = dict(existing_embeddings)
    errors = 0
    consecutive_errors = 0
    t0 = time.perf_counter()

    for item in tqdm(to_process, unit="song", ncols=72):
        try:
            vec = extract_embedding(str(item["path"]))
            new_embeddings[item["id"]] = vec.tolist()
            consecutive_errors = 0  # reset on success

        except Exception as e:
            errors += 1
            consecutive_errors += 1
            tqdm.write(
                f"  [SKIP] [{item['title']}]: {type(e).__name__}: {e}"
            )
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                tqdm.write(
                    f"\n[ERR] {MAX_CONSECUTIVE_ERRORS} consecutive failures -- "
                    "aborting. Check audio files."
                )
                break

    elapsed = time.perf_counter() - t0
    success_count = len(new_embeddings) - len(existing_embeddings)
    print(
        f"\n   Embedded {success_count} new songs in {elapsed:.1f}s "
        f"({elapsed/max(success_count,1)*1000:.0f} ms/song)"
    )
    if errors:
        print(f"   [!] {errors} songs failed (see above) -- excluded from index")

    if not new_embeddings:
        print("[ERR] No embeddings produced. Exiting without writing index.")
        sys.exit(1)

    # -- Step 5: Build FAISS index --
    print("\n[*] Building FAISS index...")
    build_index(new_embeddings)

    # -- Step 6: Pre-compute all-pairs similarity --
    print(f"\n[*] Pre-computing similarity map (top {top_n} per song)...")
    similarity_map = precompute_all_similarities(top_n=top_n)

    with open(SIMILARITY_MAP_PATH, "w") as f:
        json.dump(similarity_map, f)
    print(f"   Written: {SIMILARITY_MAP_PATH}")

    # -- Step 7: Summary --
    total_songs = len(new_embeddings)
    total_pairs = sum(len(v) for v in similarity_map.values())
    print(f"\n{'='*60}")
    print(f"  [OK] Pipeline complete!")
    print(f"      Songs indexed  : {total_songs}")
    print(f"      Similarity pairs: {total_pairs} (top-{top_n} per song)")
    print(f"      Index location : {EMBEDDINGS_DIR}/")
    print(f"{'='*60}\n")
    print("  Next step: restart the Node backend so it picks up the new index.")
    print("  The GET /api/songs/:id/similar endpoint is now live.\n")


# ─── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Musicify Audio Similarity Pipeline — batch embedding + indexing"
    )
    parser.add_argument(
        "--api",
        default=DEFAULT_API_URL,
        help=f"Node backend URL (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Skip songs already in embeddings.json (faster re-runs)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be processed without writing any files",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=10,
        help="Number of similar songs to pre-compute per song (default: 10)",
    )

    args = parser.parse_args()

    run_pipeline(
        api_url=args.api,
        incremental=args.incremental,
        dry_run=args.dry_run,
        top_n=args.top_n,
    )
