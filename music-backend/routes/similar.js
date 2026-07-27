/**
 * routes/similar.js — Audio Similarity API
 * ==========================================
 * GET /api/songs/:id/similar?limit=10
 *
 * Returns the top-N sonically similar songs for a given song ID,
 * enriched with full song metadata from MongoDB.
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. Pre-computed similarity map (similarity_map.json) is loaded once at
 *    module load time and cached in memory. This makes each request O(1)
 *    — a single hash map lookup — with no Python subprocess at query time.
 *
 * 2. If the similarity map doesn't exist yet (pipeline not run),
 *    the endpoint returns a 202 Accepted with a clear "not_ready" status
 *    rather than a 500, so the frontend can show a friendly placeholder.
 *
 * 3. Song metadata (title, artist, file URL) is fetched from MongoDB
 *    after the similarity lookup, keeping the Python layer completely
 *    decoupled from the database.
 *
 * 4. A simple in-process LRU cache (Map with max 500 entries) reduces
 *    MongoDB queries for repeated requests on the same song.
 */

const express        = require("express");
const router         = express.Router();
const path           = require("path");
const fs             = require("fs");
const Song           = require("../models/Song");
const authenticateToken = require("../middleware/auth");

// ── Paths ──────────────────────────────────────────────────────────────────

const EMBEDDINGS_DIR     = path.join(__dirname, "..", "embeddings");
const SIMILARITY_MAP_PATH = path.join(EMBEDDINGS_DIR, "similarity_map.json");
const EMBEDDINGS_JSON    = path.join(EMBEDDINGS_DIR, "embeddings.json");

// ── Load similarity map once at startup ───────────────────────────────────

/**
 * similarityMap: { [song_id]: [{song_id, score, match_pct}, ...] }
 * Loaded from disk once — no per-request I/O.
 * Re-load by restarting the Node server after running batch_process.py.
 */
let similarityMap = null;
let embeddingsIndex = null;  // {song_id: true} — to check if a song is indexed

function loadSimilarityMap() {
  try {
    if (!fs.existsSync(SIMILARITY_MAP_PATH)) {
      console.log("ℹ️  [similar] similarity_map.json not found — run batch_process.py first");
      return false;
    }
    const raw = fs.readFileSync(SIMILARITY_MAP_PATH, "utf8");
    similarityMap = JSON.parse(raw);

    // Also load the embeddings index to check if a specific song is indexed
    if (fs.existsSync(EMBEDDINGS_JSON)) {
      const embs = JSON.parse(fs.readFileSync(EMBEDDINGS_JSON, "utf8"));
      embeddingsIndex = new Set(Object.keys(embs));
    }

    const songCount = Object.keys(similarityMap).length;
    console.log(`✅  [similar] Loaded similarity map: ${songCount} songs indexed`);
    return true;
  } catch (err) {
    console.error("❌  [similar] Failed to load similarity_map.json:", err.message);
    return false;
  }
}

// Load on module init (when server.js requires this file)
const mapLoaded = loadSimilarityMap();

// ── Simple LRU cache for MongoDB metadata lookups ─────────────────────────

const METADATA_CACHE_MAX = 500;
const metadataCache = new Map();  // song_id → Song document

function cacheGet(id) { return metadataCache.get(id) || null; }

function cacheSet(id, value) {
  if (metadataCache.size >= METADATA_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order)
    metadataCache.delete(metadataCache.keys().next().value);
  }
  metadataCache.set(id, value);
}

// ── Helper: enrich similarity results with MongoDB metadata ───────────────

/**
 * Given a list of {song_id, score, match_pct} objects,
 * fetch the full Song documents from MongoDB and merge them.
 *
 * Uses the in-process cache to avoid redundant DB hits.
 * Silently drops songs that no longer exist in the DB
 * (e.g. deleted after the batch run).
 */
