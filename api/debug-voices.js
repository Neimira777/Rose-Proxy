// ─────────────────────────────────────────────
//  /api/debug-voices  (TEMPORARY — delete once you've found a voice_id)
//  Just visit this URL in your browser after deploying:
//    https://rose-proxy.vercel.app/api/debug-voices
//  Pulls LiveAvatar's actual voice catalog using the API key already
//  configured in Vercel, so you don't need Discord or a separate script.
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.liveavatar.com/v1/voices', {
      headers: { 'X-API-KEY': process.env.LIVEAVATAR_API_KEY }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({
        note: 'LiveAvatar returned an error — see raw response below.',
        status: response.status,
        raw: data
      });
    }

    // Return everything, but also surface anything that looks
    // Spanish/multilingual up top so you don't have to scroll a huge list.
    const voices = data.voices || data.data || data || [];
    const likelySpanish = Array.isArray(voices)
      ? voices.filter(v => JSON.stringify(v).toLowerCase().includes('spanish') || JSON.stringify(v).toLowerCase().includes('multilingual'))
      : [];

    return res.status(200).json({
      note: 'This is a temporary debug endpoint — delete api/debug-voices.js once you have found a Spanish voice_id.',
      likelySpanishOrMultilingual: likelySpanish,
      totalVoicesReturned: Array.isArray(voices) ? voices.length : 'unknown shape',
      allVoices: voices
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
