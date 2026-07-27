/* ============================================================
   MUSICIFY — script.js
   Full Spotify-like logic with bug fixes
   ============================================================ */

// API base — if the page is served from localhost (via the Node server),
// use relative paths so the app works on any port.
// If opened as a file:// or different origin, fall back to localhost:3000.
const API_BASE = (window.location.protocol === "http:" || window.location.protocol === "https:")
  ? window.location.origin  // works on localhost:3000 or any server
  : "http://localhost:3000"; // fallback for file:// opens


/* ─── State ─────────────────────────────────────────────────── */
const state = {
  songs: [],
  currentIndex: -1,
  queue: [],
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0,       // 0=off, 1=all, 2=one
  isLiked: {},
  playlists: [],
  currentPlaylistId: null,
  contextSongId: null,
  volume: 0.7,
  isMuted: false,
  forgotPasswordEmail: "",
  searchTimeout: null,
};

/* ─── DOM Refs ──────────────────────────────────────────────── */
const audio = document.getElementById("audio-player");
const playerBar = document.getElementById("player-bar");
const playPauseBtn = document.getElementById("play-pause-btn");
const playPauseIcon = document.getElementById("play-pause-icon");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const progressFill = document.getElementById("progress-bar-fill");
const progressThumb = document.getElementById("progress-bar-thumb");
const progressContainer = document.getElementById("progress-bar-container");
const currentTimeEl = document.getElementById("current-time");
const totalTimeEl = document.getElementById("total-time");
const volumeBtn = document.getElementById("volume-btn");
const volumeIcon = document.getElementById("volume-icon");
const volumeFill = document.getElementById("volume-bar-fill");
const volumeThumb = document.getElementById("volume-bar-thumb");
const volumeContainer = document.getElementById("volume-bar-container");
const nowPlayingTitle = document.getElementById("now-playing-title");
const nowPlayingArtist = document.getElementById("now-playing-artist");
const playerCoverImg = document.getElementById("player-cover-img");
const playerLikeBtn = document.getElementById("player-like-btn");

/* ─── Now Playing Card DOM refs ──────────────────────────────── */
const npcCard       = document.getElementById("now-playing-card");
const npcArtwork    = document.getElementById("npc-artwork");
const npcCoverImg   = document.getElementById("npc-cover-img");
const npcPlaceholder= document.getElementById("npc-cover-placeholder");
const npcTitle      = document.getElementById("npc-song-title");
const npcArtist     = document.getElementById("npc-song-artist");
const npcLikeBtn    = document.getElementById("npc-like-btn");
const npcPlayBtn    = document.getElementById("npc-play-pause-btn");
const npcPlayIcon   = document.getElementById("npc-play-pause-icon");
const npcPrevBtn    = document.getElementById("npc-prev-btn");
const npcNextBtn    = document.getElementById("npc-next-btn");
const npcShuffleBtn = document.getElementById("npc-shuffle-btn");
const npcRepeatBtn  = document.getElementById("npc-repeat-btn");
const npcProgressFill   = document.getElementById("npc-progress-fill");
const npcProgressThumb  = document.getElementById("npc-progress-thumb");
const npcProgressCont   = document.getElementById("npc-progress-container");
const npcCurrentTime    = document.getElementById("npc-current-time");
const npcTotalTime      = document.getElementById("npc-total-time");
const npcVolumeFill     = document.getElementById("npc-volume-fill");
const npcVolumeThumb    = document.getElementById("npc-volume-thumb");
const npcVolumeCont     = document.getElementById("npc-volume-container");
const npcVolumeIcon     = document.getElementById("npc-volume-icon");
const npcVolumeMuteBtn  = document.getElementById("npc-volume-btn");
const npcBg             = document.getElementById("npc-bg");


/* ════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (token) {
    showMainApp();
  } else {
    showAuthContainer();
  }

  setupAuth();
  setupNavigation();
  setupPlayer();
  setupSearch();
  setupModals();
  setupContextMenu();
  setupTopbarScroll();
  setupOtpInputs();
  setupDragDrop();
  setupKeyboardShortcuts();
  setupNowPlayingCard();
  setVolume(state.volume);
});

/* ════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS (replace all alert() calls)
   ════════════════════════════════════════════════════════════ */
function showToast(message, type = "success", duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", warning: "fa-triangle-exclamation" };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ════════════════════════════════════════════════════════════
   AUTH VISIBILITY
   ════════════════════════════════════════════════════════════ */
function showAuthContainer() {
  document.getElementById("auth-container").style.display = "flex";
  document.getElementById("main-app").style.display = "none";
  playerBar.style.display = "none";
}

function showMainApp() {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("main-app").style.display = "grid";
  // Always show player bar when logged in (idle state until a song plays)
  playerBar.style.display = "flex";
  playerBar.classList.add("player-idle");

  const username = localStorage.getItem("userName") || localStorage.getItem("userEmail") || "User";
  const displayName = username.includes("@")
    ? capitalize(username.split("@")[0])
    : capitalize(username);
  document.getElementById("topbar-username").textContent = displayName;
  document.getElementById("profile-avatar-circle").textContent = displayName[0].toUpperCase();

  setGreeting();
  loadSongs();
  loadPlaylistsSidebar();
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function setGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const el = document.getElementById("page-greeting");
  if (el) el.textContent = greet;
}

/* ─── Auth Page Switcher ─────────────────────────────────────── */
function showAuthPage(page) {
  const pages = ["login-page", "register-page", "forgot-password-page", "verify-otp-page", "reset-password-page"];
  pages.forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p === `${page}-page` ? "block" : "none";
  });
  // Clear any field errors
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
}

function setAuthBtnLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector(".btn-text").style.display = loading ? "none" : "inline-flex";
  btn.querySelector(".btn-spinner").style.display = loading ? "inline-flex" : "none";
}

function showFieldError(fieldId, message) {
  const el = document.getElementById(`${fieldId}-error`);
  if (el) el.textContent = message;
  const input = document.getElementById(fieldId);
  if (input) input.classList.add("input-error");
}
function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
  document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ════════════════════════════════════════════════════════════
   AUTH SETUP
   ════════════════════════════════════════════════════════════ */
