# Musicify — Audio Similarity Pipeline

> **"Songs like this"** — Find sonically similar tracks using audio embeddings + FAISS vector search.

---

## What Are Audio Embeddings?

An **audio embedding** is a fixed-size numerical vector (an array of floats)
that encodes the sonic character of a song into a point in high-dimensional
space. The key property is:

> **Songs that sound alike have embedding vectors that point in similar directions.**

In this implementation, each song becomes a **113-dimensional unit vector**
derived from its raw waveform. No metadata (title, artist, genre tags) is used —
the similarity is purely based on what the audio *sounds like*.

---

## Feature Vector Breakdown

| Feature | What it captures | Dimensions |
|---|---|---|
| **MFCCs** (40 coefficients, mean+std) | Timbre / tonal texture — the "colour" of the sound | 80 |
| **Chroma** (12 pitch classes, mean+std) | Harmonic content / musical key | 24 |
| **Spectral Centroid** (mean+std) | Brightness — treble-heavy vs bass-heavy | 2 |
| **Spectral Rolloff** (mean+std) | Frequency spread — noise vs pure tone | 2 |
| **Zero Crossing Rate** (mean+std) | Percussive vs melodic character | 2 |
| **RMS Energy** (mean+std) | Loudness dynamics — compressed pop vs dynamic classical | 2 |
| **Tempo (BPM)** | Rhythmic pace | 1 |
| **Total** | | **113** |

All vectors are **L2-normalized** (unit length) before storage and search.

---

## Why Cosine Similarity?

After L2 normalization, **cosine similarity = dot product**:

```
cosine_sim(u, v) = (u · v) / (|u| × |v|)
                 = u · v          ← because |u| = |v| = 1
```

**Why not Euclidean distance?**

Euclidean distance measures the straight-line distance between two points.
It is sensitive to the *magnitude* of vectors — a loud song and a quiet song
with the same tonal character would be "far apart" in Euclidean space.

Cosine similarity only measures the *angle* between vectors — it ignores
magnitude and focuses purely on direction (tonal character). This is
exactly what we want for music: a piano piece played softly and loudly
should still be near each other.

**Score interpretation:**
```
1.00  =  identical  (same song queried against itself)
0.90+ =  very similar  (same genre, tempo, and key)
0.70+ =  similar  (shared energy profile or harmonic content)
0.50+ =  loosely related
< 0.5 =  unlikely recommendation
```

---

## Why This Model Choice (librosa vs neural)?

### The tradeoff

| | librosa (classical DSP) | OpenL3 / MusicNN (neural) |
|---|---|---|
| **Install** | `pip install librosa` — 30 seconds | TensorFlow + model weights, 500MB+ |
| **Explainability** | Every dim has a mathematical meaning | Black-box 512-dim learned representation |
| **Quality at N=156** | ✅ Excellent — genre/tempo/key captured | ✅ Slightly better on edge cases |
| **Quality at N=1M** | ⚠️ May plateau — hand-crafted features | ✅ Scales better with data diversity |
| **Windows setup** | ✅ Trivial | ⚠️ TF version conflicts common |
| **Interview value** | ✅ Can explain every feature | ✅ Can explain the DL motivation |

### Decision

At 156 songs, classical features are the right choice. The architecture is
**model-agnostic**: `extractor.py` is the only file that changes if you swap
in OpenL3. Everything downstream — indexer, searcher, Node API, frontend —
stays identical.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Python Audio Pipeline                      │
│                  (runs offline, once)                        │
│                                                             │
│  batch_process.py                                           │
│    │                                                        │
│    ├─→ extractor.py       load_audio() + extract_embedding()│
│    │       librosa DSP features → 113-dim float32 vector   │
│    │                                                        │
│    ├─→ indexer.py         build_index()                     │
│    │       FAISS IndexFlatIP → index.faiss                  │
│    │       {song_id → vector} → embeddings.json             │
│    │       {row → song_id}   → id_map.json                  │
│    │                                                        │
│    └─→ searcher.py        precompute_all_similarities()     │
│            {song_id → top-10 similar} → similarity_map.json │
└─────────────────────────────────────────────────────────────┘
                           │
                     embeddings/
                   ┌───────────────┐
                   │ embeddings.json│  ← raw vectors
                   │ id_map.json   │  ← row↔id mapping
                   │ index.faiss   │  ← binary index
                   │ similarity_map│  ← pre-computed results
                   └───────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                   Node.js Backend                            │
