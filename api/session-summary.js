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

    // ── Format with date ──
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const formattedSummary = `[${today}]\n${summary}`;

    // ── Read existing Session Notes ──
    const existingNotes = bufferData.fields?.['Session Notes'] || '';
    const allNotes = existingNotes
      ? formattedSummary + '\n\n---\n\n' + existingNotes
      : formattedSummary;
    const sessions = allNotes.split('\n\n---\n\n');
    const trimmedNotes = sessions.slice(0, 10).join('\n\n---\n\n');

    // ── Save summary to Session Notes ──
    const saveRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'SessionNotes': trimmedNotes } })
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
