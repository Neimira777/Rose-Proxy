// ─────────────────────────────────────────────
//  /api/check-voice-compat
//  ONE-TIME DIAGNOSTIC — not a permanent feature.
//  Checks whether Rose's and Jim's existing voice IDs (used for live
//  LiveAvatar streaming, provider: elevenLabs) are ALSO recognized by
//  HeyGen's separate standalone Text-to-Speech endpoint (/v3/voices/speech,
//  which uses HeyGen's own "starfish-engine" voice catalog — a different
//  system from LiveAvatar's ElevenLabs-routed voices).
//
//  This exists purely to answer that question safely, using the
//  HEYGEN_API_KEY that's already stored in Vercel — no key ever needs to
//  be pasted anywhere. Delete this file once the question is answered;
//  it's not meant to stay in the codebase.
//
//  GET /api/check-voice-compat
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ROSE_VOICE_ID = '4f3b1e99-b580-4f05-9b67-a5f585be0232';
  const JIM_VOICE_ID = 'b952f553-f7f3-4e52-8625-86b4c415384f';

  try {
    const voicesRes = await fetch('https://api.heygen.com/v3/voices?engine=starfish', {
      headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY }
    });
    const voicesData = await voicesRes.json();

    if (!voicesRes.ok) {
      return res.status(200).json({
        ok: false,
        step: 'listing starfish-compatible voices',
        status: voicesRes.status,
        details: voicesData
      });
    }

    const allVoices = voicesData.data?.voices || voicesData.data || [];
    const voiceIds = new Set(allVoices.map(v => v.voice_id));

    const roseCompatible = voiceIds.has(ROSE_VOICE_ID);
    const jimCompatible = voiceIds.has(JIM_VOICE_ID);

    // If either isn't compatible, also try an actual speech generation
    // call directly with that voice_id — some voices might work with the
    // speech endpoint even if they don't appear in the starfish-filtered
    // list (the docs recommend checking the list first, but a direct
    // attempt is the real ground truth).
    async function tryDirectSpeech(voiceId, label) {
      try {
        const speechRes = await fetch('https://api.heygen.com/v3/voices/speech', {
          method: 'POST',
          headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `This is a compatibility test for ${label}.`, voice_id: voiceId })
        });
        const speechData = await speechRes.json();
        return { attempted: true, ok: speechRes.ok, status: speechRes.status, details: speechData };
      } catch (e) {
        return { attempted: true, ok: false, error: e.message };
      }
    }

    const roseDirectTest = roseCompatible ? null : await tryDirectSpeech(ROSE_VOICE_ID, 'Rose');
    const jimDirectTest = jimCompatible ? null : await tryDirectSpeech(JIM_VOICE_ID, 'Jim');

    return res.status(200).json({
      ok: true,
      totalStarfishVoicesFound: allVoices.length,
      rose: {
        voiceId: ROSE_VOICE_ID,
        foundInStarfishList: roseCompatible,
        directSpeechTest: roseDirectTest
      },
      jim: {
        voiceId: JIM_VOICE_ID,
        foundInStarfishList: jimCompatible,
        directSpeechTest: jimDirectTest
      },
      summary: roseCompatible && jimCompatible
        ? 'Both voices are directly compatible — safe to build voice reminders using these exact voice IDs.'
        : 'At least one voice is NOT in the starfish-compatible list — check the directSpeechTest result above to see if it worked anyway despite that. If both directSpeechTest attempts failed too, these exact voice IDs cannot be used with the standalone TTS endpoint, and a different approach is needed for voice reminders.'
    });
  } catch (error) {
    console.error('check-voice-compat error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