│                                                             │
│  routes/similar.js                                          │
│    GET /api/songs/:id/similar?limit=10                      │
│    ├─ reads similarity_map.json (O(1) hash lookup)          │
│    ├─ enriches with Song metadata from MongoDB              │
│    └─ returns {songs, scores, cached: true}                 │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                   React / Vanilla Frontend                   │
│                                                             │
│  Now Playing Card → "Songs like this" section               │
│    Card per song: cover art, title, artist, match %         │
└─────────────────────────────────────────────────────────────┘
```

---

## How to Run

### 1. Install dependencies

```bash
cd music-backend/audio_pipeline
pip install -r requirements.txt
```

### 2. Make sure the Node backend is running

```bash
# In music-backend/
node server.js
```

### 3. Run the batch pipeline (first time — all songs)

```bash
cd music-backend/audio_pipeline
python batch_process.py
```

Expected output:
```
═══════════════════════════════════════════════════
  Musicify — Audio Similarity Pipeline
═══════════════════════════════════════════════════

⟳  Fetching song list from API…
   Found 156 songs in library

⟳  Extracting audio embeddings…
  100%|████████████████| 156/156 [02:34<00:00,  1.01song/s]

⟳  Building FAISS index…
   ✅  FAISS index built: 156 vectors, 113 dims

⟳  Pre-computing similarity map (top 10 per song)…
   Written: embeddings/similarity_map.json

  ✅  Pipeline complete!
```

### 4. Incremental runs (after new uploads)

```bash
python batch_process.py --incremental
```

Only songs not yet in `embeddings.json` are processed.

---

## How It Would Scale

### Current: N = 156 songs

- Flat brute-force FAISS (`IndexFlatIP`)
- All-pairs pre-computed → O(1) API lookups
- Batch re-run after every ~20 new uploads

### N = 10,000 songs

- Switch to `IndexIVFFlat` (Inverted File Index)
- Partition vectors into `nlist ≈ 100` Voronoi cells
- Search only the closest `nprobe = 10` cells → ~10× faster, ~99% recall
- Pre-computation still feasible (~5 min batch)

### N = 1,000,000 songs

- `IndexIVFPQ` (Product Quantization): compress 113-dim float32 to ~16 bytes
  per vector → 64× memory reduction, 50ms search
- Add GPU index (`faiss.index_cpu_to_gpu`) for another ~10× speedup
- Replace pre-computation with **live FAISS search** via FastAPI microservice
- Add Redis cache: `similar:{song_id}` with 1h TTL
- Shard index across multiple nodes with consistent hashing on song_id

### N = 100,000,000 songs (Spotify scale)

- Distributed FAISS on GPU cluster
- Hierarchical indexing (coarse HNSW + fine PQ)
- Two-stage retrieval: fast approximate search → neural reranker
- Swap librosa features for a production neural model (Spotify uses a CNN
  trained on 30-second audio clips with contrastive learning)

---

## Limitations & Tradeoffs

| Limitation | Impact | Fix |
|---|---|---|
| 30s analysis window | Misses songs that start slow but get energetic | Use full duration or sample 3 windows (start/middle/end) |
| Tempo estimation ±2× error | 120 BPM may be "heard" as 60 BPM | Use multiple tempo candidates, soft penalize 2× matches |
| No lyrics/vocals modelling | Two songs with same instrumentation but different energy score similarly | Add vocal separation (Demucs) + separate vocal embedding |
| Pre-computed similarity is stale | New uploads aren't recommendable until next batch run | Wire batch_process.py into the upload route as a background job |
| librosa loads full file into RAM | 156 × 30s @ 22kHz ≈ 200MB peak RAM during batch | Stream in chunks with `librosa.stream()` for very large libraries |

---

## Interview One-Liner

> "We represent each song as a 113-dimensional DSP feature vector — MFCCs for
> timbre, chroma for harmony, spectral features for brightness and energy.
> Vectors are L2-normalized so cosine similarity becomes a dot product, which
> FAISS's flat index computes in under a millisecond for our library size.
> The architecture is model-agnostic: swapping the extractor for a neural model
> like OpenL3 is a one-file change — everything downstream stays identical."