function setupAuth() {
  // Page switches
  document.getElementById("show-register").addEventListener("click", () => showAuthPage("register"));
  document.getElementById("show-login").addEventListener("click", () => showAuthPage("login"));
  document.getElementById("show-forgot-password").addEventListener("click", () => showAuthPage("forgot-password"));
  document.getElementById("back-to-login-from-forgot").addEventListener("click", () => showAuthPage("login"));
  document.getElementById("back-to-forgot").addEventListener("click", () => showAuthPage("forgot-password"));

  // Toggle password visibility
  document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.querySelector("i").className = isPass ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
    });
  });

  // Password strength meter
  const regPass = document.getElementById("register-password");
  if (regPass) {
    regPass.addEventListener("input", () => {
      const val = regPass.value;
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      const colors = ["", "#e91429", "#f5a623", "#1db954", "#1db954"];
      const labels = ["", "Weak", "Fair", "Good", "Strong"];
      const fill = document.getElementById("strength-fill");
      const label = document.getElementById("strength-label");
      if (fill) { fill.style.width = `${score * 25}%`; fill.style.background = colors[score]; }
      if (label) label.textContent = val.length > 0 ? labels[score] : "";
    });
  }

  // LOGIN
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    let valid = true;

    if (!email || !validateEmail(email)) { showFieldError("login-email", "Enter a valid email address."); valid = false; }
    if (!password) { showFieldError("login-password", "Password is required."); valid = false; }
    if (!valid) return;

    setAuthBtnLoading("login-btn", true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userEmail", data.email || email);
        if (data.name) localStorage.setItem("userName", data.name);
        showMainApp();
      } else {
        showToast(data.message || "Login failed", "error");
        showFieldError("login-email", data.message || "Invalid credentials");
      }
    } catch {
      showToast("Cannot connect to server. Is the backend running?", "error");
    } finally {
      setAuthBtnLoading("login-btn", false);
    }
  });

  // REGISTER
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();
    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    let valid = true;

    if (!name) { showFieldError("register-name", "Name is required."); valid = false; }
    if (!email || !validateEmail(email)) { showFieldError("register-email", "Enter a valid email address."); valid = false; }
    if (!password || password.length < 6) { showFieldError("register-password", "Password must be at least 6 characters."); valid = false; }
    if (!valid) return;

    setAuthBtnLoading("register-btn", true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Account created! Please log in.", "success");
        showAuthPage("login");
      } else {
        showToast(data.message || "Registration failed", "error");
        showFieldError("register-email", data.message || "Registration failed");
      }
    } catch {
      showToast("Cannot connect to server. Is the backend running?", "error");
    } finally {
      setAuthBtnLoading("register-btn", false);
    }
  });

  // FORGOT PASSWORD
  document.getElementById("forgot-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();
    const email = document.getElementById("forgot-email").value.trim();
    if (!email || !validateEmail(email)) { showFieldError("forgot-email", "Enter a valid email address."); return; }

    setAuthBtnLoading("forgot-btn", true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        state.forgotPasswordEmail = email;
        const sentTo = document.getElementById("otp-sent-to");
        if (sentTo) sentTo.textContent = `We've sent a 6-digit code to ${email}.`;
        showToast("OTP sent to your email!", "success");
        showAuthPage("verify-otp");
      } else {
        showToast(data.message || "Could not send OTP", "error");
        showFieldError("forgot-email", data.message || "Email not found");
      }
    } catch {
      showToast("Cannot connect to server.", "error");
    } finally {
      setAuthBtnLoading("forgot-btn", false);
    }
  });

  // RESEND OTP
  document.getElementById("resend-otp-btn").addEventListener("click", async () => {
    if (!state.forgotPasswordEmail) return;
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.forgotPasswordEmail })
      });
      showToast("OTP resent!", "success");
    } catch { showToast("Could not resend OTP.", "error"); }
  });

  // VERIFY OTP
  document.getElementById("verify-otp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = document.getElementById("otp-input").value;
    if (!otp || otp.length !== 6) { showFieldError("otp", "Enter the full 6-digit OTP."); return; }

    setAuthBtnLoading("verify-otp-btn", true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.forgotPasswordEmail, otp })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("OTP verified!", "success");
        showAuthPage("reset-password");
      } else {
        showToast(data.message || "Invalid OTP", "error");
        showFieldError("otp", data.message || "Invalid OTP");
      }
    } catch {
      showToast("Cannot connect to server.", "error");
    } finally {
      setAuthBtnLoading("verify-otp-btn", false);
    }
  });

  // RESET PASSWORD
  document.getElementById("reset-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();
    const password = document.getElementById("reset-new-password").value;
    const confirm = document.getElementById("reset-confirm-password").value;
    let valid = true;

    if (!password || password.length < 6) { showFieldError("reset-password", "Password must be at least 6 characters."); valid = false; }
    if (password !== confirm) { showFieldError("reset-confirm", "Passwords do not match."); valid = false; }
    if (!valid) return;

    setAuthBtnLoading("reset-btn", true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.forgotPasswordEmail, password })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Password reset successfully! Please log in.", "success");
        showAuthPage("login");
      } else {
        showToast(data.message || "Reset failed", "error");
      }
    } catch {
      showToast("Cannot connect to server.", "error");
    } finally {
      setAuthBtnLoading("reset-btn", false);
    }
  });
}

/* ─── OTP digit inputs ──────────────────────────────────────── */
function setupOtpInputs() {
  const digits = document.querySelectorAll(".otp-digit");
  const hiddenInput = document.getElementById("otp-input");
  digits.forEach((digit, i) => {
    digit.addEventListener("input", () => {
      const val = digit.value.replace(/\D/g, "");
      digit.value = val.slice(-1);
      if (val && i < digits.length - 1) digits[i + 1].focus();
      hiddenInput.value = Array.from(digits).map(d => d.value).join("");
    });
    digit.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !digit.value && i > 0) digits[i - 1].focus();
    });
    digit.addEventListener("paste", (e) => {
      const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      paste.split("").forEach((ch, j) => { if (digits[j]) digits[j].value = ch; });
      hiddenInput.value = paste;
      if (digits[paste.length - 1]) digits[paste.length - 1].focus();
      e.preventDefault();
    });
  });
}

/* ════════════════════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════════════════════ */
function setupNavigation() {
  document.getElementById("nav-songs").addEventListener("click", () => {
    showPage("songs-page");
    setSidebarActive("nav-songs");
    showTopbarSearch(false);
    loadSongs();
  });

  document.getElementById("nav-search").addEventListener("click", () => {
    showPage("search-page");
    setSidebarActive("nav-search");
    showTopbarSearch(true);
    setTimeout(() => document.getElementById("search-input").focus(), 100);
  });

  document.getElementById("nav-playlists").addEventListener("click", () => {
    showPage("playlists-page");
    setSidebarActive("nav-playlists");
    showTopbarSearch(false);
    loadPlaylists();
  });

  document.getElementById("nav-add-song").addEventListener("click", () => {
    showPage("add-song-page");
    setSidebarActive("nav-add-song");
    showTopbarSearch(false);
  });

  const logoutHandler = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    audio.pause();
    state.isPlaying = false;
    showAuthContainer();
    showToast("Logged out successfully", "success");
  };
  document.getElementById("nav-logout").addEventListener("click", logoutHandler);
  document.getElementById("dropdown-logout").addEventListener("click", (e) => { e.preventDefault(); logoutHandler(); });

  // Profile button & dropdown
  const profileBtn = document.getElementById("profile-btn");
  const profileDropdown = document.getElementById("profile-dropdown");
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = profileDropdown.style.display !== "none";
    profileDropdown.style.display = isVisible ? "none" : "block";
  });
  document.addEventListener("click", () => { profileDropdown.style.display = "none"; });

  document.getElementById("dropdown-profile").addEventListener("click", (e) => {
    e.preventDefault();
    profileDropdown.style.display = "none";
    showPage("profile-page");
    setSidebarActive(null);
    showTopbarSearch(false);
    loadProfile();
  });
  document.getElementById("dropdown-upload").addEventListener("click", (e) => {
    e.preventDefault();
    profileDropdown.style.display = "none";
    showPage("add-song-page");
    setSidebarActive("nav-add-song");
    showTopbarSearch(false);
  });

  // Topbar back/forward
  document.getElementById("topbar-back").addEventListener("click", () => history.back());
  document.getElementById("topbar-forward").addEventListener("click", () => history.forward());

  // Create playlist quick button
  const quickBtn = document.getElementById("create-playlist-quick-btn");
  if (quickBtn) quickBtn.addEventListener("click", openCreatePlaylistModal);

  const firstBtn = document.getElementById("create-first-playlist-btn");
  if (firstBtn) firstBtn.addEventListener("click", openCreatePlaylistModal);

  // Add Song form
  setupAddSong();
}

