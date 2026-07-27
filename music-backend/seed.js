/**
 * seed.js — Seeds all MP3 files from the uploads/ folder into MongoDB
 * 
 * Usage:  node seed.js
 * 
 * This script:
 *  1. Creates a default "musicify" admin user if it doesn't exist
 *  2. Scans the uploads/ folder for all .mp3 files
 *  3. Parses title/artist from the filename
 *  4. Inserts each song into MongoDB (skips duplicates)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const path     = require("path");
const fs       = require("fs");

const User = require("./models/User");
const Song = require("./models/Song");

const UPLOADS_DIR = path.join(__dirname, "uploads");

/* ─── Default user credentials ──────────────────────────────── */
const DEFAULT_USER = {
  name:     "Musicify",
  email:    "musicify@app.com",
  password: "musicify123"
};

/* ─── Parse title & artist from filename ────────────────────── */
function parseFilename(filename) {
  // Remove extension and timestamp prefix (e.g. "1773411702916-")
  let name = filename.replace(/\.mp3$/i, "").replace(/^\d{10,}-/, "");

  // Handle underscores-as-spaces style
  name = name.replace(/_/g, " ");

  // Try "Artist - Title" pattern
  const dashParts = name.split(" - ");
  if (dashParts.length >= 2) {
    const artist = dashParts[0].trim();
    const title  = dashParts.slice(1).join(" - ").trim();
    return { title, artist };
  }

  // Fallback: whole filename is the title
  return { title: name.trim(), artist: "Unknown Artist" };
}

async function seed() {
  console.log("\n🌱  Musicify Song Seeder");
  console.log("========================\n");

  /* Connect to MongoDB */
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/musicDB");
    console.log("✅  MongoDB connected\n");
  } catch (err) {
    console.error("❌  MongoDB connection failed:", err.message);
    console.error("    Make sure MongoDB is running (mongod)\n");
    process.exit(1);
  }

  /* Create default user if not exists */
  let user = await User.findOne({ email: DEFAULT_USER.email });
  if (!user) {
    const hashed = await bcrypt.hash(DEFAULT_USER.password, 10);
    user = await User.create({
      name:     DEFAULT_USER.name,
      email:    DEFAULT_USER.email,
      password: hashed
    });
    console.log(`👤  Created default user: ${DEFAULT_USER.email} / ${DEFAULT_USER.password}`);
  } else {
    console.log(`👤  Default user already exists: ${DEFAULT_USER.email}`);
  }

  /* Read all .mp3 files from uploads/ */
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error("❌  uploads/ folder not found at:", UPLOADS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter(f =>
    f.toLowerCase().endsWith(".mp3") &&
    fs.statSync(path.join(UPLOADS_DIR, f)).size > 10000  // skip tiny/corrupt files
  );

  console.log(`🎵  Found ${files.length} MP3 files in uploads/\n`);

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const file of files) {
    try {
      const filePath  = `/uploads/${file}`;
      const { title, artist } = parseFilename(file);

      // Skip if already in DB (by file path)
      const exists = await Song.findOne({ file: filePath });
      if (exists) {
        skipped++;
        continue;
      }

      await Song.create({
        title,
        artist,
        album:     "",
        duration:  "",
        file:      filePath,
        createdBy: user._id
      });

      console.log(`   ✔  ${artist} — ${title}`);
      inserted++;
    } catch (err) {
      console.error(`   ✘  Error with "${file}": ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅  Inserted:  ${inserted} songs`);
  console.log(`⏭️   Skipped:   ${skipped} (already in DB)`);
  if (errors) console.log(`❌  Errors:    ${errors}`);
  console.log(`\n🔑  Login with:`);
  console.log(`    Email:    ${DEFAULT_USER.email}`);
  console.log(`    Password: ${DEFAULT_USER.password}`);
  console.log(`\n🌐  Open http://localhost:3000 to use the app\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
