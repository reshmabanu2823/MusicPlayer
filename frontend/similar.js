/**
 * similar.js — "Songs Like This" Audio Similarity UI
 * =====================================================
 * Fetches from GET /api/songs/:id/similar and renders
 * song cards with animated match-percentage bars inside
 * the Now Playing Card's "Songs like this" section.
 *
 * Architecture:
 *   - fetchSimilarSongs()  → API call with session cache
 *   - buildSimilarCard()   → DOM element factory
 *   - loadSimilarSongs()   → orchestrator, called by updateNowPlayingCard()
 *
 * This file is loaded after script.js and depends on:
 *   state, playSong(), escapeHtml(), API_BASE (from script.js)
 */

/* ── Session cache: song_id → similar[] or status object ─────────────── */
const _similarCache = new Map();

/**
 * Fetch top-N similar songs for a given song ID.
 * Returns:
 *   - Array of song objects (success)
 *   - { status: "not_ready" }   — pipeline hasn't been run yet
 *   - { status: "not_indexed" } — this specific song isn't embedded
 *   - null                      — network/auth failure
 */
async function fetchSimilarSongs(songId, limit = 8) {
  if (_similarCache.has(songId)) return _similarCache.get(songId);

  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const res = await fetch(
      `${API_BASE}/api/songs/${songId}/similar?limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 202) return { status: "not_ready" };
    if (res.status === 404) return { status: "not_indexed" };
    if (!res.ok) return null;

    const data  = await res.json();
    const songs = data.songs || [];
    _similarCache.set(songId, songs);  // cache hit next time
    return songs;

  } catch (err) {
    console.warn("[similar] fetch failed:", err.message);
    return null;
  }
}

/**
 * Build a single similar-song card DOM element.
 * Clicking the card plays the song and refreshes the similar list.
 */
function buildSimilarCard(song) {
  // Deterministic gradient per song (no album art support yet)
  const gradients = [
    "linear-gradient(135deg,#1db954,#0d6e32)",
    "linear-gradient(135deg,#7c3aed,#3b82f6)",
    "linear-gradient(135deg,#e91429,#f5a623)",
    "linear-gradient(135deg,#0ea5e9,#7c3aed)",
    "linear-gradient(135deg,#f59e0b,#e91429)",
  ];
  const gi = song._id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;

  const card = document.createElement("div");
  card.className   = "npc-similar-card";
  card.dataset.songId = song._id;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `Play ${song.title} by ${song.artist}`);

  card.innerHTML = `
    <div class="npc-similar-cover"
         style="${song.coverUrl ? "" : `background:${gradients[gi]}`}">
      ${song.coverUrl
        ? `<img src="${song.coverUrl}" alt="" loading="lazy"
               onerror="this.style.display='none'">`
        : `<i class="fa-solid fa-music"></i>`}
    </div>
    <div class="npc-similar-meta">
      <div class="npc-similar-song-title">${escapeHtml(song.title)}</div>
      <div class="npc-similar-song-artist">${escapeHtml(song.artist)}</div>
    </div>
    <div class="npc-similar-score">
      <span class="npc-similar-pct">${song.match_pct}%</span>
      <div class="npc-similar-bar-track">
        <div class="npc-similar-bar-fill"
             style="width:0%"
             data-target="${song.match_pct}%"></div>
      </div>
    </div>`;

  // Play on click or Enter key
  const play = () => {
    const idx = state.songs.findIndex(s => String(s._id) === song._id);
    if (idx !== -1) {
      playSong(idx);
      // Refresh similar list for the newly playing song
      setTimeout(loadSimilarSongs, 500);
    }
  };
  card.addEventListener("click", play);
  card.addEventListener("keydown", e => { if (e.key === "Enter") play(); });

  return card;
}

/**
 * Animate the match-percentage bars after cards are painted.
 * Deferred so the CSS transition from 0% → target% fires visibly.
 */
function animateSimilarBars(container) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll(".npc-similar-bar-fill[data-target]").forEach(bar => {
        bar.style.width = bar.dataset.target;
      });
    }, 80);
  });
}

/**
 * Main entry point — called by updateNowPlayingCard() whenever a new
 * song starts or the Now Playing Card is opened.
 *
 * Flow: show skeleton → fetch API → render cards or empty state.
 */
async function loadSimilarSongs() {
  const listEl   = document.getElementById("npc-similar-list");
  const statusEl = document.getElementById("npc-similar-status");
  if (!listEl) return;

  const song = state.songs[state.currentIndex];
  if (!song) return;

  const songId = String(song._id);

  /* ── 1. Show skeleton while loading ──────────────────────────────── */
  listEl.innerHTML = `
    <div class="npc-similar-placeholder">
      <div class="npc-similar-skeleton"></div>
      <div class="npc-similar-skeleton"></div>
      <div class="npc-similar-skeleton"></div>
    </div>`;
  if (statusEl) statusEl.textContent = "";

  /* ── 2. Fetch ─────────────────────────────────────────────────────── */
  const result = await fetchSimilarSongs(songId);

  /* ── 3. Render ────────────────────────────────────────────────────── */
  listEl.innerHTML = "";

  // Pipeline hasn't been run yet
  if (!result || result?.status === "not_ready") {
    listEl.innerHTML = `
      <div class="npc-similar-not-ready">
        <i class="fa-solid fa-flask"></i>
        Similarity index not ready.<br>
        Run: <code>python audio_pipeline/batch_process.py</code>
      </div>`;
    return;
  }

  // This specific song not embedded yet
  if (result?.status === "not_indexed") {
    listEl.innerHTML = `
      <div class="npc-similar-not-ready">
        <i class="fa-solid fa-hourglass-half"></i>
        Song not indexed yet.<br>
        Run: <code>batch_process.py --incremental</code>
      </div>`;
    return;
  }

  // No similar songs returned
  if (!Array.isArray(result) || result.length === 0) {
    listEl.innerHTML = `
      <div class="npc-similar-not-ready">
        <i class="fa-solid fa-circle-question"></i>
        No similar songs found.
      </div>`;
    return;
  }

  /* ── 4. Success — build and insert cards ──────────────────────────── */
  const fragment = document.createDocumentFragment();
  result.forEach(s => fragment.appendChild(buildSimilarCard(s)));
  listEl.appendChild(fragment);

  if (statusEl) statusEl.textContent = `${result.length} found`;

  // Animate match-percentage bars
  animateSimilarBars(listEl);
}
