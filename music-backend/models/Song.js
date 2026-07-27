const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
    title: String,
    artist: String,
    album: String,
    genre: {
        type: String,
        default: "Pop"
    },
    duration: Number,
    file: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
});

module.exports = mongoose.model("Song", songSchema);