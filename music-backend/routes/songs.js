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
   GET ALL SONGS
   GET /songs
========================= */

router.get("/", authenticateToken, async (req, res) => {
    try {
        const songs = await Song.find();
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
        const song = await Song.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

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
        await Song.findByIdAndDelete(req.params.id);
        res.json({ message: "Song deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   SEARCH SONG
   GET /songs/search/:name
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
    UPLOAD SONG
    POST /songs/upload
========================= */
router.post("/upload", upload.single("song"), async (req, res) => {

    try {

        const filePath = req.file.path;

        const metadata = await getMetadata(filePath);

        const song = new Song({

            title: metadata.title || req.file.originalname,
            artist: metadata.artist || "Unknown",
            album: metadata.album || "Unknown",
            duration: metadata.duration,
            file: req.file.filename

        });

        await song.save();

        res.json({
            message: "Song uploaded successfully",
            song
        });

    } catch (error) {

        res.status(500).json({ error: error.message });

    }

});


/* =========================
    STREAM SONG
    GET /songs/stream/:id
========================= */
router.get("/stream/:id", async (req, res) => {

    try {

        const song = await Song.findById(req.params.id);

        const filePath = path.join(__dirname, "../uploads", song.file);

        res.setHeader("Content-Type", "audio/mpeg");

        const stream = fs.createReadStream(filePath);

        stream.pipe(res);

    } catch (error) {

        res.status(500).json({ error: error.message });

    }

});

module.exports = router;