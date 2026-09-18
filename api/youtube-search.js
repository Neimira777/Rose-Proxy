// ─────────────────────────────────────────────
//  youtube-search.js
//  Free-tier music fallback for members who haven't connected
//  their own Spotify account. Searches YouTube for a song/artist
//  and returns the best video ID to play via the IFrame Player.
//  POST /api/youtube-search
//  Body: { query }
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    // videoCategoryId=10 restricts results to YouTube's "Music" category —
    // without it, a plain keyword search can surface a podcast episode,
    // interview, or documentary that happens to mention the artist/song
    // name, and the member has no way to tell it's not the song they were
    // told is playing.
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=5&q=${encodeURIComponent(query)}&key=${process.env.YOUTUBE_API_KEY}`
    );
    const searchData = await searchRes.json();

    if (searchData.error) {
      console.error('YouTube search error:', JSON.stringify(searchData.error));
      return res.status(200).json({ ok: false, message: 'YouTube search failed' });
    }

    const items = searchData.items || [];
    // Belt-and-suspenders on top of videoCategoryId=10: YouTube's category
    // tagging isn't reliable for every upload, so also drop anything whose
    // title reads like a podcast/interview/documentary rather than a song.
    const nonMusic = items.filter(item =>
      !/podcast|interview|documentary|episode|reaction|explained|review/i.test(item.snippet?.title || '')
    );
    const candidates = nonMusic.length > 0 ? nonMusic : items;

    // Prefer results that look like official audio/music uploads over
    // random covers, reactions, or unrelated content.
    const preferred = candidates.find(item =>
      /official (audio|video)|lyrics|full song/i.test(item.snippet?.title || '')
    ) || candidates[0];

    if (!preferred) {
      return res.status(200).json({ ok: false, message: 'No results found' });
    }

    return res.status(200).json({
      ok: true,
      videoId: preferred.id.videoId,
      title: preferred.snippet?.title || ''
    });

  } catch (error) {
    console.error('YouTube search error:', error.message);
    return res.status(200).json({ ok: false, message: 'YouTube search failed' });
  }
}
