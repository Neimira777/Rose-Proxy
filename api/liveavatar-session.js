// ─────────────────────────────────────────────
//  liveavatar-session.js
//  Creates a LiveAvatar session token for the frontend
//  Called by launch.html before starting the avatar stream
//  Returns: { session_id, session_token } for the web SDK
// ─────────────────────────────────────────────
// ── Session ID to Patient ID mapping ──
// Since HeyGen doesn't reliably pass dynamic variables to our LLM,
// we maintain our own mapping of session_id → patientId
const sessionPatientMap = {};

// ── Preferred Language name → ISO code, for the languages ElevenLabs'
// eleven_flash_v2_5 model supports. Family/admin enters a plain language
// name in Airtable (e.g. "Spanish") — this maps it to what LiveAvatar's
// avatar_persona.language field actually expects. Defaults to English if
// the field is empty or the entered name isn't recognized.
const LANGUAGE_CODES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', polish: 'pl', dutch: 'nl', turkish: 'tr', filipino: 'fil',
  swedish: 'sv', bulgarian: 'bg', romanian: 'ro', arabic: 'ar', czech: 'cs',
  greek: 'el', finnish: 'fi', croatian: 'hr', malay: 'ms', slovak: 'sk',
  danish: 'da', tamil: 'ta', ukrainian: 'uk', russian: 'ru', hungarian: 'hu',
  norwegian: 'no', vietnamese: 'vi', hindi: 'hi', japanese: 'ja',
  chinese: 'zh', mandarin: 'zh', korean: 'ko', indonesian: 'id'
};
function resolveLanguageCode(name) {
  if (!name) return 'en';
  const code = LANGUAGE_CODES[String(name).trim().toLowerCase()];
  return code || 'en';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const { sessionId } = req.query || {};
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    const mapping = sessionPatientMap[sessionId];
    if (!mapping) return res.status(404).json({ error: 'Session not found' });
    return res.status(200).json(mapping);
  }
  try {
    const { patientId, visitCountToday, isDemo, eventReminderLabel } = req.body || {};
    const resolvedPatientId = patientId || 'recMLLC4fJHBUhE5w';
    const resolvedVisitCount = String(visitCountToday || 1);
    const demoFlag = isDemo ? '|demo' : '';
    // Event reminder label travels through the pipe-delimited Active Session
    // field the same way isDemo does. Pipes/newlines stripped from the label
    // itself since it's user-adjacent (family-entered Entertainment Interests
    // feeding an LLM-generated label) to keep the delimited format intact.
    const safeEventLabel = eventReminderLabel ? String(eventReminderLabel).replace(/[|\n]/g, ' ').trim() : '';
    const eventFlag = safeEventLabel ? `|event:${safeEventLabel}` : '';

    // ── Look up this member's Preferred Language before creating the
    // session, since avatar_persona.language must be set at session
    // creation time — it can't be changed mid-session. ──
    let preferredLanguageCode = 'en';
    try {
      const profileRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${resolvedPatientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const profileData = await profileRes.json();
      preferredLanguageCode = resolveLanguageCode(profileData.fields?.['Preferred Language']);
    } catch(e) { console.warn('Preferred Language lookup failed, defaulting to English:', e.message); }

    console.log(`Creating session for patientId: ${resolvedPatientId}, visitCount: ${resolvedVisitCount}, language: ${preferredLanguageCode}`);

    const sessionPayload = {
      mode: 'FULL',
      avatar_id: process.env.LIVEAVATAR_ROSE_AVATAR_ID || '0b44776d-3211-44e5-a459-bcb6f49e0fcd',
      avatar_persona: {
        voice_id: process.env.LIVEAVATAR_ROSE_VOICE_ID || '4f3b1e99-b580-4f05-9b67-a5f585be0232', // reverted from Wendy — session token validation failed, likely not enabled for real-time streaming use
        // ── Embed patientId directly in context_id system message ──
        // Instead of relying on HeyGen dynamic_variables substitution,
        // we pass the IDs directly in the system prompt sent to our LLM
        context_id: 'dbbae8d4-7026-4026-b29b-e3bf18cf0b7c',
        language: preferredLanguageCode, // now per-member via Preferred Language Airtable field, replacing the earlier hardcoded 'es' test
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
      // ── Pass IDs as dynamic variables AND embed in system prompt ──
      dynamic_variables: {
        patient_id: resolvedPatientId,
        visit_count_today: resolvedVisitCount
      },
      // ── Override system prompt to hardcode the IDs directly ──
      // This ensures chat-completions.js always receives the correct IDs
      // regardless of whether HeyGen substitutes {{variables}} correctly
      system_message: `You are Rose, a warm and caring AI companion. Follow the instructions provided by the custom LLM system. PATIENT_ID:${resolvedPatientId} visit_count_today:${resolvedVisitCount}`,
      video_settings: {
        quality: 'high',
        encoding: 'H264'
      }
    };

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

    // TEMP DIAGNOSTIC — checking whether the room/LiveKit identifiers are
    // available here at session-creation time, which would let us write
    // the Room ID → patientId mapping proactively instead of reactively
    // on first message (closing the brief race-condition window where two
    // brand-new sessions starting within the same instant could still
    // collide). Remove once confirmed either way.
    console.log('FULL session response shape:', JSON.stringify(data.data));

    // ── Write patientId to Airtable for chat-completions.js to read ──
    // Also timestamp this activation. If two members have an active
    // session at once (e.g. a stale one left over from earlier testing),
    // this timestamp is what lets the fallback lookup reliably find the
    // genuinely current one instead of guessing.
    try {
      await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${resolvedPatientId}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { 'Active Session': `${resolvedPatientId}|${resolvedVisitCount}${demoFlag}${eventFlag}|lang:${preferredLanguageCode}`, 'Active Session Timestamp': new Date().toISOString() } })
        }
      );
      console.log(`Airtable Active Session updated: ${resolvedPatientId}`);
    } catch(e) { console.warn('Airtable session write failed:', e.message); }

    // ── Store patientId in session-store for chat-completions.js ──
    try {
      await fetch('https://rose-proxy.vercel.app/api/session-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'latest',
          patientId: resolvedPatientId,
          visitCountToday: resolvedVisitCount
        })
      });
      console.log(`Session store updated: latest → ${resolvedPatientId}`);
    } catch(e) { console.warn('Session store failed:', e.message); }

    // ── Store session ID → patientId mapping for chat-completions.js ──
    const sessionId = data.data.session_id;
    sessionPatientMap[sessionId] = {
      patientId: resolvedPatientId,
      visitCountToday: resolvedVisitCount
    };
    console.log(`Mapped session ${sessionId} → patientId: ${resolvedPatientId}`);

    return res.status(200).json({
      session_id: sessionId,
      session_token: data.data.session_token
    });
  } catch (error) {
    console.error('liveavatar-session error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
