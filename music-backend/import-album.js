const path = require("path");
const fs = require("fs");
const mm = require("music-metadata");

async function check() {
  const dir = path.join("C:", "Users", "Reshma Banu", "Downloads", "the things we don't say mp3", "the things we don't say mp3");
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith(".mp3")) {
      const fullPath = path.join(dir, f);
      const meta = await mm.parseFile(fullPath);
      console.log("File:", f);
      console.log("Common:", JSON.stringify(meta.common, null, 2));
      console.log("Duration:", meta.format.duration);
      console.log("Has Picture:", !!(meta.common.picture && meta.common.picture.length));
      console.log("-----------------------------------------");
    }
  }
}

check().catch(console.error);
