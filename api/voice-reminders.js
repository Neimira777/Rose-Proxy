// ─────────────────────────────────────────────
//  /api/voice-reminders
//  Stores and retrieves a member's scheduled voice reminders — e.g.
//  "2:00 PM | Time to take your afternoon medication". Same storage
//  pattern as important-dates.js: one entry per line in a single
//  Airtable field, format "HH:MM|Label" (24-hour time), newline-separated.
//
//  GET    /api/voice-reminders?patientId=XXX
//         → { reminders: [{ time: "14:00", label: "..." }, ...] }
//  POST   /api/voice-reminders   body: { patientId, time, label }
//         → adds one reminder, returns updated { reminders }
//  DELETE /api/voice-reminders   body: { patientId, time, label }
//         → removes the matching reminder, returns updated { reminders }
// ─────────────────────────────────────────────
async function fetchReminders(patientId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
    { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
  );
  const data = await res.json();
  const raw = data.fields?.['Voice Reminders'] || '';
  return raw.split('\n').filter(Boolean).map(line => {
    const [time, ...rest] = line.split('|');
    return { time: (time || '').trim(), label: rest.join('|').trim() };
  }).filter(r => r.time && r.label);
}

async function saveReminders(patientId, reminders) {
  const raw = reminders.map(r => `${r.time}|${r.label}`).join('\n');
  await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
    {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Voice Reminders': raw } })
    }
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    try {
      const reminders = await fetchReminders(patientId);
      return res.status(200).json({ reminders });
    } catch (e) {
      console.error('voice-reminders GET error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { patientId, time, label } = req.body || {};
    if (!patientId || !time || !label) return res.status(400).json({ error: 'Missing patientId, time, or label' });
    try {
      const reminders = await fetchReminders(patientId);
      reminders.push({ time: time.trim(), label: label.trim() });
      await saveReminders(patientId, reminders);
      return res.status(200).json({ reminders });
    } catch (e) {
      console.error('voice-reminders POST error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { patientId, time, label } = req.body || {};
    if (!patientId || !time || !label) return res.status(400).json({ error: 'Missing patientId, time, or label' });
    try {
      const reminders = await fetchReminders(patientId);
      const filtered = reminders.filter(r => !(r.time === time.trim() && r.label === label.trim()));
      await saveReminders(patientId, filtered);
      return res.status(200).json({ reminders: filtered });
    } catch (e) {
      console.error('voice-reminders DELETE error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
