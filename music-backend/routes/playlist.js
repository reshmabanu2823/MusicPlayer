const express = require("express");
const router = express.Router();

const Playlist = require("../models/Playlist");
const authenticateToken = require("../middleware/auth");


/* =========================
   CREATE PLAYLIST
   POST /playlist
========================= */

router.post("/", authenticateToken, async (req, res) => {
    try {
        const playlist = new Playlist(req.body);
        await playlist.save();
        res.json(playlist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   GET ALL PLAYLISTS
   GET /playlist
========================= */

router.get("/", authenticateToken, async (req, res) => {
    try {
        const playlists = await Playlist.find().populate("songs");
        res.json(playlists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   ADD SONG TO PLAYLIST
   PUT /playlist/:id
========================= */

router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const playlist = await Playlist.findByIdAndUpdate(
            req.params.id,
            { $push: { songs: req.body.songId } },
            { new: true }
        );

        res.json(playlist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   DELETE PLAYLIST
   DELETE /playlist/:id
========================= */

router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        await Playlist.findByIdAndDelete(req.params.id);
        res.json({ message: "Playlist deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;