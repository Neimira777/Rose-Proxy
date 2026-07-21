// ─────────────────────────────────────────────
//  /api/music-status
//  Tracks what's CURRENTLY PLAYING (if anything) per patient,
//  so Rose's conversation brain (api/chat.js) can know music
//  is already going instead of asking what to play.
//
//  GET    → returns { nowPlaying: string|null }
//  POST   → sets { patientId, nowPlaying } when playback starts
//  DELETE → clears status when playback stops
// ─────────────────────────────────────────────

let nowPlayingState = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { patientId, nowPlaying } = req.body || {};
    if (!patientId || !nowPlaying) return res.status(400).json({ error: 'Missing patientId or nowPlaying' });
    nowPlayingState[patientId] = nowPlaying;
    console.log(`Now playing set for ${patientId}: ${nowPlaying}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    return res.status(200).json({ nowPlaying: nowPlayingState[patientId] || null });
  }

  if (req.method === 'DELETE') {
    const { patientId } = req.query || {};
    if (patientId) delete nowPlayingState[patientId];
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