function showPage(pageId) {
  const pages = ["songs-page", "search-page", "add-song-page", "playlists-page", "profile-page", "playlist-detail-page"];
  pages.forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p === pageId ? "block" : "none";
  });
}

function setSidebarActive(navId) {
  document.querySelectorAll(".sidebar-link").forEach(el => el.classList.remove("active"));
  if (navId) {
    const el = document.getElementById(navId);
    if (el) el.classList.add("active");
  }
}

function showTopbarSearch(show) {
  const wrap = document.getElementById("topbar-search-wrap");
  if (wrap) wrap.style.display = show ? "flex" : "none";
}

function setupTopbarScroll() {
  const content = document.getElementById("content");
  const topbar = document.getElementById("topbar");
  content.addEventListener("scroll", () => {
    const scrolled = content.scrollTop > 60;
    topbar.classList.toggle("scrolled", scrolled);
  });
}

/* ════════════════════════════════════════════════════════════
   SONGS — LOAD & DISPLAY
   ════════════════════════════════════════════════════════════ */
async function loadSongs() {
  const loading = document.getElementById("songs-loading");
  const list = document.getElementById("songs-list");
  if (loading) loading.style.display = "flex";
  if (list) list.innerHTML = "";

  try {
    const token = localStorage.getItem("token");
    let localSongs = [];

    if (token) {
      try {
        const res = await fetch(`${API_BASE}/songs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const raw = await res.json();
          localSongs = raw.map(s => ({
            ...s,
            audioUrl: s.file
              ? (s.file.startsWith("http") ? s.file : `${API_BASE}${s.file}`)
              : null,
            coverUrl: null,
            isLibrary: false,
          }));
        }
      } catch { /* backend may be offline */ }
    }

    // Load Jamendo library songs only if we have very few local songs
    let librarySongs = [];
    if (localSongs.length < 5) {
      try {
        const libRes = await fetch(`${API_BASE}/library/songs`);
        if (libRes.ok) {
          const raw = await libRes.json();
          librarySongs = raw.map(song => ({
            _id: `jamendo-${song.id}`,
            title: song.name,
            artist: song.artist_name,
            album: song.album_name || "Jamendo",
            duration: formatDuration(song.duration),
            audioUrl: song.audio,
            coverUrl: song.image,
            isLibrary: true,
          }));
        }
      } catch { /* Jamendo offline */ }
    }

    // Merge: local songs first, then Jamendo (deduplicated)
    const seenIds = new Set(localSongs.map(s => String(s._id)));
    const allSongs = [
      ...localSongs,
      ...librarySongs.filter(s => !seenIds.has(s._id))
    ];

    state.songs = allSongs;
    state.queue  = [...allSongs];

    displaySongsTable(allSongs, "songs-list");

    // Featured grid — use local songs for tiles (they're the real library)
    const featuredSource = localSongs.length > 0 ? localSongs : allSongs;
    buildFeaturedGrid(featuredSource.slice(0, 6));
    buildRecentRow(featuredSource.slice(0, 8));

  } catch (err) {
    showToast("Failed to load songs", "error");
    console.error(err);
  } finally {
    if (loading) loading.style.display = "none";
  }
}


function buildFeaturedGrid(songs) {
  const grid = document.getElementById("featured-grid");
  if (!grid) return;
  grid.innerHTML = "";
  songs.forEach(song => {
    const tile = document.createElement("div");
    tile.className = "featured-tile";
    tile.innerHTML = `
      <div class="featured-tile-cover" style="background:${randomGradient(song._id)}">
        <i class="fa-solid fa-music" style="color:#fff;opacity:0.8;font-size:22px;"></i>
      </div>
      <span>${escHtml(song.title)}</span>
    `;
    tile.addEventListener("click", () => playSong(state.songs.indexOf(song)));
    grid.appendChild(tile);
  });
}

function buildRecentRow(songs) {
  const row = document.getElementById("recent-songs-row");
  if (!row) return;
  row.innerHTML = "";
  songs.forEach(song => {
    const card = document.createElement("div");
    card.className = "song-album-card";
    const idx = state.songs.indexOf(song);
    card.innerHTML = `
      <div class="song-album-card-cover">
        ${song.coverUrl
          ? `<img src="${escHtml(song.coverUrl)}" alt="${escHtml(song.title)}" loading="lazy">`
          : `<div class="song-album-card-cover-placeholder"><i class="fa-solid fa-music"></i></div>`}
        <div class="card-play-overlay"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="song-album-card-title">${escHtml(song.title)}</div>
      <div class="song-album-card-sub">${escHtml(song.artist)}</div>
    `;
    card.addEventListener("click", () => playSong(idx));
    row.appendChild(card);
  });
}

function displaySongsTable(songs, containerId, showDelete = false) {
  const list = document.getElementById(containerId);
  if (!list) return;
  list.innerHTML = "";

  if (!songs || songs.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">
      <i class="fa-solid fa-music" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.4;"></i>
      No songs found
    </div>`;
    return;
  }

  // Table header
  const header = document.createElement("div");
  header.className = "songs-table-header";
  header.innerHTML = `
    <span>#</span>
    <span>Title</span>
    <span>Album</span>
    <span>Duration</span>
    <span></span>
  `;
  list.appendChild(header);

  songs.forEach((song, localIdx) => {
    const globalIdx = state.songs.findIndex(s => s._id === song._id);
    const row = document.createElement("div");
    row.className = "song-row";
    row.dataset.songId = song._id;
    if (state.currentIndex === globalIdx) row.classList.add("active");

    const isLiked = state.isLiked[song._id];
    row.innerHTML = `
      <div class="song-row-index">
        <span class="song-row-index-num">${localIdx + 1}</span>
        <i class="fa-solid fa-play song-row-play-icon"></i>
      </div>
      <div class="song-row-info">
        ${song.coverUrl
          ? `<img class="song-row-cover" src="${escHtml(song.coverUrl)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'song-row-cover-placeholder\\'><i class=\\'fa-solid fa-music\\'></i></div>'">`
          : `<div class="song-row-cover-placeholder"><i class="fa-solid fa-music"></i></div>`}
        <div class="song-row-text">
          <div class="song-row-title">${escHtml(song.title)}</div>
          <div class="song-row-artist">${escHtml(song.artist)}</div>
        </div>
      </div>
      <div class="song-row-album">${escHtml(song.album || "")}</div>
      <div class="song-row-duration-area">
        <button class="song-row-like-btn player-icon-btn ${isLiked ? "liked" : ""}" data-id="${song._id}" aria-label="Like song">
          <i class="fa-${isLiked ? "solid" : "regular"} fa-heart"></i>
        </button>
        <span class="song-row-duration">${song.duration || ""}</span>
        <button class="song-row-more-btn player-icon-btn" data-id="${song._id}" data-title="${escHtml(song.title)}" aria-label="More options">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
      </div>
    `;

    // Play on click (not on button clicks)
    row.addEventListener("click", (e) => {
      if (e.target.closest(".song-row-like-btn") || e.target.closest(".song-row-more-btn")) return;
      if (globalIdx >= 0) playSong(globalIdx);
      else { state.songs.push(song); playSong(state.songs.length - 1); }
    });

    // Like button
    row.querySelector(".song-row-like-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLike(song._id, row.querySelector(".song-row-like-btn"));
    });

    // More options (context menu)
    row.querySelector(".song-row-more-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const btnRect = e.currentTarget.getBoundingClientRect();
      openContextMenu(song._id, song.title, song.isLibrary, btnRect);
    });

    list.appendChild(row);
  });
}

/* ════════════════════════════════════════════════════════════
   PLAYER CONTROLS
   ════════════════════════════════════════════════════════════ */
function setupPlayer() {
  playPauseBtn.addEventListener("click", togglePlayPause);
  prevBtn.addEventListener("click", playPrev);
  nextBtn.addEventListener("click", playNext);

  shuffleBtn.addEventListener("click", () => {
    state.isShuffle = !state.isShuffle;
    shuffleBtn.classList.toggle("active", state.isShuffle);
    showToast(state.isShuffle ? "Shuffle on" : "Shuffle off");
  });

  repeatBtn.addEventListener("click", () => {
    state.repeatMode = (state.repeatMode + 1) % 3;
    repeatBtn.classList.toggle("active", state.repeatMode > 0);
    const msgs = ["Repeat off", "Repeat all", "Repeat one"];
    const icons = ["fa-repeat", "fa-repeat", "fa-rotate-right"];
    repeatBtn.querySelector("i").className = `fa-solid ${icons[state.repeatMode]}`;
    showToast(msgs[state.repeatMode]);
  });

  // Audio events
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", () => {
    totalTimeEl.textContent = formatDuration(audio.duration);
  });
  audio.addEventListener("ended", () => {
    if (state.repeatMode === 2) {
      audio.currentTime = 0;
      audio.play();
    } else {
      playNext();
    }
  });
  audio.addEventListener("play", () => {
    state.isPlaying = true;
    playPauseIcon.className = "fa-solid fa-pause";
    // Activate equalizer bars
    const eq = document.getElementById("equalizer-bars");
    if (eq) { eq.classList.add("playing"); eq.classList.remove("paused"); }
    // Unpause vinyl spin
    playerBar.classList.remove("paused");
  });
  audio.addEventListener("pause", () => {
    state.isPlaying = false;
    playPauseIcon.className = "fa-solid fa-play";
    // Freeze equalizer bars
    const eq = document.getElementById("equalizer-bars");
    if (eq) { eq.classList.add("paused"); }
    // Pause vinyl spin
    playerBar.classList.add("paused");
  });
  audio.addEventListener("error", () => {
    showToast("Could not play this track", "error");
  });

  // Progress bar seeking
  let isDraggingProgress = false;
  progressContainer.addEventListener("mousedown", (e) => { isDraggingProgress = true; seekTo(e); });
  document.addEventListener("mousemove", (e) => { if (isDraggingProgress) seekTo(e); });
  document.addEventListener("mouseup", () => { isDraggingProgress = false; });

  // Volume bar
  let isDraggingVolume = false;
  volumeContainer.addEventListener("mousedown", (e) => { isDraggingVolume = true; adjustVolume(e); });
  document.addEventListener("mousemove", (e) => { if (isDraggingVolume) adjustVolume(e); });
  document.addEventListener("mouseup", () => { isDraggingVolume = false; });

  volumeBtn.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    audio.muted = state.isMuted;
    updateVolumeIcon();
    showToast(state.isMuted ? "Muted" : "Unmuted");
  });

  // Player like button
  playerLikeBtn.addEventListener("click", () => {
    if (state.currentIndex < 0) return;
    const song = state.songs[state.currentIndex];
    toggleLike(song._id, playerLikeBtn);
  });

  audio.volume = state.volume;
}

