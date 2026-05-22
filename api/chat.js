
// ─────────────────────────────────────────────
//  TheSportsDB + MLB Stats API helpers
// ─────────────────────────────────────────────
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const MLB_API_BASE   = 'https://statsapi.mlb.com/api/v1';

/**
 * Team lookup table — TheSportsDB ID + MLB Stats API ID
 */
const TEAM_ID_LOOKUP = {
  // MLB
  'new york yankees':      { id: '135260', name: 'New York Yankees',       mlbId: 147  },
  'yankees':               { id: '135260', name: 'New York Yankees',       mlbId: 147  },
  'new york mets':         { id: '135270', name: 'New York Mets',          mlbId: 121  },
  'mets':                  { id: '135270', name: 'New York Mets',          mlbId: 121  },
  'boston red sox':        { id: '135253', name: 'Boston Red Sox',         mlbId: 111  },
  'red sox':               { id: '135253', name: 'Boston Red Sox',         mlbId: 111  },
  'los angeles dodgers':   { id: '135261', name: 'Los Angeles Dodgers',    mlbId: 119  },
  'dodgers':               { id: '135261', name: 'Los Angeles Dodgers',    mlbId: 119  },
  'chicago cubs':          { id: '135255', name: 'Chicago Cubs',           mlbId: 112  },
  'cubs':                  { id: '135255', name: 'Chicago Cubs',           mlbId: 112  },
  'san francisco giants':  { id: '135272', name: 'San Francisco Giants',   mlbId: 137  },
  'giants':                { id: '135272', name: 'San Francisco Giants',   mlbId: 137  },
  'philadelphia phillies': { id: '135268', name: 'Philadelphia Phillies',  mlbId: 143  },
  'phillies':              { id: '135268', name: 'Philadelphia Phillies',  mlbId: 143  },
  'atlanta braves':        { id: '135252', name: 'Atlanta Braves',         mlbId: 144  },
  'braves':                { id: '135252', name: 'Atlanta Braves',         mlbId: 144  },
  'houston astros':        { id: '135258', name: 'Houston Astros',         mlbId: 117  },
  'astros':                { id: '135258', name: 'Houston Astros',         mlbId: 117  },
  'chicago white sox':     { id: '135256', name: 'Chicago White Sox',      mlbId: 145  },
  'white sox':             { id: '135256', name: 'Chicago White Sox',      mlbId: 145  },
  // NFL
  'new york giants':       { id: '134925', name: 'New York Giants',        mlbId: null },
  'new york jets':         { id: '134926', name: 'New York Jets',          mlbId: null },
  'jets':                  { id: '134926', name: 'New York Jets',          mlbId: null },
  'dallas cowboys':        { id: '134916', name: 'Dallas Cowboys',         mlbId: null },
  'cowboys':               { id: '134916', name: 'Dallas Cowboys',         mlbId: null },
  'new england patriots':  { id: '134927', name: 'New England Patriots',   mlbId: null },
  'patriots':              { id: '134927', name: 'New England Patriots',   mlbId: null },
  'philadelphia eagles':   { id: '134928', name: 'Philadelphia Eagles',    mlbId: null },
  'eagles':                { id: '134928', name: 'Philadelphia Eagles',    mlbId: null },
  // NBA
  'new york knicks':       { id: '134860', name: 'New York Knicks',        mlbId: null },
  'knicks':                { id: '134860', name: 'New York Knicks',        mlbId: null },
  'brooklyn nets':         { id: '134853', name: 'Brooklyn Nets',          mlbId: null },
  'nets':                  { id: '134853', name: 'Brooklyn Nets',          mlbId: null },
  'boston celtics':        { id: '134852', name: 'Boston Celtics',         mlbId: null },
  'celtics':               { id: '134852', name: 'Boston Celtics',         mlbId: null },
  'los angeles lakers':    { id: '134858', name: 'Los Angeles Lakers',     mlbId: null },
  'lakers':                { id: '134858', name: 'Los Angeles Lakers',     mlbId: null },
  // NHL
  'new york rangers':      { id: '134942', name: 'New York Rangers',       mlbId: null },
  'rangers':               { id: '134942', name: 'New York Rangers',       mlbId: null },
  'new jersey devils':     { id: '134940', name: 'New Jersey Devils',      mlbId: null },
  'devils':                { id: '134940', name: 'New Jersey Devils',      mlbId: null },
  'philadelphia flyers':   { id: '134943', name: 'Philadelphia Flyers',    mlbId: null },
  'flyers':                { id: '134943', name: 'Philadelphia Flyers',    mlbId: null },
};

