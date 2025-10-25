import { useState, useEffect } from "react";

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
  const [parodyLoading, setParodyLoading] = useState(false)
  
  // suno ai music generation state
  const [musicGenerationStatus, setMusicGenerationStatus] = useState<'idle' | 'sending' | 'polling' | 'complete' | 'failed'>('idle');
  const [musicStyle, setMusicStyle] = useState('Pop');
  const [vocalGender, setVocalGender] = useState<'any' | 'male' | 'female'>('any');
  const [songTitle, setSongTitle] = useState('');
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);

  // Auto-set song title when lyrics and artist are available
  useEffect(() => {
    if (lyricsData && artist) {
      const defaultTitle = `parody in the style of ${artist}'s ${lyricsData.title}`;
      setSongTitle(defaultTitle);
    } else if (lyricsData && song) {
      const defaultTitle = `parody in the style of ${lyricsData.title}`;
      setSongTitle(defaultTitle);
    }
  }, [lyricsData, artist, song]);

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
      maxResults: "1",
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

    if (!lyricsData?.lyrics || !parodyTopic) {
      console.log("Lyrics or Parody Topic not provided.");
      return;
    }
  
    console.log('generating parody lyrics...')
    console.log('data:', { song, artist, lyricsLength: lyricsData.lyrics.length, parodyTopic })
  
    try {
        setParodyLoading(true)
        const response = await fetch('/api/ai-parody-generation', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          
            // prefer the official title from genius
          songTitle: lyricsData.title || song,
          artist: artist,
          lyrics: lyricsData.lyrics,
          parodyTopic: parodyTopic
        })
      })
  
      const result = await response.json()
      console.log('response from server:', result)
      
      if (result.ok) {
          console.log('parody generated successfully, length:', result.generatedParody?.length);
          setGeneratedParody(result.generatedParody)
          setParodyLoading(false)
      } else {
          console.error('server returned error:', result.error)
      }
    } catch (error) {
      console.error('fetch error:', error)
    }
  };

  // poll suno status endpoint until complete
  async function pollForCompletion(taskId: string): Promise<string> {
    const maxAttempts = 60; // 10 minutes max
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // wait 10s
      
      const response = await fetch(`/api/suno/status/${taskId}`);
      const data = await response.json();
      
      console.log(`poll attempt ${i + 1}: status = ${data.status}`);
      
      // check for final success status
      if (data.status === 'SUCCESS' && data.tracks && data.tracks.length > 0) {
        console.log('found audio url:', data.tracks[0].audioUrl);
        return data.tracks[0].audioUrl;
      } else if (data.status === 'FAILED') {
        throw new Error(data.error || 'generation failed');
      }
      // otherwise keep polling
    }
    
    throw new Error('generation timeout - exceeded 10 minutes');
  }

  // send request to suno and poll for completion
  async function generateParodySong() {
    if (!generatedParody) {
      console.error('no parody lyrics available');
      return;
    }

    try {
      setMusicGenerationStatus('sending');
      setFinalAudioUrl(null); // clear previous audio

      // add vocal gender preference to style if specified
      let styleWithVocals = musicStyle;
      if (vocalGender === 'male') {
        styleWithVocals = `${musicStyle} with male vocals`;
      } else if (vocalGender === 'female') {
        styleWithVocals = `${musicStyle} with female vocals`;
      }
      
      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: generatedParody,
          customMode: true,
          style: styleWithVocals,
          title: songTitle,
          instrumental: false,
          model: 'V4_5'
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error('failed to start generation');
      }

      const taskId = result.taskId;
      console.log('suno task started:', taskId);

      // request sent successfully, now start polling
      setMusicGenerationStatus('polling');

      // poll for completion
      const audioUrl = await pollForCompletion(taskId);
      
      setFinalAudioUrl(audioUrl);
      setMusicGenerationStatus('complete');
      console.log('song generation complete:', audioUrl);

    } catch (error) {
      console.error('music generation error:', error);
      setMusicGenerationStatus('failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto my-8 px-4 font-sans">
      <h1 className="text-2xl font-bold mb-6 text-center">Song Search</h1>

      <form onSubmit={handleSearch} className="mb-8 max-w-md mx-auto">
        <div className="mb-4">
          <label className="block mb-1 font-medium">Song: </label>
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Enter a Song Title"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Artist (optional): </label>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Enter an artist"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <button type="submit" disabled={loading} className="w-full px-4 py-2 bg-black text-white rounded disabled:opacity-50">
          {loading ? "Searching..." : "Search Lyrics + Videos"}
        </button>
      </form>

      {(lyricsData || ytItems.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Lyrics section */}
          <div>
            {lyricsError && <p className="text-red-600">{lyricsError}</p>}
            {lyricsData && (
              <div>
                <h2 className="text-xl font-semibold mb-2">{lyricsData.title}</h2>
                <a href={lyricsData.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  View on Genius
                </a>
                <pre className="whitespace-pre-wrap mt-3 max-h-[400px] overflow-y-auto p-3 border border-gray-300 rounded-md bg-gray-50 text-sm">
                  {lyricsData.lyrics}
                </pre>
              </div>
            )}
          </div>

          {/* Instrumental */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Instrumental</h2>
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
                <div className="border border-gray-200 rounded-lg p-3">
                  {embedUrl && (
                    <iframe
                      width="100%"
                      height="200"
                      src={embedUrl}
                      title={item.snippet.title}
                      frameBorder="0"
                      allowFullScreen
                      className="w-full rounded-md"
                    />
                  )}
                  <div className="mt-2">
                    {watchUrl ? (
                      <a href={watchUrl} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                        {item.snippet.title}
                      </a>
                    ) : (
                      <div className="font-semibold">{item.snippet.title}</div>
                    )}
                    <div className="text-xs opacity-80 mt-1">
                      {item.snippet.channelTitle} •{" "}
                      {new Date(item.snippet.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Parody generation section */}
      {lyricsData && ytItems[0] && (
        <div className="border-t pt-6">
          <h2 className="text-xl font-semibold mb-4 text-center">Generate Parody</h2>
          <div className="max-w-md mx-auto mb-6">
            <label className="block mb-2 font-medium">Parody Topic</label>
            <input 
              className="w-full px-3 py-2 border rounded mb-4"
              placeholder="Enter a parody topic"
              value={parodyTopic}
              onChange={(e) => setParodyTopic(e.target.value)}
            />
            <button 
              onClick={generateParodyLyrics} 
              className="w-full px-4 py-2 bg-black text-white rounded"
            >
              {parodyLoading ? 'Loading...' : 'Generate Song Lyrics'}
            </button>
          </div>
            
          {generatedParody && (
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Original Lyrics */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Original Lyrics</h3>
                <pre className="whitespace-pre-wrap max-h-[500px] overflow-y-auto p-4 border border-gray-300 rounded-md bg-gray-50 text-sm">
                  {lyricsData.lyrics}
                </pre>
              </div>
              
              {/* Generated Parody */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Generated Parody</h3>
                <pre className="whitespace-pre-wrap max-h-[500px] overflow-y-auto p-4 border border-gray-300 rounded-md bg-gray-50 text-sm">
                  {generatedParody}
                </pre>
              </div>
            </div>
          )}

          {/* ai vocals generation section */}
          {generatedParody && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold mb-4 text-center">
                Generate AI Vocals
              </h3>
              
              <div className="max-w-md mx-auto">
                {/* song title input */}
                <div className="mb-4">
                  <label className="block mb-2 font-medium">Song Title</label>
                  <input 
                    className="w-full px-3 py-2 border rounded"
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    placeholder="Enter song title"
                    disabled={musicGenerationStatus === 'sending' || musicGenerationStatus === 'polling'}
                  />
                </div>

                {/* music style selector */}
                <div className="mb-4">
                  <label className="block mb-2 font-medium">Music Style</label>
                  <select 
                    className="w-full px-3 py-2 border rounded"
                    value={musicStyle}
                    onChange={(e) => setMusicStyle(e.target.value)}
                    disabled={musicGenerationStatus === 'sending' || musicGenerationStatus === 'polling'}
                  >
                    <option value="Pop">Pop</option>
                    <option value="Rock">Rock</option>
                    <option value="Hip Hop">Hip Hop</option>
                    <option value="Country">Country</option>
                    <option value="R&B">R&B</option>
                    <option value="Electronic">Electronic</option>
                    <option value="Folk">Folk</option>
                    <option value="Jazz">Jazz</option>
                    <option value="Alternative">Alternative</option>
                    <option value="Indie">Indie</option>
                  </select>
                </div>

                {/* vocal gender selector */}
                <div className="mb-4">
                  <label className="block mb-2 font-medium">Vocal Gender</label>
                  <select 
                    className="w-full px-3 py-2 border rounded"
                    value={vocalGender}
                    onChange={(e) => setVocalGender(e.target.value as 'any' | 'male' | 'female')}
                    disabled={musicGenerationStatus === 'sending' || musicGenerationStatus === 'polling'}
                  >
                    <option value="any">Any</option>
                    <option value="male">Male Vocals</option>
                    <option value="female">Female Vocals</option>
                  </select>
                </div>

                {/* generate button */}
                <button
                  onClick={generateParodySong}
                  disabled={musicGenerationStatus === 'sending' || musicGenerationStatus === 'polling'}
                  className="w-full px-4 py-2 bg-black text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {musicGenerationStatus === 'sending' && 'Sending request...'}
                  {musicGenerationStatus === 'polling' && 'Generating (2-5 minutes)...'}
                  {musicGenerationStatus === 'idle' && 'Generate Song with AI Vocals'}
                  {musicGenerationStatus === 'complete' && 'Generate Another Song'}
                  {musicGenerationStatus === 'failed' && 'Try Again'}
                </button>

                {/* status messages */}
                {musicGenerationStatus === 'sending' && (
                  <p className="mt-2 text-gray-600 text-sm text-center">
                    sending request to suno...
                  </p>
                )}

                {musicGenerationStatus === 'polling' && (
                  <p className="mt-2 text-green-600 text-sm text-center">
                    request sent successfully! polling for completion...
                  </p>
                )}

                {musicGenerationStatus === 'failed' && (
                  <p className="mt-2 text-red-600 text-sm text-center">
                    generation failed. please try again.
                  </p>
                )}
              </div>

              {/* audio player when complete */}
              {finalAudioUrl && musicGenerationStatus === 'complete' && (
                <div className="mt-6 max-w-md mx-auto border border-purple-300 rounded-lg p-4 bg-purple-50">
                  <h4 className="font-semibold mb-3 text-center text-purple-900">
                    Your Parody Song
                  </h4>
                  <audio 
                    controls 
                    src={finalAudioUrl}
                    className="w-full mb-3"
                  >
                    Your browser does not support the audio element.
                  </audio>
                  <a 
                    href={finalAudioUrl}
                    download={`${song}-parody.mp3`}
                    className="block text-center text-purple-600 hover:text-purple-800 hover:underline text-sm font-medium"
                  >
                    Download MP3
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