function playSong(index) {
  if (index < 0 || index >= state.songs.length) return;
  state.currentIndex = index;
  const song = state.songs[index];

  const url = song.audioUrl || null;
  if (!url) { showToast("No audio available for this track", "warning"); return; }

  audio.src = url;
  audio.play().catch(() => showToast("Playback failed. Try another track.", "error"));

  // Remove idle state — player is now active
  playerBar.classList.remove("player-idle");
  playerBar.classList.add("player-active");

  // Update player UI
  nowPlayingTitle.textContent = song.title;
  nowPlayingArtist.textContent = song.artist;

  // Cover art — use gradient placeholder based on artist
  playerCoverImg.style.display = "none";
  const placeholder = document.querySelector(".player-cover-placeholder");
  if (song.coverUrl) {
    playerCoverImg.src = song.coverUrl;
    playerCoverImg.style.display = "block";
    playerCoverImg.onload = () => { if (placeholder) placeholder.style.display = "none"; };
    playerCoverImg.onerror = () => { playerCoverImg.style.display = "none"; if (placeholder) placeholder.style.display = "flex"; };
  } else {
    if (placeholder) {
      placeholder.style.display = "flex";
      placeholder.style.background = randomGradient(song._id || song.title);
    }
  }

  // Like button state
  const isLiked = state.isLiked[song._id];
  playerLikeBtn.querySelector("i").className = `fa-${isLiked ? "solid" : "regular"} fa-heart`;
  playerLikeBtn.classList.toggle("liked", !!isLiked);

  // Highlight active row across all tables
  document.querySelectorAll(".song-row").forEach(row => {
    const isActive = row.dataset.songId === String(song._id);
    row.classList.toggle("active", isActive);
  });

  // Show player bar (always visible now, just ensure)
  playerBar.style.display = "flex";

  // Sync Now Playing Card if it's open
  updateNowPlayingCard();
}

function togglePlayPause() {
  if (state.currentIndex < 0) { if (state.songs.length > 0) playSong(0); return; }
  if (audio.paused) audio.play();
  else audio.pause();
}

function playNext() {
  if (state.songs.length === 0) return;
  if (state.isShuffle) {
    let next;
    do { next = Math.floor(Math.random() * state.songs.length); } while (next === state.currentIndex && state.songs.length > 1);
    playSong(next);
  } else {
    const next = (state.currentIndex + 1) % state.songs.length;
    playSong(next);
  }
}

function playPrev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const prev = state.currentIndex > 0 ? state.currentIndex - 1 : state.songs.length - 1;
  playSong(prev);
}

function updateProgress() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressFill.style.width = `${pct}%`;
  progressThumb.style.left = `${pct}%`;
  currentTimeEl.textContent = formatDuration(audio.currentTime);
}