/**
 * Look up a team — hardcoded table first, API search as fallback.
 */
async function getTeamId(teamName) {
  const key = teamName.trim().toLowerCase();
  if (TEAM_ID_LOOKUP[key]) {
    console.log(`Team lookup (hardcoded): ${TEAM_ID_LOOKUP[key].name}`);
    return TEAM_ID_LOOKUP[key];
  }
  try {
    const encoded = encodeURIComponent(teamName.trim());
    const res = await fetch(`${SPORTS_DB_BASE}/searchteams.php?t=${encoded}`);
    const data = await res.json();
    if (data.teams && data.teams.length > 0) {
      console.log(`Team lookup (API search): ${data.teams[0].strTeam}`);
      return { id: data.teams[0].idTeam, name: data.teams[0].strTeam, mlbId: null };
    }
  } catch (e) {
    console.error(`SportsDB team lookup failed for "${teamName}":`, e.message);
  }
  return null;
}

/**
 * Fetch next 5 upcoming events from TheSportsDB.
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
 * Fetch active roster + top player stats from MLB Stats API.
 * Returns a formatted string or empty string if not an MLB team.
 */
async function getMlbRosterAndStats(mlbId, teamName) {
  if (!mlbId) return '';
  const season = new Date().getFullYear();

  try {
    // Fetch active roster
    const rosterRes = await fetch(`${MLB_API_BASE}/teams/${mlbId}/roster?rosterType=active`);
    const rosterData = await rosterRes.json();
    const roster = rosterData.roster || [];

    if (roster.length === 0) return '';

    // Fetch season hitting stats for the team
    const statsRes = await fetch(
      `${MLB_API_BASE}/teams/${mlbId}/stats?stats=season&season=${season}&group=hitting&sportId=1`
    );
    const statsData = await statsRes.json();

    // Fetch season pitching stats
    const pitchRes = await fetch(
      `${MLB_API_BASE}/teams/${mlbId}/stats?stats=season&season=${season}&group=pitching&sportId=1`
    );
    const pitchData = await pitchRes.json();

    // Get individual player hitting stats (top hitters by at-bats)
    const playerStatsRes = await fetch(
      `${MLB_API_BASE}/stats?stats=season&season=${season}&group=hitting&sportId=1&teamId=${mlbId}&limit=10&offset=0`
    );
    const playerStatsData = await playerStatsRes.json();
    const hitters = (playerStatsData.stats?.[0]?.splits || [])
      .filter(s => s.stat.atBats >= 50)
      .sort((a, b) => parseFloat(b.stat.avg || 0) - parseFloat(a.stat.avg || 0))
      .slice(0, 5);

    // Get individual pitcher stats
    const pitcherStatsRes = await fetch(
      `${MLB_API_BASE}/stats?stats=season&season=${season}&group=pitching&sportId=1&teamId=${mlbId}&limit=10&offset=0`
    );
    const pitcherStatsData = await pitcherStatsRes.json();
    const pitchers = (pitcherStatsData.stats?.[0]?.splits || [])
      .filter(s => s.stat.inningsPitched >= 10)
      .sort((a, b) => parseFloat(a.stat.era || 99) - parseFloat(b.stat.era || 99))
      .slice(0, 3);

    // Format hitter lines
    const hitterLines = hitters.map(s => {
      const p = s.player?.fullName || 'Unknown';
      const avg = s.stat.avg || '.000';
      const hr  = s.stat.homeRuns || 0;
      const rbi = s.stat.rbi || 0;
      return `${p}: .${avg.replace('.', '')} AVG, ${hr} HR, ${rbi} RBI`;
    });

    // Format pitcher lines
    const pitcherLines = pitchers.map(s => {
      const p = s.player?.fullName || 'Unknown';
      const era = s.stat.era || '0.00';
      const w   = s.stat.wins || 0;
      const l   = s.stat.losses || 0;
      return `${p}: ${era} ERA, ${w}-${l}`;
    });

    // Roster position summary
    const positions = {};
    roster.forEach(p => {
      const pos = p.position?.type || 'Unknown';
      positions[pos] = (positions[pos] || 0) + 1;
    });
    const rosterSummary = Object.entries(positions)
      .map(([pos, count]) => `${count} ${pos}`)
      .join(', ');

    let result = `${teamName} Roster (${season} season): ${roster.length} active players (${rosterSummary})`;
    if (hitterLines.length > 0) {
      result += `\n  Top hitters:\n    • ${hitterLines.join('\n    • ')}`;
    }
    if (pitcherLines.length > 0) {
      result += `\n  Top pitchers:\n    • ${pitcherLines.join('\n    • ')}`;
    }

    console.log(`MLB stats fetched for ${teamName}: ${hitterLines.length} hitters, ${pitcherLines.length} pitchers`);
    return result;

  } catch (e) {
    console.error(`MLB stats fetch failed for ${teamName}:`, e.message);
    return '';
  }
}

