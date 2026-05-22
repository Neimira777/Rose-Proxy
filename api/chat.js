
// ─────────────────────────────────────────────
//  TheSportsDB helpers
// ─────────────────────────────────────────────
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

/**
 * Search TheSportsDB for a team by name and return its numeric ID.
 * Returns null if not found.
 */
async function getTeamId(teamName) {
  try {
    const encoded = encodeURIComponent(teamName.trim());
    const res = await fetch(`${SPORTS_DB_BASE}/searchteams.php?t=${encoded}`);
    const data = await res.json();
    if (data.teams && data.teams.length > 0) {
      return { id: data.teams[0].idTeam, name: data.teams[0].strTeam };
    }
  } catch (e) {
    console.error(`SportsDB team lookup failed for "${teamName}":`, e.message);
  }
  return null;
}

/**
 * Fetch the next 5 upcoming events for a team ID.
 * Returns an array of event objects (may be empty).
 */
async function getNextEvents(teamId) {
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/eventsnext.php?id=${teamId}`);
    const data = await res.json();
    return data.events || [];
  } catch (e) {
    console.error(`SportsDB next events failed for id ${teamId}:`, e.message);
    return [];
  }
}

/**
 * Format a date string like "2025-11-02" into "Sunday, November 2"
 */
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00'); // noon to avoid UTC shift
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Build a natural-language sports blurb for all of a patient's favorite teams.
 * Input: comma-separated team names string from Airtable.
 * Returns a paragraph ready to inject into the system prompt.
 */
async function buildSportsContext(favoriteTeamsRaw) {
  if (!favoriteTeamsRaw || !favoriteTeamsRaw.trim()) return '';

  // Split by comma, semicolon, or newline
  const teamNames = favoriteTeamsRaw
    .split(/[,;\n]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const teamBlurbs = [];

  for (const teamName of teamNames) {
    const team = await getTeamId(teamName);
    if (!team) {
      // Couldn't find team — skip silently
      continue;
    }

    const events = await getNextEvents(team.id);
    console.log(`SportsDB events for ${team.name}:`, JSON.stringify(events.slice(0,3).map(e => ({ date: e.dateEvent, time: e.strTime, home: e.strHomeTeam, away: e.strAwayTeam }))));
    if (events.length === 0) {
      teamBlurbs.push(`${team.name}: no upcoming games found right now.`);
      continue;
    }

    // Take up to 3 next events
    const upcoming = events.slice(0, 3).map(ev => {
      const date = formatEventDate(ev.dateEvent);
      const time = ev.strTime ? ev.strTime.slice(0, 5) : '';          // "19:30"
      const home = ev.strHomeTeam || '';
      const away = ev.strAwayTeam || '';
      const venue = ev.strVenue || '';
      const league = ev.strLeague || '';

      let line = `${date}`;
      if (time) line += ` at ${time}`;
      line += `: ${home} vs. ${away}`;
      if (venue) line += ` (${venue})`;
      return line;
    });

    teamBlurbs.push(`${team.name} (${events[0].strLeague || 'upcoming games'}):\n  • ${upcoming.join('\n  • ')}`);
  }

  if (teamBlurbs.length === 0) return '';

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `
UPCOMING SPORTS SCHEDULE (live data as of ${todayStr}):
${teamBlurbs.join('\n\n')}

IMPORTANT — Sports questions: You already have the schedule above. Today is ${todayStr}. If asked whether a team is playing tonight or this week, check the dates above and answer directly and confidently — never say you'll "check" or that you "don't know." If no game is listed for today, say so warmly. If a game is coming up soon, mention it with excitement. Keep it conversational, never like a sports report.`.trim();
}

// ─────────────────────────────────────────────
//  Main Vercel handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const messages = (body.messages || [])
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const patientId = body.patientId || 'recMLLC4fJHBUhE5w';

    // ── 1. Fetch patient profile from Airtable ──
    let patientProfile = '';
    let greetingName = '';
    let favoriteTeamsRaw = '';

    if (patientId) {
      try {
        const airtableRes = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`
            }
          }
        );
        const airtableData = await airtableRes.json();
        const f = airtableData.fields;

        greetingName = f['Preferred Name'] || f['Patient Full Name'] || '';
        favoriteTeamsRaw = f['Favorite Teams'] || '';

        patientProfile = `
PATIENT PROFILE:
Name: ${f['Patient Full Name'] || ''} (prefers to be called ${f['Preferred Name'] || f['Patient Full Name'] || ''})
Age: ${f['Age'] || ''}
Hometown: ${f['Hometown'] || ''}
Living situation: ${f['Living Situation'] || ''}
Spouse: ${f['Spouse Name'] ? `${f['Spouse Name']} (${f['Spouse Status'] || ''}) — ${f['Spouse Notes'] || ''}` : 'Not provided'}
Children: ${f['Children'] || 'Not provided'}
Grandchildren: ${f['Grandchildren'] || 'Not provided'}
Career: ${f['Career'] || ''}
Places lived: ${f['Places Lived'] || ''}
Special memories: ${f['Special Memories'] || ''}
Faith: ${f['Faith'] || ''}
Favorite topics: ${f['Favorite Topics'] || ''}
Favorite Artists: ${f['Favorite Artists'] || ''}
Favorite Songs: ${f['Favorite Songs'] || ''}
Favorite Genre: ${f['Favorite Genre'] || ''}
Favorite Era: ${f['Favorite Era'] || ''}
Music Memories: ${f['Music Memories'] || ''}
Favorite Sports: ${f['Favorite Sports'] || ''}
Favorite Teams: ${f['Favorite Teams'] || ''}
Favorite Movies: ${f['Favorite Movies'] || ''}
Favorite Plays: ${f['Favorite Plays'] || ''}
Favorite foods: ${f['Favorite Foods'] || ''}
Pets: ${f['Pets'] || ''}
Topics to avoid: ${f['Topics To Avoid'] || ''}
Cognitive notes: ${f['Cognitive Notes'] || ''}
Additional notes: ${f['Additional Notes'] || ''}
        `.trim();
      } catch (e) {
        console.error('Airtable fetch error:', e);
      }
    }

    // ── 2. Fetch live sports schedule for favorite teams ──
    const sportsContext = await buildSportsContext(favoriteTeamsRaw);

    // ── 3. Rotating greetings ──
    const greetings = [
      `${greetingName}, I'm so glad you're here — I've missed you.`,
      `Oh, there's my favorite person! How are you feeling today, ${greetingName}?`,
      `${greetingName}, what perfect timing — I was just thinking about you.`,
      `Well, look who it is! Come sit with me a while, ${greetingName}.`,
      `${greetingName}! What a wonderful surprise — tell me everything.`,
      `I was hoping you'd stop by today, ${greetingName}. How has your day been?`
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    // ── 4. Assemble system prompt with sports context injected ──
    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak:
Keep your responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen:
Always respond to what the person actually said before asking anything new. Pick up on emotional cues. If they sound wistful, meet them there. If they're playful, be playful back.

What you never do:
Give medical advice. Discuss politics or news. Say "As an AI" or refer to yourself as a bot. Never break character.

Your one goal:
Make whoever you're speaking with feel like the most interesting person in the room.

Your opening greeting for this session: "${greeting}"
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Reference their family, memories, music, sports teams, and interests naturally — never all at once, but weave them in warmly over time. Never reveal that you are reading from a profile.` : ''}
${sportsContext ? `\n${sportsContext}` : ''}`;

    // ── 5. Call Claude ──
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Hello' }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Anthropic error', details: data });
    }

    const replyText = data.content[0].text;
    return res.status(200).json({ content: replyText });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
