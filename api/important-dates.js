// ─────────────────────────────────────────────
//  /api/important-dates
//  Manages a member's important dates (birthdays, appointments,
//  anniversaries) so Rose can naturally bring them up in conversation
//  as they approach.
//
//  Stored as a single Airtable long-text field, one entry per line,
//  in the format: YYYY-MM-DD|Label text
//
//  GET    ?patientId=X          → { dates: [{ date, label }] }
//  POST   { patientId, date, label }   → adds one entry
//  DELETE { patientId, date, label }   → removes the matching entry
// ─────────────────────────────────────────────

function parseDates(raw) {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [date, ...rest] = line.split('|');
    return { date: (date || '').trim(), label: rest.join('|').trim() };
  }).filter(d => d.date && d.label);
}

function serializeDates(dates) {
  return dates
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => `${d.date}|${d.label}`)
    .join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
      const dates = parseDates(data.fields?.['Important Dates']);
      return res.status(200).json({ dates });
    }

    if (req.method === 'POST') {
      const { patientId, date, label } = req.body || {};
      if (!patientId || !date || !label) return res.status(400).json({ error: 'Missing patientId, date, or label' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });

      const getRes = await fetch(airtableUrl(patientId), { headers });
      const current = await getRes.json();
      const dates = parseDates(current.fields?.['Important Dates']);
      dates.push({ date, label: label.trim() });

      await fetch(airtableUrl(patientId), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { 'Important Dates': serializeDates(dates) } })
      });
      return res.status(200).json({ ok: true, dates });
    }

    if (req.method === 'DELETE') {
      const { patientId, date, label } = req.body || {};
      if (!patientId || !date || !label) return res.status(400).json({ error: 'Missing patientId, date, or label' });

      const getRes = await fetch(airtableUrl(patientId), { headers });
      const current = await getRes.json();
      const dates = parseDates(current.fields?.['Important Dates']).filter(
        d => !(d.date === date && d.label === label)
      );

      await fetch(airtableUrl(patientId), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { 'Important Dates': serializeDates(dates) } })
      });
      return res.status(200).json({ ok: true, dates });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('important-dates error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