function seekTo(e) {
  const rect = progressContainer.querySelector(".progress-bar-track").getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

function setVolume(vol) {
  state.volume = Math.max(0, Math.min(1, vol));
  audio.volume = state.volume;
  const pct = state.volume * 100;
  volumeFill.style.width = `${pct}%`;
  volumeThumb.style.left = `${pct}%`;
  updateVolumeIcon();
}

function adjustVolume(e) {
  const rect = volumeContainer.querySelector(".progress-bar-track").getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  state.isMuted = false;
  audio.muted = false;
  setVolume(pct);
}

function updateVolumeIcon() {
  const v = state.isMuted || state.volume === 0;
  const low = state.volume < 0.4;
  volumeIcon.className = v ? "fa-solid fa-volume-xmark" :
    low ? "fa-solid fa-volume-low" : "fa-solid fa-volume-high";
}

/* ─── Like / Dislike ─────────────────────────────────────────── */
function toggleLike(songId, btn) {
  const liked = !state.isLiked[songId];
  state.isLiked[songId] = liked;

  // Update all like buttons for this song
  document.querySelectorAll(`[data-id="${songId}"]`).forEach(b => {
    if (!b.classList.contains("song-row-like-btn") && !b.classList.contains("like-btn")) return;
    b.classList.toggle("liked", liked);
    b.querySelector("i").className = `fa-${liked ? "solid" : "regular"} fa-heart`;
  });
  playerLikeBtn.querySelector("i").className = `fa-${liked ? "solid" : "regular"} fa-heart`;
  playerLikeBtn.classList.toggle("liked", liked);

  showToast(liked ? "Added to Liked Songs" : "Removed from Liked Songs");
}

/* ════════════════════════════════════════════════════════════
   SEARCH
   ════════════════════════════════════════════════════════════ */
function setupSearch() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search-btn");

  input.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearBtn.style.display = q ? "flex" : "none";
    clearTimeout(state.searchTimeout);
    if (!q) {
      showSearchEmpty();
      return;
    }
    state.searchTimeout = setTimeout(() => performSearch(q), 400);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    showSearchEmpty();
    input.focus();
  });
}

function showSearchEmpty() {
  document.getElementById("search-empty-state").style.display = "flex";
  document.getElementById("search-results").style.display = "none";
}

async function performSearch(query) {
  document.getElementById("search-empty-state").style.display = "none";
  document.getElementById("search-results").style.display = "block";
  document.getElementById("search-query-display").textContent = query;

  const resultsContainer = document.getElementById("search-songs-list");
  resultsContainer.innerHTML = `<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>`;

  try {
    // Search local songs first
    const localMatches = state.songs.filter(s =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.artist.toLowerCase().includes(query.toLowerCase()) ||
      (s.album || "").toLowerCase().includes(query.toLowerCase())
    );

    // Search Jamendo library
    let jamendoResults = [];
    try {
      const res = await fetch(`${API_BASE}/library/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const raw = await res.json();
        jamendoResults = raw.map(song => ({
          _id: `jamendo-${song.id}`,
          title: song.name,
          artist: song.artist_name,
          album: song.album_name || "Jamendo",
          duration: formatDuration(song.duration),
          audioUrl: song.audio,
          coverUrl: song.image,
          isLibrary: true,
        }));
      }
    } catch { /* offline */ }

    // Merge without duplicates
    const seen = new Set(localMatches.map(s => s._id));
    const all = [...localMatches, ...jamendoResults.filter(s => !seen.has(s._id))];

    // Add to state.songs if not already there
    all.forEach(s => { if (!state.songs.find(x => x._id === s._id)) state.songs.push(s); });

    displaySongsTable(all, "search-songs-list");
  } catch (err) {
    resultsContainer.innerHTML = `<p style="padding:20px;color:var(--text-secondary)">Search failed. Please try again.</p>`;
    console.error(err);
  }
}

/* ════════════════════════════════════════════════════════════
   PLAYLISTS
   ════════════════════════════════════════════════════════════ */
async function loadPlaylists() {
  const grid = document.getElementById("playlists-grid");
  if (!grid) return;

  try {
    const res = await fetch(`${API_BASE}/playlist`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!res.ok) throw new Error();
    const playlists = await res.json();
    state.playlists = playlists;
    displayPlaylistsGrid(playlists, "playlists-grid");
    updateSidebarPlaylists(playlists);
  } catch {
    if (grid) grid.innerHTML = `<p style="color:var(--text-secondary)">Could not load playlists.</p>`;
  }
}

async function loadPlaylistsSidebar() {
  try {
    const res = await fetch(`${API_BASE}/playlist`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!res.ok) return;
    const playlists = await res.json();
    state.playlists = playlists;
    updateSidebarPlaylists(playlists);
  } catch { /* silent */ }
}

function updateSidebarPlaylists(playlists) {
  const container = document.getElementById("sidebar-playlists");
  if (!container) return;
  container.innerHTML = "";

  if (!playlists || playlists.length === 0) {
    container.innerHTML = `<div class="sidebar-playlist-empty">
      <p>Create your first playlist</p>
      <button onclick="openCreatePlaylistModal()" class="pill-btn">Create playlist</button>
    </div>`;
    return;
  }

  playlists.forEach(p => {
    const item = document.createElement("div");
    item.className = "sidebar-playlist-item";
    if (state.currentPlaylistId === p._id) item.classList.add("active");
    item.innerHTML = `
      <div class="sidebar-playlist-cover"><i class="fa-solid fa-music"></i></div>
      <div class="sidebar-playlist-info">
        <div class="sidebar-playlist-name">${escHtml(p.name)}</div>
        <div class="sidebar-playlist-type">Playlist · ${p.songs ? p.songs.length : 0} songs</div>
      </div>
    `;
    item.addEventListener("click", () => openPlaylistDetail(p));
    container.appendChild(item);
  });
}

function displayPlaylistsGrid(playlists, containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = "";

  if (!playlists || playlists.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);">
      <i class="fa-solid fa-music" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.4;"></i>
      No playlists yet. Create one!
    </div>`;
    return;
  }

  playlists.forEach(p => {
    const card = document.createElement("div");
    card.className = "playlist-card";
    const count = p.songs ? p.songs.length : 0;
    card.innerHTML = `
      <div class="playlist-card-cover"><i class="fa-solid fa-music"></i></div>
      <div class="playlist-card-name">${escHtml(p.name)}</div>
      <div class="playlist-card-count">${count} song${count !== 1 ? "s" : ""}</div>
      <button class="playlist-card-play-btn" aria-label="Play playlist"><i class="fa-solid fa-play"></i></button>
      <button class="playlist-card-delete-btn" aria-label="Delete playlist"><i class="fa-solid fa-trash"></i></button>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".playlist-card-delete-btn")) return;
      openPlaylistDetail(p);
    });
    card.querySelector(".playlist-card-play-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openPlaylistDetail(p, true);
    });
    card.querySelector(".playlist-card-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deletePlaylist(p._id);
    });
    grid.appendChild(card);
  });
}

async function openPlaylistDetail(playlist, autoPlay = false) {
  state.currentPlaylistId = playlist._id;
  showPage("playlist-detail-page");
  setSidebarActive(null);

  document.getElementById("playlist-detail-name").textContent = playlist.name;
  const count = playlist.songs ? playlist.songs.length : 0;
  document.getElementById("playlist-detail-info").textContent = `${count} song${count !== 1 ? "s" : ""}`;

  const songs = playlist.songs ? playlist.songs.filter(Boolean) : [];
  const mappedSongs = songs.map(s => ({
    ...s,
    audioUrl: s.file ? (s.file.startsWith("http") ? s.file : `${API_BASE}${s.file}`) : null,
    coverUrl: null,
  }));

  displaySongsTable(mappedSongs, "playlist-songs-list");

  document.getElementById("play-playlist-btn").onclick = () => {
    if (mappedSongs.length > 0) {
      const idx = state.songs.findIndex(s => s._id === mappedSongs[0]._id);
      if (idx >= 0) playSong(idx);
    }
  };
  document.getElementById("shuffle-playlist-btn").onclick = () => {
    state.isShuffle = true;
    shuffleBtn.classList.add("active");
    if (mappedSongs.length > 0) {
      const random = Math.floor(Math.random() * mappedSongs.length);
      const song = mappedSongs[random];
      const idx = state.songs.findIndex(s => s._id === song._id);
      if (idx >= 0) playSong(idx);
    }
    showToast("Shuffle on");
  };
  document.getElementById("delete-playlist-btn").onclick = () => deletePlaylist(playlist._id);

  if (autoPlay && mappedSongs.length > 0) {
    const idx = state.songs.findIndex(s => s._id === mappedSongs[0]._id);
    if (idx >= 0) playSong(idx);
  }

  updateSidebarPlaylists(state.playlists);
}

async function deletePlaylist(id) {
  if (!confirm("Delete this playlist?")) return;
  try {
    const res = await fetch(`${API_BASE}/playlist/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (res.ok) {
      showToast("Playlist deleted");
      state.playlists = state.playlists.filter(p => p._id !== id);
      updateSidebarPlaylists(state.playlists);
      loadPlaylists();
      if (state.currentPlaylistId === id) {
        showPage("playlists-page");
        state.currentPlaylistId = null;
      }
    } else {
      showToast("Could not delete playlist", "error");
    }
  } catch { showToast("Error deleting playlist", "error"); }
}

/* ════════════════════════════════════════════════════════════
   MODALS
   ════════════════════════════════════════════════════════════ */
function setupModals() {
  // Create Playlist Modal
  document.getElementById("open-create-playlist-modal")?.addEventListener("click", openCreatePlaylistModal);
  document.getElementById("close-create-playlist-modal").addEventListener("click", closeCreatePlaylistModal);
  document.getElementById("cancel-create-playlist").addEventListener("click", closeCreatePlaylistModal);
  document.getElementById("create-playlist-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeCreatePlaylistModal();
  });

  document.getElementById("create-playlist-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("playlist-name").value.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API_BASE}/playlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ name, songs: [] })
      });
      if (res.ok) {
        showToast(`Playlist "${name}" created!`);
        document.getElementById("playlist-name").value = "";
        closeCreatePlaylistModal();
        await loadPlaylists();
      } else {
        showToast("Could not create playlist", "error");
      }
    } catch { showToast("Error creating playlist", "error"); }
  });

  // Add to Playlist Modal
  document.getElementById("close-add-to-playlist-modal").addEventListener("click", closeAddToPlaylistModal);
  document.getElementById("cancel-add-to-playlist").addEventListener("click", closeAddToPlaylistModal);
  document.getElementById("add-to-playlist-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAddToPlaylistModal();
  });
}

