// ─────────────────────────────────────────────
//  Session cache — avoids re-fetching on every message
// ─────────────────────────────────────────────
const sessionCache = {};

function getCache(patientId) {
  return sessionCache[patientId] || null;
}

function setCache(patientId, data) {
  sessionCache[patientId] = {
    ...data,
    cachedAt: Date.now()
  };
}

function isCacheValid(patientId) {
  const cache = sessionCache[patientId];
  if (!cache) return false;
  // Cache valid for 30 minutes
  return (Date.now() - cache.cachedAt) < 30 * 60 * 1000;
}

// ─────────────────────────────────────────────
//  Seasonal + holiday context
// ─────────────────────────────────────────────
function getSeasonalContext(hometown) {
  const { monthName, dayName, dayNum, full, timeOfDay } = getLocalDateTime(hometown);
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Determine season
  let season = '';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';

  // Upcoming holidays (within ~2 weeks)
  const upcoming = [];

  const holidays = [
    { month: 1,  day: 1,  name: "New Year's Day" },
    { month: 2,  day: 14, name: "Valentine's Day" },
    { month: 3,  day: 17, name: "St. Patrick's Day" },
    { month: 4,  day: 1,  name: "Easter" },
    { month: 5,  day: 11, name: "Mother's Day" },
    { month: 5,  day: 26, name: "Memorial Day" },
    { month: 6,  day: 15, name: "Father's Day" },
    { month: 7,  day: 4,  name: "Independence Day" },
    { month: 9,  day: 1,  name: "Labor Day" },
    { month: 10, day: 31, name: "Halloween" },
    { month: 11, day: 11, name: "Veterans Day" },
    { month: 11, day: 27, name: "Thanksgiving" },
    { month: 12, day: 25, name: "Christmas" },
    { month: 12, day: 31, name: "New Year's Eve" },
  ];

  holidays.forEach(h => {
    const holidayDate = new Date(now.getFullYear(), h.month - 1, h.day);
    const daysUntil = Math.ceil((holidayDate - now) / (1000 * 60 * 60 * 24));
    if (daysUntil >= 0 && daysUntil <= 14) {
      upcoming.push({ name: h.name, daysUntil });
    }
  });

  // Season-based memory prompts
  const seasonPrompts = {
    spring: "Spring is here — blooming flowers, warmer days, Easter, Mother's Day. Great topics: gardening memories, spring traditions, family gatherings.",
    summer: "It's summer — warm weather, longer days, family vacations, Fourth of July. Great topics: summer traditions, beach or lake memories, cookouts, childhood summers.",
    fall: "Fall is arriving — changing leaves, cooler air, harvest time, Thanksgiving. Great topics: fall traditions, holiday cooking, family gatherings, football season.",
    winter: "It's winter — cozy indoors, holiday season, New Year's. Great topics: Christmas memories, holiday traditions, winter foods, family visits."
  };

  let context = `DATE & TIME CONTEXT:
Today is ${full}. It is currently ${timeOfDay} for the patient.
IMPORTANT: On the FIRST message of each session, naturally weave in the day and date — never as a quiz or reminder, just warmly in passing. For example: 'Good ${timeOfDay} — it's a lovely ${dayName}.' or 'Can you believe it's already ${monthName} ${dayNum}?'

SEASONAL CONTEXT:
It is currently ${season}. ${seasonPrompts[season]}`;

  if (upcoming.length > 0) {
    const holidayList = upcoming.map(h =>
      h.daysUntil === 0 ? `Today is ${h.name}!` :
      h.daysUntil === 1 ? `${h.name} is tomorrow!` :
      `${h.name} is in ${h.daysUntil} days.`
    ).join(' ');
    context += `\nUpcoming holidays: ${holidayList}`;
    context += `\nWeave upcoming holidays naturally into conversation — connect them to the patient's personal memories and traditions.`;
  }

  return context;
}

