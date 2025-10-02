import { useState } from "react";

type LyricsResponse = {
  title: string;
  url: string;
  lyrics: string;
};

export default function SongSearch() {
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [data, setData] = useState<LyricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);

    if (!song.trim()) {
      setError("Please enter a song title.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        song: song.trim(),
        ...(artist.trim() ? { artist: artist.trim() } : {}),
      });

      const res = await fetch(`/genius-lyrics?${params.toString()}`);
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem?.error || `Request failed (${res.status})`);
      }
      const json: LyricsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "600px", margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Song Lyrics Search</h1>

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
            placeholder="Enter an artist)"
            style={{ width: "100%" }}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Get Lyrics"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && (
        <div style={{ marginTop: "1rem" }}>
          <h2>{data.title}</h2>
          <a href={data.url} target="_blank" rel="noreferrer">
            View on Genius
          </a>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              marginTop: "1rem",
              maxHeight: "300px",
              overflowY: "auto",
              border: "1px solid #ccc",
              padding: "0.5rem"
            }}
          >
            {data.lyrics}
          </pre>
        </div>
      )}
    </div>
  );
}
