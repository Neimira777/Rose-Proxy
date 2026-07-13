// ─────────────────────────────────────────────
//  pexels-video.js
//  Returns a random seasonal nature video from Pexels
//  GET /api/pexels-video
//  Returns: { url, photographer, season }
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Seasonal search queries ──
  const month = new Date().getMonth() + 1;
  let season;
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';

  const seasonalQueries = {
    spring: ['cherry blossom petals falling', 'spring flowers blooming', 'gentle rain garden', 'spring meadow wind', 'butterflies flowers'],
    summer: ['tropical ocean waves sunny', 'sunflower field wind summer', 'summer beach waves', 'green trees summer breeze', 'summer lake ripples'],
    fall: ['autumn leaves falling wind', 'fall forest foliage', 'autumn wind leaves orange', 'fall nature colors', 'fireplace cozy autumn'],
    winter: ['snow falling peaceful', 'winter forest snowfall', 'snowflakes falling', 'winter nature snow', 'snow landscape peaceful']
  };

  const queries = seasonalQueries[season];
  const query = queries[Math.floor(Math.random() * queries.length)];

  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=10`,
      {
        headers: {
          'Authorization': process.env.PEXELS_API_KEY
        }
      }
    );

    if (!response.ok) {
      console.error('Pexels error:', response.status, await response.text());
      return res.status(response.status).json({ error: 'Pexels API error' });
    }

    const data = await response.json();
    const videos = data.videos || [];

    if (videos.length === 0) {
      return res.status(404).json({ error: 'No videos found' });
    }

    // Pick a random video from results
    const video = videos[Math.floor(Math.random() * videos.length)];

    // Get the best quality video file — prefer HD but fall back to SD
    const videoFiles = video.video_files || [];
    const hd = videoFiles.find(f => f.quality === 'hd' && f.file_type === 'video/mp4');
    const sd = videoFiles.find(f => f.quality === 'sd' && f.file_type === 'video/mp4');
    const chosen = hd || sd || videoFiles[0];

    if (!chosen?.link) {
      return res.status(404).json({ error: 'No suitable video file found' });
    }

    console.log(`Pexels video: ${query} → ${chosen.link.substring(0, 60)}...`);

    return res.status(200).json({
      url: chosen.link,
      photographer: video.user?.name || '',
      photographerUrl: video.user?.url || '',
      season,
      query
    });

  } catch (error) {
    console.error('Pexels fetch error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
