require("dotenv").config();

const express = require("express");
const cors = require("cors");
const musicLibraryRoutes = require("./routes/musicLibrary");
const spotifyRoutes = require("./routes/spotify");

require("./config/db");

const songRoutes = require("./routes/songs");
const playlistRoutes = require("./routes/playlist");
const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/library", musicLibraryRoutes);
app.use("/spotify", spotifyRoutes);

app.use("/songs", songRoutes);
app.use("/playlist", playlistRoutes);
app.use("/auth", authRoutes);


app.listen(3000, () => {
    console.log("Server running on port 3000");
});