import express from "express";
import ViteExpress from "vite-express";
import axios from "axios";
import * as cheerio from "cheerio";
import 'dotenv/config';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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


app.post('/api/ai-parody-generation', async (req, res) => {
  const { songTitle, artist, lyrics, parodyTopic } = req.body; 

  console.log('Request received:', { songTitle, artist, lyricsLength: lyrics?.length, parodyTopic })
  
  if (!lyrics || !parodyTopic) {
      return res.status(400).json({error: 'Lyrics or Parody Topic not available'})
  } 
  
  const systemPrompt = `
  You are a hilarious parody song writer. I want to make a parody of the song: ${songTitle} by ${artist}
  
  The lyrics for the song are within this text: "${lyrics}"

  I want to create a parody for the topic on ${parodyTopic}

  Please rewrite the lyrics based on the parody topic, 
  try your best to match the syllable cadence and rhytmic structure for the lyrics. 
  `

  try {
      console.log('Calling OpenAI API...')
      const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: systemPrompt }],
          max_tokens: 1000
      })

      const generatedParodyResponse = completion.choices[0].message.content;
      console.log('AI Response received, length:', generatedParodyResponse?.length)

      res.status(200).json({ok: true, generatedParody: generatedParodyResponse})

  } catch (error) {
      console.error('OpenAI Error:', error)
      res.status(500).json({ error: 'Failed to get OpenAI response', details: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// Only run ViteExpress in local development
if (process.env.NODE_ENV !== 'production') {
  ViteExpress.listen(app, 3000, () => {
    console.log("Server is listening on http://localhost:3000...");
  });
}

export default app;