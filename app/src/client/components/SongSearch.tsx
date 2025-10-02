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

  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  const [ytItems, setYtItems] = useState<YTItem[]>([]);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytNextPage, setYtNextPage] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [ytLoading, setYtLoading] = useState(false);

  async function fetchLyrics(qSong: string, qArtist: string) {
    setLyricsError(null);
    setLyrics(null);

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
    setLyrics(json);
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
      {lyrics && (
        <div className="mt-4">
          <h2>{lyrics.title}</h2>
          <a href={lyrics.url} target="_blank" rel="noreferrer">
            View on Genius
          </a>
          <pre
            className="whitespace-pre-wrap mt-4 max-h-[300px] overflow-y-auto p-2 border border-gray-300 rounded-md"
          >
            {lyrics.lyrics}
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
        const thumb =
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.default?.url;
        const videoId = item.id.videoId;
        const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined;

        return (
        <div
            className="border border-gray-200 rounded-lg p-2 max-w-lg"
        >
            {thumb && watchUrl && (
            <a href={watchUrl} target="_blank" rel="noreferrer">
                <img
                src={thumb}
                alt={item.snippet.title}
                className="w-full rounded-md"
                />
            </a>
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
            ></input>
            <button className="border">Generate Song Lyrics</button>
        </div>
        </div>
        );
    })()}
    </div>
    </div>
  );
}
