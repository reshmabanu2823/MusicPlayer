require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Song = require("./models/Song");

async function fetchArtwork(artist, title) {
  try {
    let cleanTitle = title
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/feat\..*/i, "")
      .replace(/ft\..*/i, "")
      .replace(/mixed/i, "")
      .replace(/remaster(ed)?/i, "")
      .replace(/\b(original|sped up version)\b/i, "")
      .trim();

    let cleanArtist = (artist || "")
      .replace(/\(.*?\)/g, "")
      .replace(/feat\..*/i, "")
      .replace(/ft\..*/i, "")
      .trim();

    if (cleanArtist === "Unknown Artist" || cleanArtist === "Various" || cleanArtist === "Unknown") {
      cleanArtist = "";
    }

    const queries = [
      `${cleanArtist} ${cleanTitle}`.trim(),
      cleanTitle,
      `${cleanArtist} ${cleanTitle.split(" ")[0]}`.trim()
    ].filter(Boolean);

    for (const q of queries) {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=1`;
      const res = await axios.get(url, { timeout: 6000 });
      if (res.data && res.data.results && res.data.results.length > 0) {
        const item = res.data.results[0];
        const art = item.artworkUrl100 || item.artworkUrl60 || item.artworkUrl30;
        if (art) {
          return art.replace(/\/\d+x\d+bb\.jpg/i, "/600x600bb.jpg");
        }
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

async function enrichCovers() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB");
  console.log("Connected to MongoDB.");
  
  const songs = await Song.find({});
  console.log(`Found ${songs.length} songs. Fetching artwork...`);
  
  let updatedCount = 0;
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (song.coverUrl) {
      continue; // already has artwork
    }
    const art = await fetchArtwork(song.artist, song.title);
    if (art) {
      song.coverUrl = art;
      await song.save();
      updatedCount++;
      console.log(`[${i+1}/${songs.length}] ✔ ${song.artist} - ${song.title}`);
    } else {
      console.log(`[${i+1}/${songs.length}] ✖ (No art found) ${song.artist} - ${song.title}`);
    }
    await new Promise(r => setTimeout(r, 70));
  }
  
  console.log(`\n🎉 Done! Added artwork to ${updatedCount} more songs.`);
  process.exit(0);
}

enrichCovers().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
