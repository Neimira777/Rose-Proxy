// ─────────────────────────────────────────────
//  /api/breathing-queue
//  Simple in-memory queue for BREATHING signals — same shape as
//  music-queue.js and exercise-queue.js. Breathing needs its own queue
//  (not a reuse of exercise-queue) because it's a genuinely different
//  shape: three phases of DIFFERENT lengths (inhale/hold/exhale)
//  repeated over several cycles, not one number counting up.
//  GET  → returns and clears the latest breathing pattern request
//  POST → stores a new breathing pattern request
//  Pattern format: "inhaleSeconds-holdSeconds-exhaleSeconds-cycles"
//  e.g. "4-2-4-3" = 4s in, 2s hold, 4s out, repeated 3 times.
// ─────────────────────────────────────────────
let breathingQueue = {};
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    const { patientId, pattern } = req.body || {};
    const isValidPattern = typeof pattern === 'string' && /^\d+-\d+-\d+-\d+$/.test(pattern);
    if (!patientId || !isValidPattern) return res.status(400).json({ error: 'Missing patientId or a valid pattern (expected format: inhale-hold-exhale-cycles, e.g. 4-2-4-3)' });
    breathingQueue[patientId] = pattern;
    console.log(`Breathing pattern queued for ${patientId}: ${pattern}`);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    const pattern = breathingQueue[patientId] || null;
    if (pattern) {
      delete breathingQueue[patientId]; // clear after reading
      console.log(`Breathing pattern dequeued for ${patientId}: ${pattern}`);
    }
    return res.status(200).json({ pattern });
  }
  if (req.method === 'DELETE') {
    const { patientId } = req.query || {};
    if (patientId) delete breathingQueue[patientId];
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