function openCreatePlaylistModal() {
  document.getElementById("create-playlist-modal").style.display = "flex";
  setTimeout(() => document.getElementById("playlist-name").focus(), 100);
}
function closeCreatePlaylistModal() {
  document.getElementById("create-playlist-modal").style.display = "none";
}

async function openAddToPlaylistModal(songId, songTitle) {
  state.contextSongId = songId;
  document.getElementById("modal-adding-song-label").textContent = `Adding "${songTitle}" to playlist`;
  document.getElementById("modal-song-id").value = songId;

  // Load playlists
  try {
    const res = await fetch(`${API_BASE}/playlist`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    const playlists = await res.json();
    const container = document.getElementById("modal-playlists-list");
    container.innerHTML = "";
    if (!playlists || playlists.length === 0) {
      container.innerHTML = `<p style="color:var(--text-secondary);padding:10px;">No playlists yet. <a href="#" onclick="openCreatePlaylistModal()">Create one</a></p>`;
      return;
    }
    playlists.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "modal-playlist-option";
      btn.innerHTML = `
        <div class="modal-playlist-option-icon"><i class="fa-solid fa-music"></i></div>
        <span>${escHtml(p.name)}</span>
        <span style="font-size:12px;color:var(--text-secondary);margin-left:auto;">${p.songs ? p.songs.length : 0} songs</span>
      `;
      btn.addEventListener("click", () => addSongToPlaylist(p._id, songId, p.name));
      container.appendChild(btn);
    });
  } catch { }

  document.getElementById("add-to-playlist-modal").style.display = "flex";
}

function closeAddToPlaylistModal() {
  document.getElementById("add-to-playlist-modal").style.display = "none";
}

async function addSongToPlaylist(playlistId, songId, playlistName) {
  try {
    const res = await fetch(`${API_BASE}/playlist/${playlistId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ songId })
    });
    if (res.ok) {
      showToast(`Added to "${playlistName}"`);
      closeAddToPlaylistModal();
      loadPlaylistsSidebar();
    } else {
      showToast("Could not add to playlist", "error");
    }
  } catch { showToast("Error", "error"); }
}

/* ════════════════════════════════════════════════════════════
   CONTEXT MENU
   ════════════════════════════════════════════════════════════ */
function setupContextMenu() {
  const menu = document.getElementById("context-menu");

  document.getElementById("ctx-add-to-playlist").addEventListener("click", async () => {
    menu.style.display = "none";
    const songId = menu.dataset.songId;
    const title = menu.dataset.songTitle;
    await openAddToPlaylistModal(songId, title);
  });

  document.getElementById("ctx-like-song").addEventListener("click", () => {
    menu.style.display = "none";
    const songId = menu.dataset.songId;
    const btn = document.querySelector(`.song-row-like-btn[data-id="${songId}"]`);
    toggleLike(songId, btn || playerLikeBtn);
  });

  document.getElementById("ctx-delete-song").addEventListener("click", async () => {
    menu.style.display = "none";
    const songId = menu.dataset.songId;
    const isLib = menu.dataset.isLibrary === "true";
    if (isLib) { showToast("Cannot delete library songs", "warning"); return; }
    if (!confirm("Delete this song?")) return;
    try {
      const res = await fetch(`${API_BASE}/songs/${songId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) { showToast("Song deleted"); loadSongs(); }
      else showToast("Could not delete song", "error");
    } catch { showToast("Error", "error"); }
  });

  document.addEventListener("click", () => { menu.style.display = "none"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.style.display = "none"; });
}

function openContextMenu(songId, songTitle, isLibrary, rect) {
  const menu = document.getElementById("context-menu");
  menu.dataset.songId = songId;
  menu.dataset.songTitle = songTitle;
  menu.dataset.isLibrary = isLibrary ? "true" : "false";

  const deleteBtn = document.getElementById("ctx-delete-song");
  if (deleteBtn) deleteBtn.style.display = isLibrary ? "none" : "flex";

  const x = Math.min(rect.left, window.innerWidth - 200);
  const y = Math.min(rect.bottom + 4, window.innerHeight - 200);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = "block";
}

/* ════════════════════════════════════════════════════════════
   ADD SONG / UPLOAD
   ════════════════════════════════════════════════════════════ */
