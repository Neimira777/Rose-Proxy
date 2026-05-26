// ─────────────────────────────────────────────
//  /api/music-queue
//  Simple in-memory queue for PLAY_MUSIC signals
//  GET  → returns and clears the latest music request
//  POST → stores a new music request
// ─────────────────────────────────────────────

let musicQueue = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { patientId, query } = req.body || {};
    if (!patientId || !query) return res.status(400).json({ error: 'Missing patientId or query' });
    musicQueue[patientId] = query;
    console.log(`Music queued for ${patientId}: ${query}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    const query = musicQueue[patientId] || null;
    if (query) {
      delete musicQueue[patientId]; // clear after reading
      console.log(`Music dequeued for ${patientId}: ${query}`);
    }
    return res.status(200).json({ query });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
