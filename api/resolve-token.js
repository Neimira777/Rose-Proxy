// ─────────────────────────────────────────────
//  /api/resolve-token
//  Looks up a member's opaque access token and returns their real
//  Airtable record ID (plus first name, for the identity-check gate).
//  This keeps the raw Airtable ID out of shared links entirely.
//
//  GET /api/resolve-token?token=XXXX
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula={Access Token}="${token}"`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    const data = await airtableRes.json();
    const record = data.records?.[0];

    if (!record) {
      return res.status(404).json({ error: 'Invalid or expired link' });
    }

    const f = record.fields || {};
    return res.status(200).json({
      patientId: record.id,
      name: f['Preferred Name'] || f['Client Full Name'] || '',
      preferredCompanion: f['Preferred Companion'] || 'Rose'
    });
  } catch (e) {
    console.error('Token resolution error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
