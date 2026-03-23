const express = require("express");
const router = express.Router();
const axios = require("axios");

let accessToken = "";

async function getSpotifyToken() {

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
    }
  );

  accessToken = response.data.access_token;
}

router.get("/search", async (req, res) => {

  try {

    if (!accessToken) {
      await getSpotifyToken();
    }

    const query = req.query.q;

    let response;

    try {

      response = await axios.get(
        `https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

    } catch (err) {

      // If token expired → get new token
      if (err.response && err.response.status === 401) {

        await getSpotifyToken();

        response = await axios.get(
          `https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

      } else {
        throw err;
      }

    }

    const songs = response.data.tracks.items.map(track => ({
      title: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      cover: track.album.images[0].url,
      preview: track.preview_url
    }));

    res.json(songs);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

module.exports = router;