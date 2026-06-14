// ─────────────────────────────────────────────
//  photos.js
//  Serves queued photo URLs to the frontend
//  GET /api/photos?patientId=xxx — returns next photo URL to display
//  DELETE /api/photos?patientId=xxx — clears photo queue
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { patientId } = req.query || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  if (req.method === 'DELETE') {
    if (global._photoQueue) delete global._photoQueue[patientId];
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const url = global._photoQueue?.[patientId] || null;
    if (url) delete global._photoQueue[patientId]; // clear after serving
    return res.status(200).json({ url });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
