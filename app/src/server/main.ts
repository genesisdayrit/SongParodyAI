import express from "express";
import ViteExpress from "vite-express";
import axios from "axios";
import * as cheerio from "cheerio";
import 'dotenv/config';

const app = express();

const GENIUS_API_TOKEN = process.env.GENIUS_CLIENT_ACCESS_TOKEN

app.get("/hello", (_, res) => {
  res.send("Hello Vite + React + TypeScript!");
});

app.get("/genius-lyrics", async (req, res) => {
  const { song, artist } = req.query;
  if (!song) {
    return res.status(400).json({ error: "Missing 'song' query parameter" });
  }

  try {
    const query = artist ? `${song} ${artist}` : song;

    // search for get the genius.com url
    const response = await axios.get("https://api.genius.com/search", {
      headers: { Authorization: `Bearer ${GENIUS_API_TOKEN}` },
      params: { q: query }
    });

    const hits = response.data.response.hits;
    if (hits.length === 0) {
      return res.status(404).json({ error: "No lyrics found." });
    }

    const songUrl = hits[0].result.url;

    // scrape lyrics from Genius page
    const page = await axios.get(songUrl);
    const $ = cheerio.load(page.data);

    let lyrics = "";
    $("[data-lyrics-container=true]").each((i, elem) => {
      lyrics += $(elem).text() + "\n";
    });

    return res.json({
      title: hits[0].result.full_title,
      url: songUrl,
      lyrics: lyrics.trim()
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

// --- Start Vite + Express ---
ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000...")
);
