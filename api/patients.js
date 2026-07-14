export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, nmrtId } = req.query || {};

  // ── POST — increment visit count ──
  if (req.method === 'POST') {
    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    try {
      // Fetch current visit count and date
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const data = await airtableRes.json();
      const f = data.fields || {};
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const storedDate = f['Visit Count Date'] || '';
      const currentCount = storedDate === today ? (f['Visit Count Today'] || 0) : 0;
      const newCount = currentCount + 1;

      // Save updated count and date
      await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Visit Count Today': newCount,
              'Visit Count Date': today
            }
          })
        }
      );

      console.log(`Visit count for ${patientId}: ${newCount} on ${today}`);
      return res.status(200).json({ visitCount: newCount, date: today });
    } catch (e) {
      console.error('Visit count error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    // ── Single patient fetch by Airtable record ID ──
    if (id) {
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${id}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const data = await airtableRes.json();
      const f = data.fields || {};

      // Calculate today's visit count (reset if date changed)
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const storedDate = f['Visit Count Date'] || '';
      const visitCountToday = storedDate === today ? (f['Visit Count Today'] || 0) : 0;

      return res.status(200).json({
        id: data.id,
        name: f['Preferred Name'] || f['Patient Full Name'] || '',
        preferredCompanion: f['Preferred Companion'] || 'Rose',
        visitTimes: f['Visit Times'] || '',
        visitDuration: f['Visit Duration'] || 15,
        visitCountToday,
        photoUrls: (f['Family Photos'] || []).map(a => a.url),
        photoLabels: f['Photo Labels'] || ''
      });
    }

    // ── Single patient fetch by NMR ID (for family photo upload portal) ──
    if (nmrtId) {
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula={Client ID}="${nmrtId}"`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const data = await airtableRes.json();
      const record = data.records?.[0];
      if (!record) return res.status(404).json({ error: 'Member not found' });
      const f = record.fields || {};
      return res.status(200).json({
        id: record.id,
        name: f['Preferred Name'] || f['Patient Full Name'] || '',
        preferredCompanion: f['Preferred Companion'] || 'Rose',
        visitTimes: f['Visit Times'] || '',
        visitDuration: f['Visit Duration'] || 15
      });
    }

    // ── All clients fetch ──
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
