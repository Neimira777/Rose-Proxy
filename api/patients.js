export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, nmrtId } = req.query || {};

  try {
    // ── Single patient fetch by Airtable record ID ──
    if (id) {
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${id}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const data = await airtableRes.json();
      const f = data.fields || {};
      return res.status(200).json({
        id: data.id,
        name: f['Preferred Name'] || f['Patient Full Name'] || '',
        preferredCompanion: f['Preferred Companion'] || 'Rose',
        visitTimes: f['Visit Times'] || '',
        visitDuration: f['Visit Duration'] || 15,
        photoUrls: (f['Family Photos'] || []).map(a => a.url),
        photoLabels: f['Photo Labels'] || ''
      });
    }

    // ── Single patient fetch by NMR ID (for family photo upload portal) ──
    if (nmrtId) {
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula={Patient ID}="${nmrtId}"`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const data = await airtableRes.json();
      const record = data.records?.[0];
      if (!record) return res.status(404).json({ error: 'Client not found' });
      const f = record.fields || {};
      return res.status(200).json({
        id: record.id,
        name: f['Preferred Name'] || f['Patient Full Name'] || '',
        preferredCompanion: f['Preferred Companion'] || 'Rose',
        visitTimes: f['Visit Times'] || '',
        visitDuration: f['Visit Duration'] || 15
      });
    }

    // ── All clients fetch (for staff view if needed) ──
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    const data = await airtableRes.json();
    const patients = data.records
      .map(record => ({
        id: record.id,
        name: record.fields['Preferred Name'] || record.fields['Patient Full Name'] || '',
        preferredCompanion: record.fields['Preferred Companion'] || 'Rose',
        visitTimes: record.fields['Visit Times'] || '',
        visitDuration: record.fields['Visit Duration'] || 15
      }))
      .filter(p => p.name.trim() !== '');
    return res.status(200).json({ patients });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'Failed to load clients' });
  }
}
