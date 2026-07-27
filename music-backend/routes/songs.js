const express = require("express");
const router = express.Router();

const Song = require("../models/Song");
const upload = require("../middleware/upload");
const getMetadata = require("../utils/metadata");
const authenticateToken = require("../middleware/auth");

const fs = require("fs");
const path = require("path");


/* =========================
   CREATE SONG
   POST /songs
========================= */

router.post("/", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        const { title, artist, album, duration } = req.body;

        if (!title || !artist) {
            return res.status(400).json({ error: "Title and artist are required" });
        }

        let file = "";
        if (req.file) {
            file = `/uploads/${req.file.filename}`;
        }

        const song = new Song({
            title,
            artist,
            album,
            duration,
            file,
            createdBy: req.user.id
        });

        await song.save();
        res.json(song);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   SEARCH SONG
   GET /songs/search/:name
   NOTE: This MUST be declared before /:id to avoid route conflict
========================= */

router.get("/search/:name", authenticateToken, async (req, res) => {
    try {
        const songs = await Song.find({
            title: { $regex: req.params.name, $options: "i" }
        });
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   STREAM SONG
   GET /songs/stream/:id
   NOTE: This must also be before /:id
========================= */

router.get("/stream/:id", authenticateToken, async (req, res) => {
    try {
        const song = await Song.findById(req.params.id);

        if (!song) {
            return res.status(404).json({ error: "Song not found" });
        }

        const filePath = path.join(__dirname, "../uploads", path.basename(song.file));

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Audio file not found on disk" });
        }

        const stat = fs.statSync(filePath);
        const range = req.headers.range;

        if (range) {
            // Support range requests for seeking
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": "audio/mpeg",
            });

            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                "Content-Length": stat.size,
                "Content-Type": "audio/mpeg",
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   UPLOAD SONG (legacy)
   POST /songs/upload
========================= */

router.post("/upload", authenticateToken, upload.single("song"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const metadata = await getMetadata(filePath);

        const song = new Song({
            title: metadata.title || req.file.originalname,
            artist: metadata.artist || "Unknown",
            album: metadata.album || "Unknown",
            duration: metadata.duration,
            file: `/uploads/${req.file.filename}`,
            createdBy: req.user.id
        });

        await song.save();
        res.json({ message: "Song uploaded successfully", song });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   GET ALL SONGS
   GET /songs
========================= */

router.get("/", authenticateToken, async (req, res) => {
    try {
        // Return all songs — user's own uploads first, then the rest
        const songs = await Song.find().sort({ createdAt: -1 });
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   GET SONG BY ID
   GET /songs/:id
========================= */

router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const song = await Song.findById(req.params.id);
        if (!song) return res.status(404).json({ error: "Song not found" });
        res.json(song);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   UPDATE SONG
   PUT /songs/:id
========================= */

router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const song = await Song.findOneAndUpdate(
            { _id: req.params.id, createdBy: req.user.id },
            req.body,
            { new: true }
        );
        if (!song) return res.status(404).json({ error: "Song not found or not authorized" });
        res.json(song);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   DELETE SONG
   DELETE /songs/:id
========================= */

router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const song = await Song.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
        if (!song) return res.status(404).json({ error: "Song not found or not authorized" });

        // Also remove the file from disk
        if (song.file) {
            const filePath = path.join(__dirname, "..", song.file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        res.json({ message: "Song deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;