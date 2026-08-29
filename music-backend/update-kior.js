require("dotenv").config();
const mongoose = require("mongoose");
const Song = require("./models/Song");
const Playlist = require("./models/Playlist");

const KIOR_ARTWORKS = {
  "Home Again": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a7/40/5a/a7405acf-d2d0-9465-3813-aeb13f33aa01/cover_4068992559346.jpg/600x600bb.jpg",
  "On Read": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/95/83/3a/95833aa5-95ff-502e-3ece-8c776871e952/7300345638412.jpg/600x600bb.jpg",
  "One Call Away": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/6f/05/23/6f052310-de81-68d5-1eff-e62cfa47e082/cover_4068992323992.jpg/600x600bb.jpg",
  "Take Me Back": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/50/3b/fd/503bfda5-1d94-bbf9-a8f6-d3d6d1bf82ca/859708796834_cover.jpg/600x600bb.jpg",
  "Those Nights": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/97/25/ec/9725ec21-171c-14d8-92bd-7c68138e9d55/artwork.jpg/600x600bb.jpg"
};

async function updateKiorSongs() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB");
  console.log("Connected to MongoDB.");

  const titles = ["Home Again", "On Read", "One Call Away", "Take Me Back", "Those Nights"];
  const updatedIds = [];

  for (const title of titles) {
    let song = await Song.findOne({ title: title, album: "The Things We Don't Say" });
    if (!song) {
      song = await Song.findOne({ file: new RegExp(title, "i") });
    }

    if (song) {
      song.artist = "Kior";
      song.album = "The Things We Don't Say";
      song.genre = "Pop";
      song.coverUrl = KIOR_ARTWORKS[title] || song.coverUrl;
      await song.save();
      updatedIds.push(song._id);
      console.log(`✔ Updated: ${song.title} -> Artist: ${song.artist}, Cover: ${song.coverUrl}`);
    } else {
      console.log(`✖ Could not find song record for: ${title}`);
    }
  }

  // Update Playlist
  let playlist = await Playlist.findOne({ name: "The Things We Don't Say" });
  if (playlist) {
    playlist.songs = updatedIds;
    await playlist.save();
    console.log("✔ Playlist 'The Things We Don't Say' updated with Kior's songs.");
  }

  console.log("\n🎉 Done updating Kior artist details and song cards!");
  process.exit(0);
}

updateKiorSongs().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
