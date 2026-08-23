// ─────────────────────────────────────────────
//  /api/check-elevenlabs-voices
//  ONE-TIME DIAGNOSTIC — not a permanent feature.
//  Checks whether Rose's and Jim's voice IDs (currently referenced in
//  liveavatar-session.js as provider: 'elevenLabs') are recognized
//  directly by ElevenLabs' own API — the real source of these voices,
//  since HeyGen's separate starfish-engine catalog does NOT recognize
//  them (confirmed via check-voice-compat.js).
//
//  Delete this file once the question is answered; it's not meant to
//  stay in the codebase.
//
//  GET /api/check-elevenlabs-voices
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ROSE_VOICE_ID = '4f3b1e99-b580-4f05-9b67-a5f585be0232';
  const JIM_VOICE_ID = 'b952f553-f7f3-4e52-8625-86b4c415384f';

  async function checkVoice(voiceId, label) {
    try {
      // GET /v1/voices/{voice_id} — the cheapest possible check, no audio
      // actually generated, just confirms whether ElevenLabs recognizes
      // this exact ID as a real voice on this account.
      const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
      });
      const data = await res.json();
      if (!res.ok) {
        return { voiceId, label, recognized: false, status: res.status, details: data };
      }
      return { voiceId, label, recognized: true, name: data.name || null, category: data.category || null };
    } catch (e) {
      return { voiceId, label, recognized: false, error: e.message };
    }
  }

  try {
    const rose = await checkVoice(ROSE_VOICE_ID, 'Rose');
    const jim = await checkVoice(JIM_VOICE_ID, 'Jim');

    return res.status(200).json({
      ok: true,
      rose,
      jim,
      summary: rose.recognized && jim.recognized
        ? 'Both voice IDs are real ElevenLabs voices on this account — safe to build voice reminders calling ElevenLabs directly with these exact IDs.'
        : 'At least one voice ID was not recognized directly by ElevenLabs — see details above. This may mean the ID stored in liveavatar-session.js is a LiveAvatar-internal reference rather than a raw ElevenLabs voice ID, and the real ElevenLabs voice ID would need to be found separately (e.g. by listing all voices on the ElevenLabs account and matching by name/sound).'
    });
  } catch (error) {
    console.error('check-elevenlabs-voices error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
