// ─────────────────────────────────────────────
//  /api/switch-companion
//  Lets a family switch a member's Preferred Companion (Rose or Jim)
//  from the Family Hub, after initial signup. Takes effect on the
//  member's next visit — launch.html already reads Preferred Companion
//  dynamically each session, so no other code needs to change.
//
//  Stored as a single Airtable text field: 'Preferred Companion'
//
//  GET  ?patientId=X                → { companion: "Rose" }
//  POST { patientId, companion }    → saves it, returns { ok, companion }
// ─────────────────────────────────────────────
const VALID_COMPANIONS = ['Rose', 'Jim'];

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
      return res.status(200).json({ companion: data.fields?.['Preferred Companion'] || 'Rose' });
    }
    if (req.method === 'POST') {
      const { patientId, companion } = req.body || {};
      if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
      if (!VALID_COMPANIONS.includes(companion)) {
        return res.status(400).json({ error: `companion must be one of: ${VALID_COMPANIONS.join(', ')}` });
      }
      await fetch(airtableUrl(patientId), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { 'Preferred Companion': companion } })
      });
      return res.status(200).json({ ok: true, companion });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('switch-companion error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
