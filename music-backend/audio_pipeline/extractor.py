"""
extractor.py — Audio Feature Extraction
========================================
Responsibility: given an audio file path, return a normalized
embedding vector that numerically captures the song's sonic character.

WHY THESE FEATURES?
-------------------
We use classical DSP (Digital Signal Processing) features rather than a
deep neural embedding (OpenL3 / MusicNN) for three reasons:
  1. Zero install pain — librosa is a pure-Python pip package.
  2. Fully explainable — every dimension has a concrete mathematical meaning
     (great for interviews and audits).
  3. At <1000 songs, the quality gap vs. a neural model is small. MFCCs alone
     achieve ~85% accuracy on genre classification benchmarks, which is the
     same proxy task as "does this song sound like that one?".

WHAT EACH FEATURE CAPTURES:
----------------------------
  MFCCs (Mel-Frequency Cepstral Coefficients):
      The most powerful single feature for audio similarity. They model the
      "shape" of the frequency spectrum in a way that mirrors how the human
      auditory system perceives timbre. Used in speech recognition since the
      1980s; still the baseline for music similarity.
      Dims: 40 coefficients × 2 stats (mean + std) = 80 dims

  Chroma (Pitch Class Profile):
      Represents the 12 semitones of the musical octave (C, C#, D …).
      Captures harmonic content and key — two songs in C major will be
      closer than one in C and one in F#. Invariant to octave.
      Dims: 12 × 2 stats = 24 dims

  Spectral Centroid:
      The "brightness" of a sound — where the center of mass of the spectrum
      is. High values = bright/treble-heavy (electronic, metal).
      Low values = warm/bass-heavy (jazz, classical).
      Dims: 2 (mean + std)

  Spectral Rolloff:
      The frequency below which 85% of the energy sits. Distinguishes
      wideband (noise, distortion) from narrowband (pure tones).
      Dims: 2 (mean + std)

  Zero Crossing Rate (ZCR):
      How often the waveform crosses zero. High ZCR = noisy/percussive.
      Low ZCR = tonal/melodic. Discriminates spoken vs. sung vs. percussion.
      Dims: 2 (mean + std)

  RMS Energy:
      Root Mean Square amplitude — a proxy for loudness dynamics.
      Distinguishes loud/compressed (pop) from dynamic (classical/jazz).
      Dims: 2 (mean + std)

  Tempo (BPM):
      Estimated beats per minute. Ensures a 60 BPM ballad doesn't get
      recommended alongside a 140 BPM techno track.
      Dims: 1

  Total vector: 80 + 24 + 2 + 2 + 2 + 2 + 1 = 113 dimensions

NORMALIZATION:
--------------
  All vectors are L2-normalized (unit length) before storage. This makes
  cosine similarity equivalent to a simple dot product — faster to compute
  and numerically stable.

INTERVIEW TALKING POINTS:
--------------------------
  Q: Why not a neural model?
  A: Tradeoff between explainability and accuracy. For a library of N songs,
     classical features work well. At N > 10k, we'd layer in a neural model
     (OpenL3 → 512-dim embedding) as the primary, and use classical features
     as a fast pre-filter.

  Q: Could you swap in OpenL3?
  A: Yes — just replace this file's extract_embedding() function. Everything
     downstream (indexer, searcher, Node API) stays identical because they
     only see the numpy vector.
"""

import numpy as np
import librosa
import warnings
import os

# Suppress librosa's UserWarnings about deprecated parameters
warnings.filterwarnings("ignore", category=UserWarning)

# ─── Configuration ─────────────────────────────────────────────────────────

# Sample rate to resample all audio to.
# 22050 Hz is the librosa default and sufficient for music features.
# (Human hearing tops out at ~20kHz; Nyquist says 22050 captures everything.)
TARGET_SR = 22_050

# Duration to analyse (seconds). We use the first 30s — enough to capture
# verse + chorus, matching how Spotify's audio analysis works.
# Using the full track would add ~3× processing time for marginal gain.
ANALYSIS_DURATION = 30

# Number of MFCC coefficients. 40 is the standard for music tasks.
# (Speech recognition uses 13; music benefits from more because timbre
# is richer than phoneme space.)
N_MFCC = 40

# Number of chroma features (always 12 — one per semitone in an octave).
N_CHROMA = 12


# ─── Feature Extraction ────────────────────────────────────────────────────