// ─────────────────────────────────────────────
//  Timezone detection from Hometown
// ─────────────────────────────────────────────
function getTimezoneFromHometown(hometown) {
  if (!hometown) return 'America/New_York';
  const h = hometown.toLowerCase();

  // Pacific
  if (h.includes('los angeles') || h.includes('san francisco') || h.includes('seattle') ||
      h.includes('portland') || h.includes('san diego') || h.includes('las vegas') ||
      h.includes('phoenix') || h.includes('california') || h.includes('washington') ||
      h.includes('oregon') || h.includes('nevada') || h.includes('arizona')) {
    return h.includes('arizona') || h.includes('phoenix') ? 'America/Phoenix' : 'America/Los_Angeles';
  }

  // Mountain
  if (h.includes('denver') || h.includes('salt lake') || h.includes('albuquerque') ||
      h.includes('colorado') || h.includes('utah') || h.includes('new mexico') ||
      h.includes('montana') || h.includes('wyoming') || h.includes('idaho')) {
    return 'America/Denver';
  }

  // Central
  if (h.includes('chicago') || h.includes('dallas') || h.includes('houston') ||
      h.includes('minneapolis') || h.includes('kansas city') || h.includes('new orleans') ||
      h.includes('nashville') || h.includes('memphis') || h.includes('oklahoma') ||
      h.includes('texas') || h.includes('illinois') || h.includes('minnesota') ||
      h.includes('missouri') || h.includes('louisiana') || h.includes('tennessee') ||
      h.includes('wisconsin') || h.includes('iowa') || h.includes('arkansas')) {
    return 'America/Chicago';
  }

  // Default Eastern
  return 'America/New_York';
}

function getLocalDateTime(hometown) {
  const timezone = getTimezoneFromHometown(hometown);
  const now = new Date();

  const localDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  const dayName = localDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  const monthName = localDate.toLocaleDateString('en-US', { month: 'long', timeZone: timezone });
  const dayNum = localDate.toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone });
  const hour = localDate.getHours();

  let timeOfDay = '';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  return {
    dayName,
    monthName,
    dayNum,
    hour,
    timeOfDay,
    full: `${dayName}, ${monthName} ${dayNum}`
  };
}

// ─────────────────────────────────────────────
//  Morning music detection (uses local time)
// ─────────────────────────────────────────────
function isMorningSession(hometown) {
  const { hour } = getLocalDateTime(hometown);
  return hour >= 6 && hour <= 11;
}

// ─────────────────────────────────────────────
//  TheSportsDB + MLB Stats API helpers
// ─────────────────────────────────────────────
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const MLB_API_BASE   = 'https://statsapi.mlb.com/api/v1';

const TEAM_ID_LOOKUP = {
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
  'new york giants':       { id: '134925', name: 'New York Giants',        mlbId: null },
  'new york jets':         { id: '134926', name: 'New York Jets',          mlbId: null },
  'jets':                  { id: '134926', name: 'New York Jets',          mlbId: null },
  'dallas cowboys':        { id: '134916', name: 'Dallas Cowboys',         mlbId: null },
  'cowboys':               { id: '134916', name: 'Dallas Cowboys',         mlbId: null },
  'new england patriots':  { id: '134927', name: 'New England Patriots',   mlbId: null },
  'patriots':              { id: '134927', name: 'New England Patriots',   mlbId: null },
  'philadelphia eagles':   { id: '134928', name: 'Philadelphia Eagles',    mlbId: null },
  'eagles':                { id: '134928', name: 'Philadelphia Eagles',    mlbId: null },
  'new york knicks':       { id: '134860', name: 'New York Knicks',        mlbId: null },
  'knicks':                { id: '134860', name: 'New York Knicks',        mlbId: null },
  'brooklyn nets':         { id: '134853', name: 'Brooklyn Nets',          mlbId: null },
  'nets':                  { id: '134853', name: 'Brooklyn Nets',          mlbId: null },
  'boston celtics':        { id: '134852', name: 'Boston Celtics',         mlbId: null },
  'celtics':               { id: '134852', name: 'Boston Celtics',         mlbId: null },
  'los angeles lakers':    { id: '134858', name: 'Los Angeles Lakers',     mlbId: null },
  'lakers':                { id: '134858', name: 'Los Angeles Lakers',     mlbId: null },
  'new york rangers':      { id: '134942', name: 'New York Rangers',       mlbId: null },
  'rangers':               { id: '134942', name: 'New York Rangers',       mlbId: null },
  'new jersey devils':     { id: '134940', name: 'New Jersey Devils',      mlbId: null },
  'devils':                { id: '134940', name: 'New Jersey Devils',      mlbId: null },
  'philadelphia flyers':   { id: '134943', name: 'Philadelphia Flyers',    mlbId: null },
  'flyers':                { id: '134943', name: 'Philadelphia Flyers',    mlbId: null },
};

