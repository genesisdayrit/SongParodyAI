import express from "express";
import ViteExpress from "vite-express";
import axios from "axios";
import * as cheerio from "cheerio";
import 'dotenv/config';

const app = express();

const GENIUS_API_TOKEN = process.env.GENIUS_CLIENT_ACCESS_TOKEN

const YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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

app.get("/yt-search", async (req, res) => {
  try {
    let {
      q = "",
      type = "video",
      // ignore any client maxresults; force 1
      // maxresults = "1",
      pageToken = "",
      channelId = "",
      order = "relevance",
      safeSearch = "moderate"
    } = req.query;

    if (!q) return res.status(400).json({ error: "Missing required query param: q" });
    if (!YOUTUBE_API_KEY) return res.status(500).json({ error: "Server missing YOUTUBE_API_KEY" });

    // force instrumental bias + single result
    const params = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: "snippet",
      q: `${String(q)} instrumental`,  // append instrumental to the search text
      type: String(type),
      maxResults: "1",
      order: String(order),
      safeSearch: String(safeSearch),
    });
    if (pageToken) params.set("pageToken", String(pageToken));
    if (channelId) params.set("channelId", String(channelId));

    const resp = await fetch(`${YT_SEARCH_URL}?${params.toString()}`);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: "YouTube API error", detail: text });
    }
    const data = await resp.json();
    // normalize to top 1 (just in case)
    data.items = Array.isArray(data.items) ? data.items.slice(0, 1) : [];
    delete data.nextPageToken;
    delete data.prevPageToken;

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});



// --- start vite + express ---
ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000...")
);
