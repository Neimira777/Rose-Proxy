// ─────────────────────────────────────────────
//  api/daily-budget.js
//  Daily HeyGen credit budget per member — Bergen pilot cost control.
//
//  Each member gets DAILY_BUDGET_CREDITS credits/day (2 credits = 1 minute
//  of full conversational mode), resetting at midnight in the member's
//  local timezone (derived from Hometown via the same helper
//  chat-completions.js already uses, defaulting to America/New_York when
//  Hometown is blank — there is no dedicated timezone field in Airtable
//  today).
//
//  Usage is tracked in a dedicated DailyUsage table, one row per member
//  per local calendar day, keyed on "Usage Key" = "{patientId}_{dateKey}".
//  A new day simply has no row yet, so the daily reset is free — no
//  separate reset job needed. This also leaves a full per-day usage
//  history in Airtable for reviewing pilot cost data.
//
//  GET  ?patientId=X            → read current usage/remaining, does NOT
//                                  write anything. Used both as the
//                                  pre-session "can this member start a
//                                  visit" gate (launch.html) and as the
//                                  per-turn taper check (chat-completions.js).
//  POST { patientId, creditsDelta } → adds creditsDelta to today's running
//                                  total (upserts the day's row) and
//                                  returns the same shape as GET. Called
//                                  continuously (~every 20s) while a
//                                  session is active, from launch.html.
//
//  Isolation: every Airtable call here is try/caught. On any failure this
//  endpoint fails OPEN — it reports canStart:true / a generous remaining
//  balance with ok:false, rather than ever blocking or ending a member's
//  visit because of a logging problem. This mirrors how SessionNotes
//  writes are already isolated elsewhere in this codebase, and matches
//  this repo's standing "don't break a working feature" priority — the
//  tradeoff is that the credit cap has no teeth during an Airtable outage,
//  which is an accepted risk for a 5-8 person pilot.
// ─────────────────────────────────────────────

const DAILY_BUDGET_CREDITS = 40;       // 40 credits/day = 20 minutes of full conversational mode
const TAPER_THRESHOLD_CREDITS = 4;     // ~2 minutes remaining — soft "start wrapping up" instruction

// ── Timezone detection — duplicated from chat-completions.js on purpose.
// Every api/*.js file in this repo is a standalone Vercel function with no
// shared lib/ folder (see ANTHROPIC_HEADERS being duplicated the same way
// across chat-completions.js, session-summary.js, and event-reminder-check.js),
// so this follows the existing convention rather than introducing a new
// shared-module pattern for one helper. ──
function getTimezoneFromHometown(hometown) {
  if (!hometown) return 'America/New_York';
  const h = hometown.toLowerCase();
  if (h.includes('los angeles') || h.includes('san francisco') || h.includes('seattle') ||
      h.includes('portland') || h.includes('san diego') || h.includes('las vegas') ||
      h.includes('california') || h.includes('washington') || h.includes('oregon') ||
      h.includes('nevada')) return 'America/Los_Angeles';
  if (h.includes('arizona') || h.includes('phoenix')) return 'America/Phoenix';
  if (h.includes('denver') || h.includes('salt lake') || h.includes('colorado') ||
      h.includes('utah') || h.includes('montana') || h.includes('wyoming') ||
      h.includes('idaho')) return 'America/Denver';
  if (h.includes('chicago') || h.includes('dallas') || h.includes('houston') ||
      h.includes('minneapolis') || h.includes('kansas city') || h.includes('new orleans') ||
      h.includes('nashville') || h.includes('texas') || h.includes('illinois') ||
      h.includes('minnesota') || h.includes('missouri') || h.includes('louisiana') ||
      h.includes('tennessee') || h.includes('wisconsin') || h.includes('iowa')) return 'America/Chicago';
  return 'America/New_York';
}

// en-CA locale formats as YYYY-MM-DD directly, which is exactly the date
// key format this table uses — no manual zero-padding/splitting needed.
function getLocalDateKey(timezone) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

async function fetchHometown(patientId) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
    { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
  );
  const data = await res.json();
  return data.fields?.['Hometown'] || '';
}

