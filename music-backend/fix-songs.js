/**
 * fix-songs.js — Cleans up the songs database:
 *  1. Removes exact duplicates (same file path)
 *  2. Fixes file paths that are missing the /uploads/ prefix
 *  3. Fixes "Unknown Artist" / "Unknown" artist names by re-parsing filenames
 *  4. Removes broken/tiny files
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");

const Song = require("./models/Song");

const UPLOADS_DIR = path.join(__dirname, "uploads");

/* ─── Re-parse title/artist from filename ───────────────────── */
function parseFilename(filename) {
  // Strip timestamp prefix like "1773411702916-"
  let name = filename
    .replace(/\.mp3$/i, "")
    .replace(/^\d{10,}-/, "")
    .replace(/_/g, " ");

  const dashParts = name.split(" - ");
  if (dashParts.length >= 2) {
    return {
      artist: dashParts[0].trim(),
      title:  dashParts.slice(1).join(" - ").trim()
    };
  }
  return { artist: "Unknown Artist", title: name.trim() };
}

/* ─── Fix known album-track filenames ───────────────────────── */
const KNOWN_FIXES = {
  "Immortal CD 1 TRACK 13":  { artist: "Michael Jackson", title: "Hollywood Tonight (Immortal)" },
  "Immortal CD 1 TRACK 15":  { artist: "Michael Jackson", title: "Dangerous (Immortal)" },
  "Immortal CD 1 TRACK 16":  { artist: "Michael Jackson", title: "Smooth Criminal (Immortal)" },
  "Immortal CD 1 TRACK 17":  { artist: "Michael Jackson", title: "Earth Song (Immortal)" },
  "Immortal CD 1 TRACK 26":  { artist: "Michael Jackson", title: "Man In The Mirror (Immortal)" },
  "Immortal CD 1 TRACK 4":   { artist: "Michael Jackson", title: "Wanna Be Startin' Somethin' (Immortal)" },
  "Levitating CD 1 TRACK 1": { artist: "Dua Lipa",        title: "Levitating" },
  "Making Mirrors CD 1 TRACK 3": { artist: "Gotye",       title: "Somebody That I Used to Know" },
  "Starboy CD 1 TRACK 17":   { artist: "The Weeknd",      title: "A Lonely Night" },
  "Yeh Jawaani Hai Deewani CD 1 TRACK 4": { artist: "Pritam", title: "Badtameez Dil" },
  "Teen Wolf (Original Television Soundtrack) CD 1 TRACK 10": { artist: "Various", title: "Teen Wolf Theme" },
  "Michael Jackson s This Is It CD 1 TRACK 6": { artist: "Michael Jackson", title: "I Just Can't Stop Loving You (This Is It)" },
  "BLOOD ON THE DANCE FLOOR HIStory In The Mix CD 1 TRACK 4": { artist: "Michael Jackson", title: "Blood On The Dance Floor" },
  "Tum Hi Ho":               { artist: "Arijit Singh",    title: "Tum Hi Ho" },
  "ishq":                    { artist: "Various",          title: "Ishq" },
  "au uu SzH34yR2":          { artist: "Unknown",          title: "Unknown Track" },
  "Cry For Me mixed":        { artist: "Twice",            title: "Cry For Me" },
  "Scared To Live mixed":    { artist: "The Weeknd",       title: "Scared To Live (Mixed)" },
};

function getFixedMeta(filename) {
  const base = filename.replace(/\.mp3$/i, "").replace(/^\d{10,}-/, "").replace(/_/g, " ").trim();
  for (const [key, fix] of Object.entries(KNOWN_FIXES)) {
    if (base.toLowerCase().includes(key.toLowerCase())) return fix;
  }
  return null;
}

async function fixSongs() {
  console.log("\n🔧  Musicify Song Fixer");
  console.log("=======================\n");

  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB");
  console.log("✅  MongoDB connected\n");

  const all = await Song.find({});
  console.log(`📦  Total songs in DB: ${all.length}`);

  /* ── Step 1: Remove duplicates (group by normalised file) ─── */
  console.log("\n🗑️   Removing duplicates...");
  const fileMap = new Map();

  for (const song of all) {
    // Normalise file path
    let file = song.file || "";
    const basename = path.basename(file);

    if (!fileMap.has(basename)) {
      fileMap.set(basename, song);
    } else {
      // Keep the one with a proper /uploads/ prefix
      const existing = fileMap.get(basename);
      const existingHasPrefix = (existing.file || "").startsWith("/uploads/");
      const thisHasPrefix     = file.startsWith("/uploads/");
      if (thisHasPrefix && !existingHasPrefix) {
        // Delete old, keep this
        await Song.deleteOne({ _id: existing._id });
        fileMap.set(basename, song);
      } else {
        await Song.deleteOne({ _id: song._id });
      }
    }
  }
  console.log(`   Kept ${fileMap.size} unique songs`);

  /* ── Step 2: Fix file paths + metadata ─────────────────────── */
  console.log("\n✏️   Fixing file paths and metadata...");
  let fixed = 0;
  let removed = 0;

  for (const [basename, song] of fileMap) {
    const filePath = path.join(UPLOADS_DIR, basename);

    // Remove records for files that don't exist on disk or are too small
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 10000) {
      await Song.deleteOne({ _id: song._id });
      console.log(`   ✗ Removed (no file): ${basename}`);
      removed++;
      continue;
    }

    const updates = {};

    // Fix file path
    const correctPath = `/uploads/${basename}`;
    if (song.file !== correctPath) {
      updates.file = correctPath;
    }

    // Fix artist/title from filename
    const fix = getFixedMeta(basename);
    if (fix) {
      if (song.artist !== fix.artist) updates.artist = fix.artist;
      if (song.title  !== fix.title)  updates.title  = fix.title;
    } else {
      // Re-parse if artist is "Unknown Artist" or "Unknown"
      const isUnknown = !song.artist || song.artist === "Unknown Artist" || song.artist === "Unknown";
      if (isUnknown) {
        const parsed = parseFilename(basename);
        if (parsed.artist !== "Unknown Artist") {
          updates.artist = parsed.artist;
          updates.title  = parsed.title;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await Song.updateOne({ _id: song._id }, { $set: updates });
      fixed++;
    }
  }

  const finalCount = await Song.countDocuments();
  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅  Fixed metadata: ${fixed} songs`);
  console.log(`🗑️   Removed (no file/duplicate): ${removed}`);
  console.log(`🎵  Final song count: ${finalCount}`);

  await mongoose.disconnect();
  process.exit(0);
}

fixSongs().catch(err => { console.error(err); process.exit(1); });
