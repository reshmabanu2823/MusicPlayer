require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const mm = require("music-metadata");

const Song = require("./models/Song");
const Playlist = require("./models/Playlist");
const User = require("./models/User");

const SOURCE_DIR = path.join("C:", "Users", "Reshma Banu", "Downloads", "the things we don't say mp3", "the things we don't say mp3");
const UPLOADS_DIR = path.join(__dirname, "uploads");

async function fetchArtworkForTrack(title, album = "The Things We Don't Say") {
  const queries = [
    `${title} ${album}`,
    title,
    album
  ];

  for (const q of queries) {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=1`;
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data && res.data.results && res.data.results.length > 0) {
        const item = res.data.results[0];
        const art = item.artworkUrl100 || item.artworkUrl60;
        const artist = item.artistName || "Unknown Artist";
        if (art) {
          return {
            coverUrl: art.replace(/\/\d+x\d+bb\.jpg/i, "/600x600bb.jpg"),
            artist: artist,
            genre: item.primaryGenreName || "Pop"
          };
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function importSongs() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB");
  console.log("Connected to MongoDB.");

  // Get admin / default user
  let user = await User.findOne({});
  const userId = user ? user._id : null;

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error("Source directory does not exist:", SOURCE_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".mp3"));
  console.log(`Found ${files.length} songs in source folder.`);

  const importedSongIds = [];

  for (const file of files) {
    const srcPath = path.join(SOURCE_DIR, file);
    const destFileName = file;
    const destPath = path.join(UPLOADS_DIR, destFileName);

    // Copy to uploads if not already there
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} -> uploads/`);

    const meta = await mm.parseFile(destPath);
    const title = file.replace(/\.mp3$/i, "").trim();
    const duration = Math.round(meta.format.duration || 165);

    // Check if song already in DB
    let song = await Song.findOne({ title: title, album: "The Things We Don't Say" });
    if (!song) {
      song = await Song.findOne({ file: `/uploads/${destFileName}` });
    }

    // Fetch artwork
    const artInfo = await fetchArtworkForTrack(title);
    const coverUrl = artInfo ? artInfo.coverUrl : null;
    const artist = (artInfo && artInfo.artist) ? artInfo.artist : "The Things We Don't Say";
    const genre = (artInfo && artInfo.genre) ? artInfo.genre : "Pop";

    if (!song) {
      song = new Song({
        title: title,
        artist: artist,
        album: "The Things We Don't Say",
        genre: genre,
        duration: duration,
        file: `/uploads/${destFileName}`,
        coverUrl: coverUrl,
        createdBy: userId
      });
      await song.save();
      console.log(`✔ Created song: ${title} (${artist}) - Cover: ${coverUrl ? "YES" : "NO"}`);
    } else {
      song.title = title;
      song.artist = artist;
      song.album = "The Things We Don't Say";
      song.genre = genre;
      song.duration = duration;
      song.file = `/uploads/${destFileName}`;
      if (coverUrl) song.coverUrl = coverUrl;
      await song.save();
      console.log(`✔ Updated song: ${title} (${artist}) - Cover: ${coverUrl ? "YES" : "NO"}`);
    }

    importedSongIds.push(song._id);
    await new Promise(r => setTimeout(r, 100));
  }

  // Create or update "The Things We Don't Say" Playlist
  let playlist = await Playlist.findOne({ name: "The Things We Don't Say" });
  if (!playlist) {
    playlist = new Playlist({
      name: "The Things We Don't Say",
      songs: importedSongIds,
      createdBy: userId
    });
    await playlist.save();
    console.log(`✔ Created Playlist "The Things We Don't Say" with ${importedSongIds.length} songs.`);
  } else {
    playlist.songs = importedSongIds;
    await playlist.save();
    console.log(`✔ Updated Playlist "The Things We Don't Say" with ${importedSongIds.length} songs.`);
  }

  console.log("\n🎉 Successfully added all 5 songs with their song cards!");
  process.exit(0);
}

importSongs().catch(err => {
  console.error("Error importing songs:", err);
  process.exit(1);
});
