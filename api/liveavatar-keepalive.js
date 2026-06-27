// ─────────────────────────────────────────────
//  liveavatar-keepalive.js
//  Pings HeyGen to keep the session alive during silence
//  POST /api/liveavatar-keepalive
//  Body: { sessionId }
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  try {
    const response = await fetch(`https://api.liveavatar.com/v1/sessions/${sessionId}/keep-alive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.LIVEAVATAR_API_KEY
      }
    });

    const data = await response.json();
    console.log(`Keep-alive sent for session ${sessionId}:`, response.status);
    return res.status(200).json({ ok: true, status: response.status });
  } catch (error) {
    console.error('Keep-alive error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