function setupAddSong() {
  const form = document.getElementById("add-song-form");
  const fileInput = document.getElementById("song-audio-file");
  const fileNameEl = document.getElementById("upload-file-name");
  const dropZone = document.getElementById("upload-drop-zone");

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) {
      fileNameEl.textContent = fileInput.files[0].name;
      // Auto-fill title from filename
      const titleInput = document.getElementById("song-title");
      if (!titleInput.value) {
        titleInput.value = fileInput.files[0].name.replace(/\.[^/.]+$/, "");
      }
    }
  });

  dropZone.addEventListener("click", () => fileInput.click());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();
    const title = document.getElementById("song-title").value.trim();
    const artist = document.getElementById("song-artist").value.trim();
    const album = document.getElementById("song-album").value.trim();
    const duration = document.getElementById("song-duration").value.trim();
    const file = fileInput.files[0];
    let valid = true;

    if (!title) { showFieldError("song-title", "Title is required"); valid = false; }
    if (!artist) { showFieldError("song-artist", "Artist is required"); valid = false; }
    if (!file) { showToast("Please select an audio file", "warning"); valid = false; }
    if (!valid) return;

    setAuthBtnLoading("add-song-btn", true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("artist", artist);
      formData.append("album", album);
      formData.append("duration", duration);
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/songs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`"${title}" uploaded successfully!`);
        form.reset();
        fileNameEl.textContent = "No file selected";
        showPage("songs-page");
        setSidebarActive("nav-songs");
        loadSongs();
      } else {
        showToast(data.error || "Upload failed", "error");
      }
    } catch {
      showToast("Upload error. Is the backend running?", "error");
    } finally {
      setAuthBtnLoading("add-song-btn", false);
    }
  });
}

function setupDragDrop() {
  const dropZone = document.getElementById("upload-drop-zone");
  if (!dropZone) return;
  ["dragenter", "dragover"].forEach(e => dropZone.addEventListener(e, (ev) => {
    ev.preventDefault();
    dropZone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach(e => dropZone.addEventListener(e, (ev) => {
    ev.preventDefault();
    dropZone.classList.remove("drag-over");
  }));
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
      const fileInput = document.getElementById("song-audio-file");
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      document.getElementById("upload-file-name").textContent = file.name;
      const titleInput = document.getElementById("song-title");
      if (!titleInput.value) titleInput.value = file.name.replace(/\.[^/.]+$/, "");
    } else {
      showToast("Please drop an audio file", "warning");
    }
  });
}

/* ════════════════════════════════════════════════════════════
   PROFILE
   ════════════════════════════════════════════════════════════ */
async function loadProfile() {
  try {
    // Try fetching user profile from backend
    let name = "", email = "";
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const user = await res.json();
        name = user.name || "";
        email = user.email || "";
        localStorage.setItem("userName", name);
        localStorage.setItem("userEmail", email);
      }
    } catch { /* fallback to localStorage */ }

    if (!name) name = localStorage.getItem("userName") || capitalize((localStorage.getItem("userEmail") || "User").split("@")[0]);
    if (!email) email = localStorage.getItem("userEmail") || "";

    document.getElementById("profile-name").textContent = name;
    document.getElementById("profile-email").textContent = email;

    const avatarEl = document.getElementById("profile-avatar-large");
    if (avatarEl) avatarEl.innerHTML = `<span style="font-size:72px;color:#fff;">${name[0].toUpperCase()}</span>`;

    // Stats
    let songs = [], playlists = [];
    try {
      const songRes = await fetch(`${API_BASE}/songs`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (songRes.ok) songs = await songRes.json();
    } catch { }
    try {
      const plRes = await fetch(`${API_BASE}/playlist`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (plRes.ok) playlists = await plRes.json();
    } catch { }

    document.getElementById("inline-total-songs").textContent = songs.length;
    document.getElementById("inline-total-playlists").textContent = playlists.length;

    const mappedSongs = songs.map(s => ({
      ...s,
      audioUrl: s.file ? (s.file.startsWith("http") ? s.file : `${API_BASE}${s.file}`) : null,
      coverUrl: null,
    }));
    displaySongsTable(mappedSongs, "profile-songs-list", true);
    displayPlaylistsGrid(playlists, "profile-playlists-list");

  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

/* ════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ════════════════════════════════════════════════════════════ */
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Don't fire when typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlayPause();
        break;
      case "ArrowRight":
        if (e.shiftKey) { audio.currentTime += 10; break; }
        if (e.ctrlKey || e.metaKey) { playNext(); break; }
        break;
      case "ArrowLeft":
        if (e.shiftKey) { audio.currentTime -= 10; break; }
        if (e.ctrlKey || e.metaKey) { playPrev(); break; }
        break;
      case "ArrowUp":
        e.preventDefault();
        setVolume(state.volume + 0.05);
        break;
      case "ArrowDown":
        e.preventDefault();
        setVolume(state.volume - 0.05);
        break;
      case "KeyM":
        state.isMuted = !state.isMuted;
        audio.muted = state.isMuted;
        updateVolumeIcon();
        break;
    }
  });
}

