// ─────────────────────────────────────────────
//  /api/voice-reminder-speak
//  Generates a short spoken reminder in the member's current companion's
//  voice — e.g. "It's 2:00. Time to take your medication." — using
//  ElevenLabs' Text-to-Speech API directly (NOT HeyGen's LiveAvatar
//  streaming — no avatar session, no per-minute streaming credits used).
//
//  Voice choice: Rose and Jim's REAL streaming voices (routed through
//  LiveAvatar) are not directly reachable as standalone ElevenLabs voice
//  IDs — confirmed via diagnostic testing Aug 23, 2026 (the IDs stored in
//  liveavatar-session.js are LiveAvatar-internal references, rejected
//  outright by ElevenLabs' own API as invalid). So for this feature
//  specifically, Linda picked the closest-sounding stand-in voices from
//  ElevenLabs' own catalog by ear: Sarah for Rose, Brian for Jim. These
//  won't be identical to a live conversation's voice, but are a
//  reasonable match for a short spoken reminder.
//
//  POST /api/voice-reminder-speak
//  Body: { patientId, text }
//  Response: { audioUrl } (or an error)
// ─────────────────────────────────────────────

const REMINDER_VOICE_IDS = {
  Rose: 'EXAVITQu4vr4xnSDxMaL', // Sarah — Mature, Reassuring, Confident
  Jim: 'nPczCjzI2devNBz1zQrb'   // Brian — Deep, Resonant and Comforting
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId, text } = req.body || {};
  if (!patientId || !text) return res.status(400).json({ error: 'Missing patientId or text' });

  try {
    // ── Look up which companion this member currently has, so the
    // reminder is spoken in whichever voice they're actually visiting
    // with right now — auto-correct if they've switched companions,
    // same lookup pattern already used everywhere else in the app. ──
    let companion = 'Rose';
    try {
      const profileRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const profileData = await profileRes.json();
      companion = profileData.fields?.['Preferred Companion'] || 'Rose';
    } catch (e) {
      console.warn('voice-reminder-speak — companion lookup failed, defaulting to Rose:', e.message);
    }

    const voiceId = REMINDER_VOICE_IDS[companion] || REMINDER_VOICE_IDS.Rose;

    const speechRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5', // same fast, low-cost model already used for the real avatar voices
        voice_settings: { stability: 0.6, similarity_boost: 0.75 }
      })
    });

    if (!speechRes.ok) {
      const errData = await speechRes.json().catch(() => ({}));
      console.error('voice-reminder-speak — ElevenLabs error:', speechRes.status, JSON.stringify(errData));
      return res.status(502).json({ error: 'Speech generation failed', details: errData });
    }

    // ElevenLabs' text-to-speech endpoint returns raw audio bytes directly
    // (not a JSON response with a hosted URL) — stream those straight back
    // to the browser as an mp3, which launch.html plays immediately via a
    // plain <audio> element. Nothing is stored/cached server-side for now;
    // each reminder is generated fresh at the moment it's due, which for
    // a short one-line reminder costs a fraction of a cent.
    const audioBuffer = await speechRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('voice-reminder-speak error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
