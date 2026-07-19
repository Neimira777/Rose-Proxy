// ─────────────────────────────────────────────
//  session-summary.js
//  Called when a Rose session ends
//  Generates a warm summary of the conversation
//  and saves it to Airtable Session Notes field
//  POST /api/session-summary
//  Body: { patientId, messages }
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  try {
    // ── Read Conversation Buffer from Airtable ──
    const bufferRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    const bufferData = await bufferRes.json();
    const conversationText = bufferData.fields?.['Conversation Buffer'] || '';

    if (!conversationText.trim()) {
      console.log('No conversation buffer to summarize for', patientId);
      return res.status(200).json({ ok: true, message: 'No conversation to summarize' });
    }
    // ── Call Claude to generate summary ──
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are helping an AI companion named Rose remember her conversations with aging adults.

Here is a conversation between Rose and a member:

${conversationText}

Please write a brief, warm summary (3-5 sentences) that Rose can use to remember this conversation next time. Include:
- Main topics discussed
- Any memories or stories the member shared
- Emotional tone of the visit
- Anything notable mentioned (family, upcoming events, concerns, happy moments)

Write it as notes Rose would use. Be specific and personal — use details from the actual conversation. Write in third person about the member.`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const summary = claudeData.content?.[0]?.text || '';
    if (!summary) throw new Error('No summary generated');

    // ── If this member's profile is still incomplete, also try to extract
    // favorites and personality notes from this same conversation. Runs on
    // every session until the Personality Profile field is filled in, rather
    // than only the very first visit — a rushed first chat might not cover
    // much, so Rose keeps gently gathering this over a few visits instead.
    const existingPersonality = bufferData.fields?.['Personality Profile'] || '';
    let onboardingFields = {};
    if (!existingPersonality.trim()) {
      try {
        const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: `Read this conversation between Rose (an AI companion) and an aging adult member. Extract anything the member shared about their own preferences and personality — do NOT guess or invent anything not actually said.

Conversation:
${conversationText}

Respond with ONLY a JSON object, no other text, no markdown fences:
{
  "favoriteSongs": "comma-separated song titles the member mentioned liking, or empty string",
  "favoriteArtists": "comma-separated artists/musicians mentioned, or empty string",
  "favoriteFoods": "comma-separated foods mentioned, or empty string",
  "favoriteMovies": "comma-separated movies/shows mentioned, or empty string",
  "favoriteTopics": "comma-separated topics they lit up talking about, or empty string",
  "favoriteSports": "comma-separated sports mentioned, or empty string",
  "favoriteTeams": "comma-separated sports teams mentioned, or empty string",
  "pets": "any pets mentioned, current or past, or empty string",
  "spouseName": "spouse or partner's name if mentioned, or empty string",
  "spouseStatus": "one or two words on the spouse relationship if mentioned (e.g. 'married 40 years', 'widowed'), or empty string",
  "children": "names or brief description of children mentioned, or empty string",
  "grandchildren": "names or brief description of grandchildren mentioned, or empty string",
  "career": "what work they did, if mentioned, or empty string",
  "placesLived": "comma-separated places they've lived, if mentioned, or empty string",
  "specialMemories": "1-2 sentences on any special memory or story they shared, in their own spirit, or empty string",
  "faith": "their faith or spiritual tradition, only if they explicitly mentioned it, or empty string",
  "topicsToAvoid": "anything the member explicitly said they'd rather not discuss, or empty string — only include if they stated a real boundary themselves, never infer this",
  "personalityProfile": "1-3 warm sentences describing their personality, humor style, and how they like to be talked to — based only on how they actually came across in this conversation. Empty string if the conversation was too short or task-focused to tell."
}`
            }]
          })
        });
        const extractData = await extractRes.json();
        const rawText = (extractData.content?.[0]?.text || '{}').trim();
        onboardingFields = JSON.parse(rawText.replace(/^```json\s*|\s*```$/g, ''));
      } catch (extractErr) {
        console.error('Onboarding extraction failed (non-fatal):', extractErr.message);
      }
    }

    // ── Format with date ──
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const formattedSummary = `[${today}]\n${summary}`;

    // ── Read existing SessionNotes for stacking ──
    const existingNotes = bufferData.fields?.['SessionNotes'] || '';
    const allNotes = existingNotes
      ? formattedSummary + '\n\n---\n\n' + existingNotes
      : formattedSummary;
    const sessions = allNotes.split('\n\n---\n\n');
    const trimmedNotes = sessions.slice(0, 10).join('\n\n---\n\n');

    // ── Build the fields to save — SessionNotes always, plus any newly
    // extracted onboarding fields, but only where the field is currently
    // empty. Never overwrites data a family already entered manually.
    const fieldsToSave = { 'SessionNotes': trimmedNotes };
    const fieldMap = {
      favoriteSongs: 'Favorite Songs',
      favoriteArtists: 'Favorite Artists',
      favoriteFoods: 'Favorite Foods',
      favoriteMovies: 'Favorite Movies',
      favoriteTopics: 'Favorite Topics',
      favoriteSports: 'Favorite Sports',
      favoriteTeams: 'Favorite Teams',
      pets: 'Pets',
      spouseName: 'Spouse Name',
      spouseStatus: 'Spouse Status',
      children: 'Children',
      grandchildren: 'Grandchildren',
      career: 'Career',
      placesLived: 'Places Lived',
      specialMemories: 'Special Memories',
      faith: 'Faith',
      topicsToAvoid: 'Topics To Avoid',
      personalityProfile: 'Personality Profile'
    };
    for (const [key, airtableField] of Object.entries(fieldMap)) {
      const extractedValue = (onboardingFields[key] || '').trim();
      const currentValue = (bufferData.fields?.[airtableField] || '').trim();
      if (extractedValue && !currentValue) {
        fieldsToSave[airtableField] = extractedValue;
      }
    }
    if (Object.keys(fieldsToSave).length > 1) {
      console.log('Onboarding fields captured this session:', Object.keys(fieldsToSave).filter(k => k !== 'SessionNotes').join(', '));
    }

    // ── Save summary + any onboarding fields to Airtable ──
    const saveRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fieldsToSave })
      }
    );
    const saveData = await saveRes.json();
    if (!saveRes.ok) {
      console.error('Session Notes save failed:', JSON.stringify(saveData));
      throw new Error('Airtable Session Notes save failed: ' + JSON.stringify(saveData));
    }
    console.log('Session Notes saved successfully');

    // ── Clear Conversation Buffer ──
    const clearRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Conversation Buffer': '' } })
      }
    );
    if (!clearRes.ok) console.warn('Conversation Buffer clear failed');

    console.log(`Session summary saved for ${patientId}: ${summary.substring(0, 80)}...`);
    return res.status(200).json({ ok: true, summary });

  } catch (error) {
    console.error('Session summary error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
