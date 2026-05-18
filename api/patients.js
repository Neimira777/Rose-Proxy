export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`
        }
      }
    );

    const data = await airtableRes.json();

    const patients = data.records.map(record => ({
      id: record.id,
      name: record.fields['Preferred Name'] || record.fields['Patient Full Name'] || 'Unknown'
    }));

    return res.status(200).json({ patients });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'Failed to load patients' });
  }
}
