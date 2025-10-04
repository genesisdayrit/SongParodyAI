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

const SUNO_API_BASE = "https://api.sunoapi.org";
const SUNO_API_KEY = process.env.SUNO_API_KEY;

const BASE_URL = process.env.BASE_URL;

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
      // replace <br> tags with newlines before extracting text
      $(elem).find('br').replaceWith('\n');
      const text = $(elem).text();
      lyrics += text + "\n";
    });

    // find the first '[' and start from there (lyrics structure markers)
    const firstBracket = lyrics.indexOf('[');
    if (firstBracket !== -1) {
      lyrics = lyrics.substring(firstBracket);
    }

    // improve readability: add line breaks before section markers
    lyrics = lyrics.replace(/\[([^\]]+)\]/g, '\n[$1]\n');
    
    // clean up excessive newlines (more than 2 in a row)
    lyrics = lyrics.replace(/\n{3,}/g, '\n\n');

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
  
  ONLY INCLUDE THE CREATED SONG LYRICS. DO NOT ADD ADDITIONAL COMMENTARY.
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

// generate music with suno api
app.post('/api/suno/generate', async (req, res) => {
  try {
    if (!SUNO_API_KEY) {
      return res.status(500).json({ error: 'SUNO_API_KEY not configured' });
    }

    const { prompt, customMode, instrumental, model, style, title } = req.body;

    console.log('generating music with suno api:', { 
      hasPrompt: !!prompt, 
      model: model || 'V4_5', 
      customMode: customMode || false 
    });

    const requestBody: any = {
      prompt,
      customMode: customMode || false,
      instrumental: instrumental || false,
      model: model || 'V4_5',
      // always include callback url (required by suno api even though we don't use it)
      callBackUrl: `${BASE_URL || 'http://localhost:3000'}/api/suno/webhook`
    };

    // add optional fields only if provided
    if (style) requestBody.style = style;
    if (title) requestBody.title = title;

    const response = await fetch(`${SUNO_API_BASE}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (data.code !== 200) {
      console.error('suno api error:', data);
      return res.status(400).json({ error: 'failed to generate music', details: data });
    }

    console.log('task created:', data.data.taskId);
    return res.json({
      success: true,
      taskId: data.data.taskId,
      message: 'music generation started'
    });

  } catch (error) {
    console.error('suno api error:', error);
    return res.status(500).json({ 
      error: 'failed to generate music', 
      details: error instanceof Error ? error.message : 'unknown error' 
    });
  }
});

// check status of a suno task (testing - not currently used by frontend)
app.get('/api/suno/status/:taskId', async (req, res) => {
  try {
    if (!SUNO_API_KEY) {
      return res.status(500).json({ error: 'SUNO_API_KEY not configured' });
    }

    const { taskId } = req.params;

    console.log('checking status for task:', taskId);

    const response = await fetch(`${SUNO_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`
      }
    });

    const result = await response.json();

    if (result.code !== 200) {
      return res.status(400).json({ error: 'failed to get task status', details: result });
    }

    const status = result.data.status;
    console.log(`task ${taskId} status:`, status);

    return res.json({
      taskId: result.data.taskId,
      status: status,
      ...(status === 'SUCCESS' && result.data.response && {
        tracks: result.data.response.data.map((track: any) => ({
          id: track.id,
          title: track.title,
          audioUrl: track.audio_url,
          duration: track.duration,
          tags: track.tags
        }))
      }),
      ...(status === 'FAILED' && {
        error: result.data.errorMessage
      })
    });

  } catch (error) {
    console.error('suno api error:', error);
    return res.status(500).json({ 
      error: 'failed to check task status', 
      details: error instanceof Error ? error.message : 'unknown error' 
    });
  }
});

if (process.env.NODE_ENV !== 'production') {
  ViteExpress.listen(app, 3000, () => {
    console.log("Server is listening on http://localhost:3000...");
  });
}

export default app;
