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
    <div style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Song Search</h1>

      <form onSubmit={handleSearch}>
        <div style={{ marginBottom: "0.5rem" }}>
          <label>Song: </label>
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Enter a Song Title"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: "0.5rem" }}>
          <label>Artist (optional): </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Enter an artist"
            style={{ width: "100%" }}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search Lyrics + Videos"}
        </button>
      </form>

      {/* display lyrics */}
      {lyricsError && <p style={{ color: "red" }}>{lyricsError}</p>}
      {lyrics && (
        <div style={{ marginTop: "1rem" }}>
          <h2>{lyrics.title}</h2>
          <a href={lyrics.url} target="_blank" rel="noreferrer">
            View on Genius
          </a>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              marginTop: "1rem",
              maxHeight: 300,
              overflowY: "auto",
              padding: "0.5rem",
              border: "1px solid #ddd",
              borderRadius: 6,
            }}
          >
            {lyrics.lyrics}
          </pre>
        </div>
      )}

      {/* youtube result (display the top result only) */}
    <div style={{ marginTop: "2rem" }}>
    <h2>Instrumental</h2>
    {ytError && <p style={{ color: "red" }}>{ytError}</p>}
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
            style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 8,
            maxWidth: 500,
            }}
        >
            {thumb && watchUrl && (
            <a href={watchUrl} target="_blank" rel="noreferrer">
                <img
                src={thumb}
                alt={item.snippet.title}
                style={{ width: "100%", borderRadius: 6 }}
                />
            </a>
            )}
            <div style={{ marginTop: 8 }}>
            {watchUrl ? (
                <a href={watchUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                {item.snippet.title}
                </a>
            ) : (
                <div style={{ fontWeight: 600 }}>{item.snippet.title}</div>
            )}
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {item.snippet.channelTitle} •{" "}
                {new Date(item.snippet.publishedAt).toLocaleDateString()}
                {item.snippet.liveBroadcastContent !== "none" && (
                <> | <strong>{item.snippet.liveBroadcastContent.toUpperCase()}</strong></>
                )}
            </div>
            </div>
        </div>
        );
    })()}
    </div>

    </div>
  );
}