/**
 * Format a date string like "2026-05-22" into "Friday, May 22"
 */
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Build the full sports context: schedule + roster + stats.
 */
async function buildSportsContext(favoriteTeamsRaw) {
  if (!favoriteTeamsRaw || !favoriteTeamsRaw.trim()) return '';

  const teamNames = favoriteTeamsRaw
    .split(/[,;\n]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const teamSections = [];

  for (const teamName of teamNames) {
    const team = await getTeamId(teamName);
    if (!team) {
      console.log(`Team not found: ${teamName}`);
      continue;
    }

    // Fetch schedule and MLB stats in parallel
    const [events, mlbInfo] = await Promise.all([
      getNextEvents(team.id),
      getMlbRosterAndStats(team.mlbId, team.name)
    ]);

    console.log(`SportsDB events for ${team.name}:`, JSON.stringify(
      events.slice(0, 3).map(e => ({ date: e.dateEvent, time: e.strTime, home: e.strHomeTeam, away: e.strAwayTeam }))
    ));

    let section = `── ${team.name} ──`;

    // Schedule
    if (events.length === 0) {
      section += `\nSchedule: No upcoming games found.`;
    } else {
      const upcoming = events.slice(0, 3).map(ev => {
        const date = formatEventDate(ev.dateEvent);
        const time = ev.strTime ? ev.strTime.slice(0, 5) : '';
        const home = ev.strHomeTeam || '';
        const away = ev.strAwayTeam || '';
        const venue = ev.strVenue || '';
        let line = date;
        if (time) line += ` at ${time}`;
        line += `: ${home} vs. ${away}`;
        if (venue) line += ` (${venue})`;
        return line;
      });
      section += `\nUpcoming games (${events[0].strLeague || ''}):\n  • ${upcoming.join('\n  • ')}`;
    }

    // Roster + stats (MLB only)
    if (mlbInfo) {
      section += `\n${mlbInfo}`;
    }

    teamSections.push(section);
  }

  if (teamSections.length === 0) return '';

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `
SPORTS INFO (live data as of ${todayStr}):
${teamSections.join('\n\n')}

IMPORTANT — Sports questions: You have live schedule, roster, and player stats above. Today is ${todayStr}. Answer sports questions directly and confidently using this data — never say you'll "check" or that you "don't know." Reference players by name naturally — e.g., "Judge has been on fire this season!" Keep it warm and conversational, never like a sports report.`.trim();
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

    // ── 2. Fetch live sports data (schedule + roster + stats) ──
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

    // ── 4. Assemble system prompt ──
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