async function getTeamId(teamName) {
  const key = teamName.trim().toLowerCase();
  if (TEAM_ID_LOOKUP[key]) return TEAM_ID_LOOKUP[key];
  try {
    const encoded = encodeURIComponent(teamName.trim());
    const res = await fetch(`${SPORTS_DB_BASE}/searchteams.php?t=${encoded}`);
    const data = await res.json();
    if (data.teams && data.teams.length > 0) {
      return { id: data.teams[0].idTeam, name: data.teams[0].strTeam, mlbId: null };
    }
  } catch (e) {
    console.error(`SportsDB team lookup failed for "${teamName}":`, e.message);
  }
  return null;
}

async function getNextEvents(teamId) {
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/eventsnext.php?id=${teamId}`);
    const data = await res.json();
    return data.events || [];
  } catch (e) {
    return [];
  }
}

async function getMlbRosterAndStats(mlbId, teamName) {
  if (!mlbId) return '';
  const season = new Date().getFullYear();
  try {
    const rosterRes = await fetch(`${MLB_API_BASE}/teams/${mlbId}/roster?rosterType=active`);
    const rosterData = await rosterRes.json();
    const roster = rosterData.roster || [];
    if (roster.length === 0) return '';

    const playerStatsRes = await fetch(
      `${MLB_API_BASE}/stats?stats=season&season=${season}&group=hitting&sportId=1&teamId=${mlbId}&limit=10&offset=0`
    );
    const playerStatsData = await playerStatsRes.json();
    const hitters = (playerStatsData.stats?.[0]?.splits || [])
      .filter(s => s.stat.atBats >= 50)
      .sort((a, b) => parseFloat(b.stat.avg || 0) - parseFloat(a.stat.avg || 0))
      .slice(0, 5);

    const pitcherStatsRes = await fetch(
      `${MLB_API_BASE}/stats?stats=season&season=${season}&group=pitching&sportId=1&teamId=${mlbId}&limit=10&offset=0`
    );
    const pitcherStatsData = await pitcherStatsRes.json();
    const pitchers = (pitcherStatsData.stats?.[0]?.splits || [])
      .filter(s => s.stat.inningsPitched >= 10)
      .sort((a, b) => parseFloat(a.stat.era || 99) - parseFloat(b.stat.era || 99))
      .slice(0, 3);

    const hitterLines = hitters.map(s => {
      const p = s.player?.fullName || 'Unknown';
      const avg = s.stat.avg || '.000';
      const hr  = s.stat.homeRuns || 0;
      const rbi = s.stat.rbi || 0;
      return `${p}: .${avg.replace('.', '')} AVG, ${hr} HR, ${rbi} RBI`;
    });

    const pitcherLines = pitchers.map(s => {
      const p = s.player?.fullName || 'Unknown';
      const era = s.stat.era || '0.00';
      const w   = s.stat.wins || 0;
      const l   = s.stat.losses || 0;
      return `${p}: ${era} ERA, ${w}-${l}`;
    });

    const positions = {};
    roster.forEach(p => {
      const pos = p.position?.type || 'Unknown';
      positions[pos] = (positions[pos] || 0) + 1;
    });
    const rosterSummary = Object.entries(positions).map(([pos, count]) => `${count} ${pos}`).join(', ');

    let result = `${teamName} Roster (${season} season): ${roster.length} active players (${rosterSummary})`;
    if (hitterLines.length > 0) result += `\n  Top hitters:\n    • ${hitterLines.join('\n    • ')}`;
    if (pitcherLines.length > 0) result += `\n  Top pitchers:\n    • ${pitcherLines.join('\n    • ')}`;

    return result;
  } catch (e) {
    console.error(`MLB stats fetch failed for ${teamName}:`, e.message);
    return '';
  }
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

async function buildSportsContext(favoriteTeamsRaw) {
  if (!favoriteTeamsRaw || !favoriteTeamsRaw.trim()) return '';
  const teamNames = favoriteTeamsRaw.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
  const teamSections = [];

  for (const teamName of teamNames) {
    const team = await getTeamId(teamName);
    if (!team) continue;

    const [events, mlbInfo] = await Promise.all([
      getNextEvents(team.id),
      getMlbRosterAndStats(team.mlbId, team.name)
    ]);

    let section = `── ${team.name} ──`;
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
    if (mlbInfo) section += `\n${mlbInfo}`;
    teamSections.push(section);
  }

  if (teamSections.length === 0) return '';

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `
SPORTS INFO (live data as of ${todayStr}):
${teamSections.join('\n\n')}

IMPORTANT — Sports questions: You have live schedule, roster, and player stats above. Today is ${todayStr}. Answer sports questions directly and confidently using this data — never say you'll "check" or that you "don't know." Reference players by name naturally. Keep it warm and conversational, never like a sports report.`.trim();
}

