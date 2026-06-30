// ─────────────────────────────────────────────
//  unsplash-photo.js
//  Returns a random seasonal nature photo from Unsplash
//  GET /api/unsplash-photo
//  Returns: { url, photographer, description }
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Seasonal search queries ──
  const month = new Date().getMonth() + 1;
  let season;
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';

  const seasonalQueries = {
    spring: ['cherry blossom', 'spring flowers garden', 'tulips field', 'spring meadow', 'blooming garden'],
    summer: ['peaceful beach sunset', 'sunflower field', 'summer lake', 'golden hour landscape', 'summer garden'],
    fall: ['autumn leaves forest', 'fall foliage', 'harvest pumpkins', 'autumn landscape', 'fall colors nature'],
    winter: ['snowy landscape peaceful', 'winter forest snow', 'cozy winter scene', 'snow covered trees', 'peaceful winter']
  };

  const queries = seasonalQueries[season];
  const query = queries[Math.floor(Math.random() * queries.length)];

  try {
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`,
      {
        headers: {
          'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.error('Unsplash error:', response.status);
      return res.status(response.status).json({ error: 'Unsplash API error' });
    }

    const data = await response.json();

    return res.status(200).json({
      url: data.urls?.regular || data.urls?.full,
      photographer: data.user?.name || '',
      description: data.alt_description || data.description || '',
      season
    });

  } catch (error) {
    console.error('Unsplash fetch error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