async function fetchUsageRecord(usageKey) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/DailyUsage?filterByFormula=${encodeURIComponent(`{Usage Key}="${usageKey}"`)}&maxRecords=1`,
    { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
  );
  const data = await res.json();
  return data.records?.[0] || null;
}

function summarize(creditsUsedToday, dateKey, timezone) {
  const creditsRemaining = Math.max(DAILY_BUDGET_CREDITS - creditsUsedToday, 0);
  return {
    ok: true,
    budgetTotal: DAILY_BUDGET_CREDITS,
    creditsUsedToday,
    creditsRemaining,
    canStart: creditsRemaining > 0,
    tapering: creditsRemaining <= TAPER_THRESHOLD_CREDITS,
    dateKey,
    timezone
  };
}

// Generous fail-open response — used whenever we can't reliably read/write
// usage. Reports the full budget as available so a transient Airtable
// problem never blocks or ends a real member's visit.
function failOpenResponse(reason) {
  return {
    ok: false,
    error: reason,
    budgetTotal: DAILY_BUDGET_CREDITS,
    creditsUsedToday: 0,
    creditsRemaining: DAILY_BUDGET_CREDITS,
    canStart: true,
    tapering: false,
    dateKey: null,
    timezone: null
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { patientId } = req.query || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

    try {
      const hometown = await fetchHometown(patientId);
      const timezone = getTimezoneFromHometown(hometown);
      const dateKey = getLocalDateKey(timezone);
      const usageKey = `${patientId}_${dateKey}`;

      const record = await fetchUsageRecord(usageKey);
      const creditsUsedToday = record?.fields?.['Credits Used Today'] || 0;
      const summary = summarize(creditsUsedToday, dateKey, timezone);

      console.log(`[BUDGET] ${new Date().toISOString()} GET check — patientId=${patientId} dateKey=${dateKey} tz=${timezone} used=${creditsUsedToday.toFixed(2)} remaining=${summary.creditsRemaining.toFixed(2)} canStart=${summary.canStart} tapering=${summary.tapering}`);
      return res.status(200).json(summary);
    } catch (e) {
      console.error(`[BUDGET] ${new Date().toISOString()} GET check FAILED (failing open) — patientId=${patientId}:`, e.message);
      return res.status(200).json(failOpenResponse(e.message));
    }
  }

  if (req.method === 'POST') {
    const { patientId, creditsDelta } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
    const delta = Number(creditsDelta);
    if (!Number.isFinite(delta) || delta < 0) return res.status(400).json({ error: 'Invalid creditsDelta' });

    try {
      const hometown = await fetchHometown(patientId);
      const timezone = getTimezoneFromHometown(hometown);
      const dateKey = getLocalDateKey(timezone);
      const usageKey = `${patientId}_${dateKey}`;
      const nowIso = new Date().toISOString();

      const record = await fetchUsageRecord(usageKey);
      const priorUsed = record?.fields?.['Credits Used Today'] || 0;
      const newUsed = priorUsed + delta;

      if (record) {
        await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/DailyUsage/${record.id}`,
          {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Credits Used Today': newUsed, 'Last Updated': nowIso } })
          }
        );
      } else {
        await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/DailyUsage`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Usage Key': usageKey, 'Patient ID': patientId, 'Date': dateKey, 'Credits Used Today': newUsed, 'Last Updated': nowIso } })
          }
        );
      }

      const summary = summarize(newUsed, dateKey, timezone);
      console.log(`[BUDGET] ${nowIso} usage write — patientId=${patientId} dateKey=${dateKey} delta=${delta.toFixed(2)} used=${newUsed.toFixed(2)} remaining=${summary.creditsRemaining.toFixed(2)} tapering=${summary.tapering}`);
      return res.status(200).json(summary);
    } catch (e) {
      // Isolated the same way SessionNotes writes are isolated elsewhere —
      // a failure to log usage must never crash or block the member's
      // active session. The caller (launch.html) treats ok:false as "skip
      // this tick," never as a signal to end the session.
      console.error(`[BUDGET] ${new Date().toISOString()} usage write FAILED (non-fatal) — patientId=${patientId}:`, e.message);
      return res.status(200).json(failOpenResponse(e.message));
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
