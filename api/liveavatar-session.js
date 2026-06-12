// ─────────────────────────────────────────────
//  liveavatar-session.js
//  Creates a LiveAvatar session token for the frontend
//  Called by launch.html before starting the avatar stream
//  Returns: { session_id, session_token } for the web SDK
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { patientId } = req.body || {};

    // ── Build session token request ──
    // FULL mode: LiveAvatar handles ASR, TTS, and WebRTC.
    // We plug in our own LLM via llm_configuration_id.
    // The custom LLM endpoint is /api/chat-completions (OpenAI-compatible).
    const sessionPayload = {
      mode: 'FULL',
      avatar_id: process.env.LIVEAVATAR_ROSE_AVATAR_ID || '0b44776d-3211-44e5-a459-bcb6f49e0fcd',
      avatar_persona: {
        voice_id: process.env.LIVEAVATAR_ROSE_VOICE_ID || '4f3b1e99-b580-4f05-9b67-a5f585be0232',
        language: 'en',
        voice_settings: {
          provider: 'elevenLabs',
          speed: 1,
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          model: 'eleven_flash_v2_5'
        }
      },
      interactivity_type: 'CONVERSATIONAL',
      llm_configuration_id: process.env.LIVEAVATAR_LLM_CONFIG_ID,
      // Pass patientId as a dynamic variable so chat-completions.js can load the right profile
      dynamic_variables: {
        patient_id: patientId || 'recMLLC4fJHBUhE5w'
      },
      video_settings: {
        quality: 'high',
        encoding: 'H264'
      }
    };

    // ── Call LiveAvatar API ──
    const response = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.LIVEAVATAR_API_KEY
      },
      body: JSON.stringify(sessionPayload)
    });

    const data = await response.json();

    if (!response.ok || !data.data) {
      console.error('LiveAvatar session error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: 'Failed to create LiveAvatar session',
        details: data
      });
    }

    // Return session_id and session_token to the frontend
    return res.status(200).json({
      session_id: data.data.session_id,
      session_token: data.data.session_token
    });

  } catch (error) {
    console.error('liveavatar-session error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
