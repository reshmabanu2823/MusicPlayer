const axios = require("axios");

async function fetchArtwork(artist, title) {
  try {
    let cleanTitle = (title || "")
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
      const res = await axios.get(url, { timeout: 4000 });
      if (res.data && res.data.results && res.data.results.length > 0) {
        const item = res.data.results[0];
        const art = item.artworkUrl100 || item.artworkUrl60 || item.artworkUrl30;
        if (art) {
          return art.replace(/\/\d+x\d+bb\.jpg/i, "/600x600bb.jpg");
        }
      }
    }
  } catch (err) {
    // Graceful fallback
  }
  return null;
}

module.exports = fetchArtwork;
