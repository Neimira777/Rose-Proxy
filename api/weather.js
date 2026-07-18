// ─────────────────────────────────────────────
//  weather.js
//  Returns genuinely live current weather conditions for a
//  given hometown, using the National Weather Service's
//  official API — NOT general web search, which was found to
//  return stale cached weather pages instead of real conditions.
//  GET /api/weather?hometown=Cliffside+Park,+NJ
// ─────────────────────────────────────────────

// Simple in-memory cache (best-effort — serverless instances are
// short-lived, so this mainly helps when the same instance handles
// back-to-back requests, not a guarantee across all requests)
const weatherCache = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { hometown } = req.query || {};
  if (!hometown) return res.status(400).json({ error: 'Missing hometown' });

  const cacheKey = hometown.toLowerCase().trim();
  const cached = weatherCache[cacheKey];
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  try {
    // ── Step 1: Geocode the hometown to lat/lon via OpenStreetMap's
    // Nominatim (free for any use under fair-use rate limits, and built
    // for place-name lookups like "City, State" — unlike the US Census
    // geocoder, which is designed for full street addresses and often
    // returns no match for a bare city name). ──
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(hometown)}&countrycodes=us&format=json&limit=1`,
      { headers: { 'User-Agent': 'NeimiraRoseCompanion (linda@neimira.com)' } }
    );
    const geoResults = await geoRes.json();
    const match = geoResults?.[0];
    if (!match) {
      return res.status(200).json({ ok: false, message: 'Could not locate hometown' });
    }
    const lat = match.lat;
    const lon = match.lon;

    // ── Step 2: NWS points lookup — translates lat/lon into the
    // forecast office + gridpoint + nearest observation stations ──
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { 'User-Agent': 'NeimiraRoseCompanion (linda@neimira.com)' }
    });
    const pointsData = await pointsRes.json();
    const stationsUrl = pointsData?.properties?.observationStations;
    if (!stationsUrl) {
      return res.status(200).json({ ok: false, message: 'No weather station found for this location' });
    }

    // ── Step 3: Get the nearest station, then its latest live observation ──
    const stationsRes = await fetch(stationsUrl, {
      headers: { 'User-Agent': 'NeimiraRoseCompanion (linda@neimira.com)' }
    });
    const stationsData = await stationsRes.json();
    const nearestStation = stationsData?.features?.[0]?.id;
    if (!nearestStation) {
      return res.status(200).json({ ok: false, message: 'No observation station available' });
    }

    const obsRes = await fetch(`${nearestStation}/observations/latest`, {
      headers: { 'User-Agent': 'NeimiraRoseCompanion (linda@neimira.com)' }
    });
    const obsData = await obsRes.json();
    const props = obsData?.properties;
    if (!props || props.temperature?.value === null || props.temperature?.value === undefined) {
      return res.status(200).json({ ok: false, message: 'No current observation available' });
    }

    // ── Convert Celsius to Fahrenheit, build a clean summary ──
    const tempF = Math.round((props.temperature.value * 9 / 5) + 32);
    const description = props.textDescription || '';
    const windMph = props.windSpeed?.value != null ? Math.round(props.windSpeed.value * 0.621371) : null;

    const result = {
      ok: true,
      hometown,
      tempF,
      description,
      windMph,
      observedAt: props.timestamp
    };

    weatherCache[cacheKey] = { data: result, timestamp: Date.now() };
    return res.status(200).json(result);

  } catch (error) {
    console.error('Weather lookup error:', error.message);
    return res.status(200).json({ ok: false, message: 'Weather lookup failed' });
  }
}
