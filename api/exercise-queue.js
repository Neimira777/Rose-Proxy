// ─────────────────────────────────────────────
//  /api/exercise-queue
//  Simple in-memory queue for COUNT_REPS signals — same shape as
//  music-queue.js. This is what lets rep counting be driven by a real
//  timer in launch.html instead of Rose/Jim speaking numbers aloud
//  (spoken counting has no consistent pacing; a real setInterval does).
//  GET  → returns and clears the latest rep-count request
//  POST → stores a new rep-count request
// ─────────────────────────────────────────────
let exerciseQueue = {};
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    const { patientId, count } = req.body || {};
    const parsedCount = parseInt(count);
    if (!patientId || !parsedCount || parsedCount <= 0) return res.status(400).json({ error: 'Missing patientId or a valid positive count' });
    exerciseQueue[patientId] = parsedCount;
    console.log(`Exercise count queued for ${patientId}: ${parsedCount}`);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    const count = exerciseQueue[patientId] || null;
    if (count) {
      delete exerciseQueue[patientId]; // clear after reading
      console.log(`Exercise count dequeued for ${patientId}: ${count}`);
    }
    return res.status(200).json({ count });
  }
  if (req.method === 'DELETE') {
    const { patientId } = req.query || {};
    if (patientId) delete exerciseQueue[patientId];
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