/* ════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════ */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function randomGradient(seed) {
  const colors = [
    "linear-gradient(135deg,#1db954,#0d6e32)",
    "linear-gradient(135deg,#7c3aed,#3b82f6)",
    "linear-gradient(135deg,#e91429,#f5a623)",
    "linear-gradient(135deg,#0ea5e9,#7c3aed)",
    "linear-gradient(135deg,#f59e0b,#e91429)",
    "linear-gradient(135deg,#10b981,#0ea5e9)",
  ];
  const hash = String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/* ════════════════════════════════════════════════════════════
   NOW PLAYING CARD
   ════════════════════════════════════════════════════════════ */

const npcGradients = [
  ["#1db954","#0d6e32"],
  ["#7c3aed","#3b82f6"],
  ["#e91429","#f5a623"],
  ["#0ea5e9","#7c3aed"],
  ["#f59e0b","#e91429"],
  ["#10b981","#0ea5e9"],
];

function openNowPlayingCard() {
  if (!npcCard) return;
  npcCard.style.display = "flex";
  npcCard.classList.remove("npc-closing");
  document.body.style.overflow = "hidden";
  updateNowPlayingCard();
  // Also load similar songs immediately on open (updateNowPlayingCard only
  // loads them if the song changed — this catches re-opens of the same song)
  if (typeof loadSimilarSongs === "function") loadSimilarSongs();
}

function closeNowPlayingCard() {
  if (!npcCard) return;
  npcCard.classList.add("npc-closing");
  setTimeout(() => {
    npcCard.style.display = "none";
    npcCard.classList.remove("npc-closing");
    document.body.style.overflow = "";
  }, 300);
}

function updateNowPlayingCard() {
  if (!npcCard || npcCard.style.display === "none") return;
  const song = state.songs[state.currentIndex];
  if (!song) return;

  /* Titles */
  npcTitle.textContent  = song.title  || "Unknown Title";
  npcArtist.textContent = song.artist || "Unknown Artist";

  /* Marquee scroll for long titles */
  npcTitle.classList.remove("scrolling");
  requestAnimationFrame(() => {
    if (npcTitle.scrollWidth > npcTitle.parentElement.clientWidth + 10) {
      npcTitle.classList.add("scrolling");
    }
  });

  /* Cover art */
  if (song.coverUrl) {
    npcCoverImg.src = song.coverUrl;
    npcCoverImg.style.display = "block";
    npcPlaceholder.style.display = "none";
  } else {
    npcCoverImg.style.display = "none";
    npcPlaceholder.style.display = "flex";
  }

  /* Ambient background colours */
  const hash = String(song._id || song.title)
    .split("").reduce((a,c) => a + c.charCodeAt(0), 0);
  const pair = npcGradients[hash % npcGradients.length];
  if (npcBg) {
    npcBg.style.setProperty("--npc-color1", pair[0]);
    npcBg.style.setProperty("--npc-color2", pair[1]);
  }

  /* Like button */
  const liked = state.isLiked[song._id];
  npcLikeBtn.querySelector("i").className = `fa-${liked ? "solid" : "regular"} fa-heart`;
  npcLikeBtn.classList.toggle("liked", !!liked);

  /* Vinyl spin */
  if (state.isPlaying) {
    npcArtwork.classList.add("spinning");
    npcArtwork.classList.remove("paused-spin");
  } else {
    npcArtwork.classList.add("paused-spin");
  }

  /* Shuffle / Repeat active states */
  npcShuffleBtn.classList.toggle("active", state.isShuffle);
  npcRepeatBtn.classList.toggle("active", state.repeatMode > 0);

  /* Play / pause icon */
  npcPlayIcon.className = state.isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";

  /* Load similar songs — only when card is open and song has changed */
  if (npcCard.style.display !== "none" && typeof loadSimilarSongs === "function") {
    const currentId = String(song._id);
    if (updateNowPlayingCard._lastSongId !== currentId) {
      updateNowPlayingCard._lastSongId = currentId;
      loadSimilarSongs();  // defined in similar.js
    }
  }
}

function setupNowPlayingCard() {
  if (!npcCard) return;

  /* ── Open: fullscreen button in player bar ─── */
  const fsBtn = document.getElementById("fullscreen-btn");
  if (fsBtn) fsBtn.addEventListener("click", openNowPlayingCard);

  /* ── Close ─── */
  document.getElementById("npc-close-btn")?.addEventListener("click", closeNowPlayingCard);
  /* Click outside the card container also closes */
  npcCard.addEventListener("click", (e) => {
    if (e.target === npcCard || e.target === npcBg) closeNowPlayingCard();
  });
  /* Escape key */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && npcCard.style.display !== "none") closeNowPlayingCard();
  });

  /* ── Play / Pause ─── */
  npcPlayBtn?.addEventListener("click", () => {
    if (audio.paused) audio.play();
    else audio.pause();
  });

  /* ── Prev / Next ─── */
  npcPrevBtn?.addEventListener("click", () => { playPrev(); updateNowPlayingCard(); });
  npcNextBtn?.addEventListener("click", () => { playNext(); updateNowPlayingCard(); });

  /* ── Shuffle ─── */
  npcShuffleBtn?.addEventListener("click", () => {
    state.isShuffle = !state.isShuffle;
    npcShuffleBtn.classList.toggle("active", state.isShuffle);
    document.getElementById("shuffle-btn")?.classList.toggle("active", state.isShuffle);
    showToast(state.isShuffle ? "Shuffle on" : "Shuffle off");
  });

  /* ── Repeat ─── */
  npcRepeatBtn?.addEventListener("click", () => {
    state.repeatMode = (state.repeatMode + 1) % 3;
    const msgs  = ["Repeat off",  "Repeat all", "Repeat one"];
    const icons = ["fa-repeat",   "fa-repeat",  "fa-rotate-right"];
    npcRepeatBtn.querySelector("i").className = `fa-solid ${icons[state.repeatMode]}`;
    npcRepeatBtn.classList.toggle("active", state.repeatMode > 0);
    showToast(msgs[state.repeatMode]);
  });

  /* ── Like ─── */
  npcLikeBtn?.addEventListener("click", () => {
    const song = state.songs[state.currentIndex];
    if (!song) return;
    state.isLiked[song._id] = !state.isLiked[song._id];
    updateNowPlayingCard();
    /* Mirror to player bar like btn */
    const liked = state.isLiked[song._id];
    playerLikeBtn.querySelector("i").className = `fa-${liked ? "solid" : "regular"} fa-heart`;
    playerLikeBtn.classList.toggle("liked", !!liked);
    showToast(liked ? "Added to Liked Songs" : "Removed from Liked Songs");
  });

  /* ── Progress seeking ─── */
  let npcDragging = false;
  const npcSeekTo = (e) => {
    const rect = npcProgressCont.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = ratio * audio.duration;
  };
  npcProgressCont?.addEventListener("mousedown", (e) => { npcDragging = true; npcSeekTo(e); });
  document.addEventListener("mousemove", (e) => { if (npcDragging) npcSeekTo(e); });
  document.addEventListener("mouseup",   () => { npcDragging = false; });
  /* Touch */
  npcProgressCont?.addEventListener("touchstart", (e) => { npcDragging = true; npcSeekTo(e.touches[0]); }, { passive: true });
  document.addEventListener("touchmove",  (e) => { if (npcDragging) npcSeekTo(e.touches[0]); }, { passive: true });
  document.addEventListener("touchend",   () => { npcDragging = false; });

  /* ── Volume ─── */
  let npcVolDragging = false;
  const npcSetVol = (e) => {
    const rect = npcVolumeCont.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(ratio);
    npcVolumeFill.style.width  = (ratio * 100) + "%";
    npcVolumeThumb.style.left  = (ratio * 100) + "%";
  };
  npcVolumeCont?.addEventListener("mousedown", (e) => { npcVolDragging = true; npcSetVol(e); });
  document.addEventListener("mousemove", (e) => { if (npcVolDragging) npcSetVol(e); });
  document.addEventListener("mouseup",   () => { npcVolDragging = false; });

  npcVolumeMuteBtn?.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    audio.muted = state.isMuted;
    const icon = npcVolumeIcon;
    if (icon) icon.className = state.isMuted ? "fa-solid fa-volume-xmark"
      : state.volume > 0.5 ? "fa-solid fa-volume-high" : "fa-solid fa-volume-low";
    updateVolumeIcon();
  });

  /* ── Sync NPC progress with audio timeupdate ─── */
  audio.addEventListener("timeupdate", () => {
    if (!audio.duration || npcCard.style.display === "none") return;
    const pct = (audio.currentTime / audio.duration) * 100;
    if (npcProgressFill)  npcProgressFill.style.width  = pct + "%";
    if (npcProgressThumb) npcProgressThumb.style.left  = pct + "%";
    if (npcCurrentTime)   npcCurrentTime.textContent   = formatDuration(audio.currentTime);
  });

  audio.addEventListener("loadedmetadata", () => {
    if (npcTotalTime) npcTotalTime.textContent = formatDuration(audio.duration);
  });

  /* ── Sync play/pause icon & vinyl ─── */
  audio.addEventListener("play", () => {
    if (npcPlayIcon) npcPlayIcon.className = "fa-solid fa-pause";
    if (npcArtwork) { npcArtwork.classList.add("spinning"); npcArtwork.classList.remove("paused-spin"); }
  });
  audio.addEventListener("pause", () => {
    if (npcPlayIcon) npcPlayIcon.className = "fa-solid fa-play";
    if (npcArtwork) npcArtwork.classList.add("paused-spin");
  });
  audio.addEventListener("ended", () => { updateNowPlayingCard(); });
}
