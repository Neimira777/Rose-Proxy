// ─────────────────────────────────────────────
//  api/wrap-up-flag.js
//  Lightweight per-patient flag used to signal that a visit is nearing
//  its time limit, so chat-completions.js can have Rose/Jim wrap up
//  warmly on their NEXT natural reply — rather than the session being
//  cut off abruptly mid-sentence by the hard timer in launch.html.
//  Same simple in-memory pattern as music-status.js: POST sets it,
//  GET checks it, DELETE clears it. Not persisted anywhere durable —
//  this only needs to live for the last couple of minutes of one visit.
// ─────────────────────────────────────────────

const wrapUpFlags = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    wrapUpFlags[patientId] = true;
    console.log('Wrap-up flag SET for', patientId);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    return res.status(200).json({ wrapUp: !!wrapUpFlags[patientId] });
  }

  if (req.method === 'DELETE') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    delete wrapUpFlags[patientId];
    console.log('Wrap-up flag CLEARED for', patientId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
