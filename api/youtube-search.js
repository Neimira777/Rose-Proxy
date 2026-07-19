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
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&q=${encodeURIComponent(query)}&key=${process.env.YOUTUBE_API_KEY}`
    );
    const searchData = await searchRes.json();

    if (searchData.error) {
      console.error('YouTube search error:', JSON.stringify(searchData.error));
      return res.status(200).json({ ok: false, message: 'YouTube search failed' });
    }

    const items = searchData.items || [];
    // Prefer results that look like official audio/music uploads over
    // random covers, reactions, or unrelated content.
    const preferred = items.find(item =>
      /official (audio|video)|lyrics|full song/i.test(item.snippet?.title || '')
    ) || items[0];

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
