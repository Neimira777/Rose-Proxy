// ─────────────────────────────────────────────
//  /api/entertainment-interests
//  Lets a family view/edit a member's Entertainment Interests
//  (sports teams, shows, tournaments they love to follow) from
//  the Family Hub. Rose uses this field each morning to check,
//  via web search, whether anything relevant is on today.
//
//  Stored as a single Airtable long-text field: 'Entertainment Interests'
//
//  GET  ?patientId=X              → { interests: "..." }
//  POST { patientId, interests }  → saves the full text, returns { ok, interests }
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const airtableUrl = (id) => `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${id}`;
  const headers = { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'GET') {
      const { patientId } = req.query || {};
      if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
      const airtableRes = await fetch(airtableUrl(patientId), { headers });
      const data = await airtableRes.json();
      return res.status(200).json({ interests: data.fields?.['Entertainment Interests'] || '' });
    }

    if (req.method === 'POST') {
      const { patientId, interests } = req.body || {};
      if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

      await fetch(airtableUrl(patientId), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { 'Entertainment Interests': (interests || '').trim() } })
      });
      return res.status(200).json({ ok: true, interests: (interests || '').trim() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('entertainment-interests error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
