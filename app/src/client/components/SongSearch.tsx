import { useState } from "react";

type LyricsResponse = {
  title: string;
  url: string;
  lyrics: string;
};

type YTThumbnail = { url: string; width: number; height: number };
type YTSnippet = {
  publishedAt: string;
  channelId: string;
  title: string;
  description: string;
  thumbnails: { default?: YTThumbnail; medium?: YTThumbnail; high?: YTThumbnail };
  channelTitle: string;
  liveBroadcastContent: "upcoming" | "live" | "none";
};

type YTId = { kind: string; videoId?: string; channelId?: string; playlistId?: string };

type YTItem = {
  kind: "youtube#searchResult";
  etag: string;
  id: YTId;
  snippet: YTSnippet;
};

type YTResponse = {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  regionCode?: string;
  pageInfo?: { totalResults: number; resultsPerPage: number };
  items: YTItem[];
};

export default function SongSearch() {
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");

  const [lyricsError, setLyricsError] = useState<string | null>(null);

  const [ytItems, setYtItems] = useState<YTItem[]>([]);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytNextPage, setYtNextPage] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [ytLoading, setYtLoading] = useState(false);
  const [parodyTopic, setParodyTopic ] = useState<string | undefined>('')
  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null)
  const [generatedParody, setGeneratedParody] = useState<string | undefined>('')

  async function fetchLyrics(qSong: string, qArtist: string) {
    setLyricsError(null);
    setLyricsData(null);

    const params = new URLSearchParams({
      song: qSong,
      ...(qArtist ? { artist: qArtist } : {}),
    });

    const res = await fetch(`/genius-lyrics?${params.toString()}`);
    if (!res.ok) {
      const problem = await res.json().catch(() => ({}));
      throw new Error(problem?.error || `Lyrics request failed (${res.status})`);
    }
    const json: LyricsResponse = await res.json();
    setLyricsData(json);
  }

  async function fetchYouTube(qSong: string, qArtist: string) {
    setYtError(null);
    setYtItems([]);
    setYtNextPage(undefined);
    setYtLoading(true);
  
    // append "instrumental" to bias the search
    const q = [qSong, qArtist, "instrumental"].filter(Boolean).join(" ");
  
    const params = new URLSearchParams({
      q,
      type: "video",
      maxResults: "1", // only return top result
      order: "relevance",
      safeSearch: "moderate",
    });
  
    try {
      const res = await fetch(`/yt-search?${params.toString()}`);
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `YouTube request failed (${res.status})`);
      }
      const json: YTResponse = await res.json();
      setYtItems(json.items?.slice(0, 1) ?? []);
      setYtNextPage(undefined);
    } catch (e: any) {
      setYtError(e.message || "Something went wrong fetching YouTube results.");
    } finally {
      setYtLoading(false);
    }
  }
  

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const qSong = song.trim();
    const qArtist = artist.trim();

    if (!qSong) {
      setLyricsError("Please enter a song title.");
      return;
    }

    setLoading(true);
    try {
      await Promise.all([fetchLyrics(qSong, qArtist), fetchYouTube(qSong, qArtist)]);
    } finally {
      setLoading(false);
    }
  }
   
  const generateParodyLyrics = async () => {
    // guard rails
    if (!lyricsData?.lyrics) {
      console.log("No lyrics available yet.");
      return;
    }
    if (!parodyTopic) {
      console.log("No parody topic provided.");
      return;
    }
  
    console.log('Generating parody lyrics...')
    console.log('Data:', { song, artist, lyricsLength: lyricsData.lyrics.length, parodyTopic })
  
    try {
      const response = await fetch('/api/ai-parody-generation', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // prefer the official title from Genius
          songTitle: lyricsData.title || song,
          artist: artist,
          lyrics: lyricsData.lyrics,
          parodyTopic: parodyTopic
        })
      })
  
      const result = await response.json()
      console.log('Response from server:', result)
      
      if (result.ok) {
          console.log('Parody generated successfully, length:', result.generatedParody?.length);
          setGeneratedParody(result.generatedParody)
      } else {
          console.error('Server returned error:', result.error)
      }
    } catch (error) {
      console.error('Fetch error:', error)
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-8 font-sans">
      <h1>Song Search</h1>

      <form onSubmit={handleSearch}>
        <div className="mb-2">
          <label>Song: </label>
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Enter a Song Title"
            className="w-full"
          />
        </div>

        <div className="mb-2">
          <label>Artist (optional): </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Enter an artist"
            className="w-full"
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search Lyrics + Videos"}
        </button>
      </form>

      {/* display lyrics */}
      {lyricsError && <p className="text-red-600">{lyricsError}</p>}
      {lyricsData && (
        <div className="mt-4">
            <h2>{lyricsData.title}</h2>
            <a href={lyricsData.url} target="_blank" rel="noreferrer">View on Genius</a>
            <pre className="whitespace-pre-wrap mt-4 max-h-[300px] overflow-y-auto p-2 border border-gray-300 rounded-md">
            {lyricsData.lyrics}
            </pre>
        </div>
        )}

    {/* youtube result (display the top result only) */}
    <div className="mt-8">
    <h2>Instrumental</h2>
    {ytError && <p className="text-red-600">{ytError}</p>}
    {ytLoading && ytItems.length === 0 && <p>Loading video…</p>}

    {ytItems.length === 0 && !ytLoading && !ytError && (
        <p>No instrumental match found.</p>
    )}

    {ytItems[0] && (() => {
        const item = ytItems[0];
        const videoId = item.id.videoId;
        const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined;
        const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : undefined;

        return (
        <div
            className="flex flex-col border border-gray-200 rounded-lg text-center item-center p-2 max-w-lg mx-auto"
        >
            {embedUrl && (
            <iframe
                width="100%"
                height="315"
                src={embedUrl}
                title={item.snippet.title}
                frameBorder="0"
                allowFullScreen
                className="w-full rounded-md"
            />
            )}
            <div className="mt-2">
            {watchUrl ? (
                <a href={watchUrl} target="_blank" rel="noreferrer" className="font-semibold">
                {item.snippet.title}
                </a>
            ) : (
                <div className="font-semibold">{item.snippet.title}</div>
            )}
            <div className="text-xs opacity-80 mt-1">
                {item.snippet.channelTitle} •{" "}
                {new Date(item.snippet.publishedAt).toLocaleDateString()}
                {item.snippet.liveBroadcastContent !== "none" && (
                <> | <strong>{item.snippet.liveBroadcastContent.toUpperCase()}</strong></>
                )}
            </div>
            </div>
        <div className="flex flex-col mt-8 gap-4"> 
            <label>Parody Topic</label>
            <input 
                className="flex border"
                placeholder="Enter a parody topic"
                value = {parodyTopic}
                onChange={(e) => setParodyTopic(e.target.value)}
            ></input>
            <button onClick={generateParodyLyrics} className="border">Generate Song Lyrics</button>
            <div>{generatedParody}</div>
        </div>
        </div>
        );
    })()}
    </div>
    </div>
  );
}
