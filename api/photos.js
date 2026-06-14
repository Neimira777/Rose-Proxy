
  // ─────────────────────────────────────────────
//  /api/photos
//  Simple in-memory queue for SHOW_PHOTO signals
//  GET    → returns and clears the queued photo URL
//  POST   → stores a photo URL to display
//  DELETE → clears the queue
// ─────────────────────────────────────────────
let photoQueue = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { patientId, url, label } = req.body || {};
    if (!patientId || !url) return res.status(400).json({ error: 'Missing patientId or url' });
    photoQueue[patientId] = { url, label };
    console.log(`Photo queued for ${patientId}: ${label}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    const photo = photoQueue[patientId] || null;
    if (photo) delete photoQueue[patientId];
    return res.status(200).json({ url: photo?.url || null, label: photo?.label || null });
  }

  if (req.method === 'DELETE') {
    const { patientId } = req.query || {};
    if (patientId) delete photoQueue[patientId];
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