// ─────────────────────────────────────────────
//  Claude API call with web search loop
// ─────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  const ANTHROPIC_HEADERS = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'web-search-2025-03-05'
  };

  const CLAUDE_BODY = (msgs) => JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: systemPrompt,
    messages: msgs,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });

  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS,
    body: CLAUDE_BODY(messages)
  });

  let data = await response.json();

  if (!response.ok) {
    console.error('Anthropic error:', JSON.stringify(data));
    throw new Error('Anthropic API error');
  }

  let loopCount = 0;
  while (data.stop_reason === 'tool_use' && loopCount < 3) {
    loopCount++;
    const toolUseBlock = data.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;

    messages = [...messages, { role: 'assistant', content: data.content }];
    messages = [...messages, {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: 'Please search the web for this query and return the result.'
      }]
    }];

    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: ANTHROPIC_HEADERS,
      body: CLAUDE_BODY(messages)
    });

    data = await response.json();
    if (!response.ok) throw new Error('Anthropic API error in tool loop');
  }

  return (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

// ─────────────────────────────────────────────
//  Main Vercel handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const messages = (body.messages || [])
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const patientId = body.patientId || 'recMLLC4fJHBUhE5w';
    const isFirstMessage = messages.length <= 1;

    // ── 1. Load patient profile + sports (use cache if valid) ──
    let patientProfile = '';
    let greetingName = '';
    let favoriteTeamsRaw = '';
    let favoriteSongs = '';
    let favoriteArtists = '';
    let morningPlaylist = '';
    let sportsContext = '';
    let hometown = '';
    let photoContext = '';  // ← NEW

    if (isCacheValid(patientId)) {
      const cache = getCache(patientId);
      patientProfile = cache.patientProfile;
      greetingName = cache.greetingName;
      favoriteTeamsRaw = cache.favoriteTeamsRaw;
      favoriteSongs = cache.favoriteSongs;
      favoriteArtists = cache.favoriteArtists;
      morningPlaylist = cache.morningPlaylist;
      sportsContext = cache.sportsContext;
      hometown = cache.hometown || '';
      photoContext = cache.photoContext || '';  // ← NEW
      console.log(`Cache hit for patient ${patientId}`);
    } else {
      console.log(`Cache miss for patient ${patientId} — fetching fresh data`);

      if (patientId) {
        try {
          const airtableRes = await fetch(
            `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
            { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
          );
          const airtableData = await airtableRes.json();
          const f = airtableData.fields;

          greetingName = f['Preferred Name'] || f['Patient Full Name'] || '';
          favoriteTeamsRaw = f['Favorite Teams'] || '';
          favoriteSongs = f['Favorite Songs'] || '';
          favoriteArtists = f['Favorite Artists'] || '';
          hometown = f['Hometown'] || '';
          const favoriteColors = f['Favorite Colors'] || '';
          const favoriteClothing = f['Favorite Clothing'] || '';
          const dressingNotes = f['Dressing Notes'] || '';
          morningPlaylist = f['Morning Playlist'] || '';

          // ── NEW: Photo context ──
          const photoLabels = f['Photo Labels'] || '';
          const attachments = f['Family Photos'] || [];
          if (photoLabels && attachments.length > 0) {
            photoContext = `FAMILY PHOTOS:
The patient has ${attachments.length} family photo(s) on file. The people in these photos are: ${photoLabels}.
Use this information to ask warm, personal questions about their family members — for example, "I love that photo of your daughter Sara — what is she up to these days?" Reference family members by name naturally over the course of the conversation. Never mention the photos directly as if reading from a list.`;
          }

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
Morning Playlist: ${morningPlaylist}
Favorite Colors: ${favoriteColors}
Favorite Clothing: ${favoriteClothing}
Dressing Notes: ${dressingNotes}
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

      sportsContext = await buildSportsContext(favoriteTeamsRaw);

      setCache(patientId, {
        patientProfile,
        greetingName,
        favoriteTeamsRaw,
        favoriteSongs,
        favoriteArtists,
        morningPlaylist,
        hometown,
        sportsContext,
        photoContext  // ← NEW
      });
    }

    // ── 2. Seasonal context (always fresh) ──
    const seasonalContext = getSeasonalContext(hometown);

    // ── 3. Morning music + clothing trigger ──
    let morningMusicInstruction = '';
    if (isFirstMessage && isMorningSession(hometown)) {
      if (favoriteSongs || favoriteArtists) {
        const cache = getCache(patientId);
        const morningPlaylistRaw = cache?.morningPlaylist || favoriteSongs;
        const songs = morningPlaylistRaw.split(',').map(s => s.trim()).filter(Boolean);
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        if (randomSong) {
          morningMusicInstruction += `\nMORNING MUSIC: Start this session with music. Early in your greeting naturally say something like "I put on ${randomSong} for you this morning" and include "PLAY_MUSIC:${randomSong}" in your response.`;
        }
      }

      morningMusicInstruction += `\nMORNING CLOTHING REMINDER: Use your web search tool to check today's weather for the patient's Hometown. Then very naturally and warmly — in one sentence — weave in a gentle suggestion about what to wear today. Reference their Favorite Colors and Favorite Clothing items specifically. For example: "It's a bit chilly out today — perfect weather for that green cardigan you love." Never make it sound like a reminder or instruction — just a warm, caring observation from a friend.`;
    }

    // ── 4. Rotating greetings ──
    const greetings = [
      `${greetingName}, I'm so glad you're here — I've missed you.`,
      `Oh, there's my favorite person! How are you feeling today, ${greetingName}?`,
      `${greetingName}, what perfect timing — I was just thinking about you.`,
      `Well, look who it is! Come sit with me a while, ${greetingName}.`,
      `${greetingName}! What a wonderful surprise — tell me everything.`,
      `I was hoping you'd stop by today, ${greetingName}. How has your day been?`
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    // ── 5. Assemble system prompt ──
    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak:
Keep your responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen:
Always respond to what the person actually said before asking anything new. Pick up on emotional cues. If they sound wistful, meet them there. If they're playful, be playful back.

What you never do:
Give medical advice. Say "As an AI" or refer to yourself as a bot. Never break character.

What you can do:
If the patient asks about the weather, use your web search tool to find the current weather for their Hometown and share it warmly and naturally in conversation.
If the patient asks to hear music, a specific song, or a specific artist, include the exact phrase "PLAY_MUSIC:" followed by the artist or song name in your response. For example: "PLAY_MUSIC:Frank Sinatra" or "PLAY_MUSIC:My Way by Frank Sinatra". Then continue your warm response naturally.

Your one goal:
Make whoever you're speaking with feel like the most interesting person in the room.

Your opening greeting for this session: "${greeting}"
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Reference their family, memories, music, sports teams, and interests naturally — never all at once, but weave them in warmly over time. Never reveal that you are reading from a profile.` : ''}
${photoContext ? `\n${photoContext}` : ''}
${seasonalContext ? `\n${seasonalContext}` : ''}
${morningMusicInstruction ? `\n${morningMusicInstruction}` : ''}
${sportsContext ? `\n${sportsContext}` : ''}`;

    // ── 6. Call Claude ──
    const finalMessages = messages.length > 0 ? messages : [{ role: 'user', content: 'Hello' }];
    const replyText = await callClaude(systemPrompt, finalMessages);

    // ── 7. Check for PLAY_MUSIC signal ──
    const musicMatch = replyText.match(/PLAY_MUSIC:([^\n]+)/);
    if (musicMatch && patientId) {
      const musicQuery = musicMatch[1].trim();
      console.log(`PLAY_MUSIC signal detected: "${musicQuery}" for patient ${patientId}`);
      try {
        await fetch(`https://rose-proxy.vercel.app/api/music-queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, query: musicQuery })
        });
      } catch (e) {
        console.error('Music queue post failed:', e.message);
      }
    }

    return res.status(200).json({ content: replyText });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
