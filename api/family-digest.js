// ─────────────────────────────────────────────
//  /api/family-digest
//  Read-only: lets the Family Hub show the family-facing weekly update
//  on how visits have been going. This is generated server-side in
//  api/session-summary.js, using its own privacy-filtered Claude call —
//  deliberately NOT the same text as the 'SessionNotes' field, which is
//  written in the companion's own memory voice and can include anything
//  the member shared.
//
//  Stored as a single stacked Airtable long-text field: 'FamilyDigest'
//  (newest entry first, separated by '\n\n---\n\n'), each entry shaped:
//    [Week ending <date>]
//    MOOD: <short phrase>
//    <2-4 sentence summary>
//
//  GET ?patientId=X → { entries: [{ weekLabel, mood, summary }, ...] }
// ─────────────────────────────────────────────

function parseDigest(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.split('\n\n---\n\n').map(block => {
    const weekMatch = block.match(/^\[(.+?)\]/);
    const moodMatch = block.match(/^MOOD:\s*(.+)$/m);
    const summary = block
      .replace(/^\[.+?\]\s*\n?/, '')
      .replace(/^MOOD:.*\n?/m, '')
      .trim();
    return {
      weekLabel: weekMatch ? weekMatch[1] : '',
      mood: moodMatch ? moodMatch[1].trim() : '',
      summary
    };
  }).filter(entry => entry.summary);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId } = req.query || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    const data = await airtableRes.json();
    const entries = parseDigest(data.fields?.['FamilyDigest'] || '');
    return res.status(200).json({ entries });
  } catch (e) {
    console.error('family-digest error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
