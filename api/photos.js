export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { patientId } = req.query || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  if (req.method === 'DELETE') {
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    try {
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const airtableData = await airtableRes.json();
      const f = airtableData.fields || {};
      const attachments = f['Family Photos'] || [];
      const photoLabels = f['Photo Labels'] || '';

      console.log('photos.js DEBUG attachments:', JSON.stringify(attachments));

      if (attachments.length === 0) return res.status(200).json({ url: null, label: null });

      const photoList = photoLabels.split(',').map(p => p.trim()).filter(Boolean);
      const photoMap = {};
      attachments.forEach((att, idx) => {
        if (photoList[idx]) photoMap[photoList[idx]] = att.url || att.thumbnails?.large?.url || '';
      });

      return res.status(200).json({ photoMap, attachments: attachments.length });
    } catch (e) {
      console.error('photos.js error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
