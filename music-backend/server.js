require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

/* ─── Import routes ─────────────────────────────────────────── */
const songRoutes         = require("./routes/songs");
const playlistRoutes     = require("./routes/playlist");
const authRoutes         = require("./routes/auth");
const musicLibraryRoutes = require("./routes/musicLibrary");
const spotifyRoutes      = require("./routes/spotify");
const similarRoutes      = require("./routes/similar");  // audio similarity

/* ─── Connect to MongoDB ─────────────────────────────────────── */
require("./config/db");

/* ─── App setup ─────────────────────────────────────────────── */
const app = express();

/* ─── CORS — allow all origins in dev (file:// or localhost) ─── */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

/* ─── Body parsers ───────────────────────────────────────────── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ─── Serve uploaded audio files ─────────────────────────────── */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ─── Serve frontend as static files ─────────────────────────── */
// Visit http://localhost:3000 to open the app directly
app.use(express.static(path.join(__dirname, "../frontend")));

/* ─── API Routes ─────────────────────────────────────────────── */
app.use("/auth",     authRoutes);
app.use("/songs",    songRoutes);
app.use("/playlist", playlistRoutes);
app.use("/library",  musicLibraryRoutes);
app.use("/spotify",  spotifyRoutes);
app.use("/api/songs", similarRoutes);   // GET /api/songs/:id/similar

/* ─── Health check ───────────────────────────────────────────── */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Musicify backend is running ✓" });
});

/* ─── Global error handler ───────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error", details: err.message });
});

/* ─── Start server ───────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  Musicify backend running on  http://localhost:${PORT}`);
  console.log(`🎵  Frontend available at        http://localhost:${PORT}`);
  console.log(`❤️   Health check                http://localhost:${PORT}/api/health\n`);
});