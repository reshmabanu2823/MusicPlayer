const express = require("express");
const router = express.Router();
const axios = require("axios");

const CLIENT_ID = process.env.JAMENDO_CLIENT_ID;

/* =========================
   GET POPULAR SONGS
========================= */

router.get("/songs", async (req, res) => {

  try {

    const response = await axios.get(
      `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=100`
    );

    res.json(response.data.results);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});


/* =========================
   SEARCH SONGS
========================= */

router.get("/search", async (req, res) => {

  try {

    const query = req.query.q;

    const response = await axios.get(
      `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=20&search=${query}`
    );

    res.json(response.data.results);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});

module.exports = router;