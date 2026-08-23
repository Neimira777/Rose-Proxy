// ─────────────────────────────────────────────
//  /api/list-elevenlabs-voices
//  ONE-TIME DIAGNOSTIC — not a permanent feature.
//  Lists every voice available on this ElevenLabs account, so the real
//  voice IDs for Rose and Jim can be identified by name (the IDs stored
//  in liveavatar-session.js were confirmed to be LiveAvatar-internal
//  references, not real ElevenLabs voice IDs — see
//  check-elevenlabs-voices.js).
//
//  Delete this file once the real voice IDs are identified; it's not
//  meant to stay in the codebase.
//
//  GET /api/list-elevenlabs-voices
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const voicesRes = await fetch('https://api.elevenlabs.io/v2/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    const voicesData = await voicesRes.json();

    if (!voicesRes.ok) {
      return res.status(200).json({ ok: false, status: voicesRes.status, details: voicesData });
    }

    const voices = (voicesData.voices || []).map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description || null,
      labels: v.labels || null,
      preview_url: v.preview_url || null
    }));

    return res.status(200).json({
      ok: true,
      totalVoices: voices.length,
      voices,
      hint: 'Look through the list above for names/descriptions that plausibly match Rose (warm, genuine female) or Jim (steady, warm male, easy dry humor) — the preview_url for each lets you actually listen to confirm which one sounds right before committing to it in code.'
    });
  } catch (error) {
    console.error('list-elevenlabs-voices error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
