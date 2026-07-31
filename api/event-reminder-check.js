// ─────────────────────────────────────────────
//  /api/event-reminder-check
//  Polled periodically by the waiting screen (launch.html) while
//  no session is active. Once per day, per member, checks whether
//  their Entertainment Interests has a specific TODAY event with a
//  confirmed start time (a match, a game, a new episode airing).
//  If the current time is within 15 minutes of that confirmed
//  start time, tells the waiting screen to launch a short Rose
//  reminder session — once only per event, never repeated.
//
//  Deliberately conservative: if a time can't be confirmed with
//  real confidence, it does NOT guess a fallback time — it just
//  stays quiet for that member that day, same philosophy as the
//  morning Daily Interest Briefing.
//
//  GET ?patientId=X → { remind: bool, label?: string, minutesUntil?: number }
// ─────────────────────────────────────────────

// In-memory cache, one entry per patientId, reset daily.
// { [patientId]: { date, confirmed, label, eventMinutes, timeStr, reminded } }
const eventCache = {};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

async function callClaudeForEventTime(entertainmentInterests) {
  const ANTHROPIC_HEADERS = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };
  const systemPrompt = `You are checking today's TV/event schedule for someone's stated interests. Their interests: "${entertainmentInterests}".

Search the web to find out if there is a SPECIFIC, TIMED event happening TODAY that matches one of these interests (a match, game, tournament round, or new episode airing at a known time). Only look for events with a clearly stated start time — not general "it's tournament week" news.

Respond with ONLY raw JSON, no markdown fences, no other text, in exactly this shape:
{"confirmed": true or false, "time": "H:MM AM/PM" or null, "label": "short natural description" or null}

Set "confirmed": false if you cannot find a specific, clearly-stated start time for today. Do not guess or estimate a time. Use US Eastern time for the "time" field.`;

  const CLAUDE_BODY = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Check today\'s schedule now.' }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: ANTHROPIC_HEADERS, body: CLAUDE_BODY
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Anthropic API error');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return { confirmed: false, time: null, label: null };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId } = req.query || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  try {
    const today = todayKey();
    let cache = eventCache[patientId];

    if (!cache || cache.date !== today) {
      // Fresh day — look up the member's Entertainment Interests and, if
      // present, check for a confirmed timed event. Only runs once per
      // member per day regardless of how often the waiting screen polls.
      const airtableRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const airtableData = await airtableRes.json();
      const entertainmentInterests = airtableData.fields?.['Entertainment Interests'] || '';

      if (!entertainmentInterests) {
        cache = { date: today, confirmed: false, reminded: false };
      } else {
        const result = await callClaudeForEventTime(entertainmentInterests);
        const eventMinutes = result.confirmed ? parseTimeToMinutes(result.time) : null;
        cache = {
          date: today,
          confirmed: !!result.confirmed && eventMinutes !== null,
          label: result.label || null,
          timeStr: result.time || null,
          eventMinutes,
          reminded: false
        };
      }
      eventCache[patientId] = cache;
    }

    if (!cache.confirmed || cache.reminded) {
      return res.status(200).json({ remind: false });
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const minutesUntil = cache.eventMinutes - nowMinutes;

    // Fire once, any time from 15 minutes before through 2 minutes after
    // the confirmed start time (small grace window in case a poll cycle
    // gets skipped) — never again after that for this event.
    if (minutesUntil <= 15 && minutesUntil >= -2) {
      cache.reminded = true;
      return res.status(200).json({ remind: true, label: cache.label, minutesUntil });
    }

    return res.status(200).json({ remind: false, minutesUntil });
  } catch (e) {
    console.error('event-reminder-check error:', e.message);
    return res.status(200).json({ remind: false });
  }
}