def load_audio(file_path: str) -> tuple[np.ndarray, int]:
    """
    Load an audio file and resample to TARGET_SR.

    Returns (y, sr) where y is a 1D float32 waveform array.
    librosa handles MP3, WAV, FLAC, OGG — anything ffmpeg supports.
    We mono-mix stereo because all features below are mono.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    y, sr = librosa.load(
        file_path,
        sr=TARGET_SR,         # resample to standard rate
        mono=True,            # mix stereo -> mono
        duration=ANALYSIS_DURATION,  # only analyse first 30s
        # soxr_hq: C-based resampler — 3-5x faster than kaiser_fast,
        # no resampy dependency, ships as a standalone wheel (pip install soxr)
        # Falls back to scipy if soxr is unavailable.
        res_type="soxr_hq",
    )
    return y, sr


def _stat(feature: np.ndarray) -> np.ndarray:
    """
    Reduce a time-series feature frame (shape: [bins, time_frames]) to
    a fixed-size vector by taking mean and std over the time axis.

    WHY mean + std?
      - Mean captures the overall tonal character of the song.
      - Std captures how much it varies — a song with constant brightness
        differs from one that alternates between bright and dark passages.
      - Together they give us a compact, fixed-size representation of a
        variable-length time series without losing temporal variance info.
    """
    return np.concatenate([
        np.mean(feature, axis=1),  # average across all frames
        np.std(feature, axis=1),   # standard deviation across frames
    ])


def extract_embedding(file_path: str) -> np.ndarray:
    """
    Main entry point. Given an audio file path, return a normalized
    113-dimensional numpy float32 vector representing its sonic fingerprint.

    Raises FileNotFoundError or librosa.util.exceptions.ParameterError
    if the file is corrupt or unreadable.
    """
    y, sr = load_audio(file_path)

    # ── 1. MFCCs — timbral texture (80 dims) ──────────────────────────────
    # The Short-Time Fourier Transform (STFT) gives us a spectrogram.
    # Mel-scaling mimics the logarithmic frequency perception of human ears.
    # The DCT (Discrete Cosine Transform) step decorrelates the features,
    # which is why MFCCs work better than raw mel spectrogram bins for
    # similarity: they're statistically independent, so each dim adds info.
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
    mfcc_feat = _stat(mfccs)  # shape: (80,)

    # ── 2. Chroma — harmonic/key content (24 dims) ────────────────────────
    # Projects energy onto the 12 pitch classes (C, C#, D …).
    # We use the CQT (Constant-Q Transform) variant which is more robust
    # to timbre differences than the STFT variant — two songs in the same
    # key played on different instruments will still be close.
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=N_CHROMA)
    chroma_feat = _stat(chroma)  # shape: (24,)

    # ── 3. Spectral Centroid — brightness (2 dims) ────────────────────────
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    centroid_feat = _stat(centroid)  # shape: (2,)

    # ── 4. Spectral Rolloff — frequency spread (2 dims) ───────────────────
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)
    rolloff_feat = _stat(rolloff)  # shape: (2,)

    # ── 5. Zero Crossing Rate — percussive vs tonal (2 dims) ─────────────
    zcr = librosa.feature.zero_crossing_rate(y)
    zcr_feat = _stat(zcr)  # shape: (2,)

    # ── 6. RMS Energy — loudness dynamics (2 dims) ────────────────────────
    rms = librosa.feature.rms(y=y)
    rms_feat = _stat(rms)  # shape: (2,)

    # ── 7. Tempo — rhythmic pace (1 dim) ──────────────────────────────────────
    # librosa 0.11 always returns tempo as a 1-D array; older versions returned
    # a scalar. np.atleast_1d + float(arr[0]) handles both safely.
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo_val = float(np.atleast_1d(tempo)[0])
    tempo_feat = np.array([tempo_val])  # shape: (1,)

    # ── Concatenate all features into one vector ──────────────────────────
    raw_vector = np.concatenate([
        mfcc_feat,       # 80 dims
        chroma_feat,     # 24 dims
        centroid_feat,   #  2 dims
        rolloff_feat,    #  2 dims
        zcr_feat,        #  2 dims
        rms_feat,        #  2 dims
        tempo_feat,      #  1 dim
    ]).astype(np.float32)  # total: 113 dims

    # ── L2 Normalize — make cosine similarity = dot product ──────────────
    # After normalization all vectors lie on the unit hypersphere.
    # Cosine similarity between two unit vectors u, v = u·v (dot product).
    # FAISS's IndexFlatIP (inner product) then gives exact cosine similarity
    # without any extra division at query time.
    norm = np.linalg.norm(raw_vector)
    if norm == 0:
        # Silence or corrupt file — return zero vector (will rank last)
        return raw_vector
    return raw_vector / norm


# ─── Quick self-test ───────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python extractor.py path/to/song.mp3")
        sys.exit(1)

    path = sys.argv[1]
    print(f"Extracting embedding for: {path}")
    vec = extract_embedding(path)
    print(f"Embedding shape : {vec.shape}")
    print(f"Vector norm     : {np.linalg.norm(vec):.6f}  (should be ~1.0)")
    print(f"First 10 dims   : {vec[:10]}")
