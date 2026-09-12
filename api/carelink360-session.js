// ─────────────────────────────────────────────
//  carelink360-session.js
//  Partner-facing endpoint: lets CareLink360's app get a launch URL for one
//  of their users, without ever seeing our internal Airtable record IDs.
//
//  Every other endpoint in this codebase trusts any caller — fine while
//  only our own frontend ever called them, but this is the first endpoint
//  meant for an outside partner to call directly. It requires CareLink360's
//  own API key (issued to them, checked against CARELINK360_API_KEY) before
//  it will resolve anything, on top of the member-identifying token.
//
//  POST /api/carelink360-session
//  Headers: X-CareLink360-Api-Key: <key>
//  Body:    { memberToken }  — the same opaque per-member Access Token
//                                already used for family-hub links, so this
//                                reuses that scheme rather than inventing a
//                                second one.
//  Returns: { launchUrl }
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CareLink360-Api-Key');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Partner authentication — fails closed if the key isn't configured ──
  const apiKey = req.headers['x-carelink360-api-key'];
  const expectedKey = process.env.CARELINK360_API_KEY;
  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid or missing partner API key' });
  }

  const { memberToken } = req.body || {};
  if (!memberToken) return res.status(400).json({ error: 'Missing memberToken' });

  try {
    // ── Confirm the token actually belongs to a member before handing back
    // a URL for it — same lookup resolve-token.js uses at link-open time. ──
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula=${encodeURIComponent(`{Access Token}="${memberToken}"`)}`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    const data = await airtableRes.json();
    if (!data.records?.[0]) {
      return res.status(404).json({ error: 'Unknown member token' });
    }

    return res.status(200).json({
      // autostart=true skips the two tap screens and goes straight to
      // "Connecting…" — safe here because CareLink360's device doesn't use
      // Neimira's own music/reminders/soothing-sounds features, which is
      // what those taps otherwise unlock. Never add this to a regular
      // member's link (see launch.html's AUTOSTART comment).
      launchUrl: `https://app.neimira.com/launch.html?token=${encodeURIComponent(memberToken)}&autostart=true`
    });
  } catch (e) {
    console.error('CareLink360 session error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