async function enrichWithMetadata(similarResults, apiBase) {
  const ids = similarResults.map(r => r.song_id);

  // Split into cached and uncached
  const uncachedIds = ids.filter(id => !cacheGet(id));

  if (uncachedIds.length > 0) {
    const docs = await Song.find({ _id: { $in: uncachedIds } }).lean();
    docs.forEach(doc => cacheSet(String(doc._id), doc));
  }

  // Merge similarity score with song metadata
  return similarResults
    .map(result => {
      const doc = cacheGet(result.song_id);
      if (!doc) return null;  // song deleted — skip

      // Build the audio URL the same way script.js does
      const fileField = doc.file || "";
      const audioUrl  = fileField.startsWith("http")
        ? fileField
        : `${apiBase}${fileField}`;

      return {
        _id:       String(doc._id),
        title:     doc.title   || "Unknown Title",
        artist:    doc.artist  || "Unknown Artist",
        album:     doc.album   || "",
        duration:  doc.duration || "",
        file:      doc.file    || "",
        audioUrl,
        coverUrl:  doc.coverUrl || null,
        // Similarity data
        score:     result.score,
        match_pct: result.match_pct,
      };
    })
    .filter(Boolean);  // remove nulls (deleted songs)
}

// ── Route: GET /api/songs/:id/similar ─────────────────────────────────────

/**
 * GET /api/songs/:id/similar?limit=10
 *
 * Response shapes:
 *
 *   200 OK — similar songs found
 *   {
 *     "status": "ok",
 *     "query_song_id": "abc123",
 *     "count": 10,
 *     "songs": [
 *       {
 *         "_id": "...", "title": "...", "artist": "...",
 *         "audioUrl": "...", "score": 0.9123, "match_pct": 91
 *       }, ...
 *     ]
 *   }
 *
 *   202 Accepted — pipeline not run yet
 *   { "status": "not_ready", "message": "..." }
 *
 *   404 — song not in index (not yet processed)
 *   { "status": "not_indexed", "message": "..." }
 */
router.get("/:id/similar", authenticateToken, async (req, res) => {
  const songId = req.params.id;
  const limit  = Math.min(parseInt(req.query.limit) || 10, 50);

  // ── Guard: pipeline not run yet ─────────────────────────────────────────
  if (!similarityMap) {
    return res.status(202).json({
      status:  "not_ready",
      message: "Audio similarity index not built yet. Run: python audio_pipeline/batch_process.py",
    });
  }

  // ── Guard: this specific song not indexed ────────────────────────────────
  if (!similarityMap[songId]) {
    const isInLibrary = embeddingsIndex && embeddingsIndex.has(songId);
    return res.status(404).json({
      status:  isInLibrary ? "not_indexed" : "not_indexed",
      message: `Song ${songId} has not been processed yet. Run batch_process.py --incremental to add it.`,
    });
  }

  try {
    // ── Lookup (O(1) hash map) ─────────────────────────────────────────────
    const rawResults = similarityMap[songId].slice(0, limit);

    // Determine API base URL for building audio URLs
    const proto   = req.protocol;
    const host    = req.get("host");
    const apiBase = `${proto}://${host}`;

    // ── Enrich with MongoDB metadata ───────────────────────────────────────
    const enriched = await enrichWithMetadata(rawResults, apiBase);

    res.json({
      status:         "ok",
      query_song_id:  songId,
      count:          enriched.length,
      songs:          enriched,
    });

  } catch (err) {
    console.error("[similar] Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ── Route: GET /api/songs/similarity-status ────────────────────────────────

/**
 * Quick health-check so the frontend can show/hide the "Songs like this"
 * section based on whether the pipeline has been run.
 */
router.get("/similarity-status", authenticateToken, (req, res) => {
  if (!similarityMap) {
    return res.json({ ready: false, indexed_songs: 0 });
  }
  res.json({
    ready:         true,
    indexed_songs: Object.keys(similarityMap).length,
  });
});

module.exports = router;
