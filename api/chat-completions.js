// ─────────────────────────────────────────────
//  chat-completions.js
//  OpenAI-compatible endpoint for LiveAvatar custom LLM integration
//  LiveAvatar calls POST /api/chat/completions
//  We extract patientId from the system message, call Claude,
//  and return the response in OpenAI chat completion format
// ─────────────────────────────────────────────

// ── Session cache ──
const sessionCache = {};

function getCache(patientId) { return sessionCache[patientId] || null; }
function setCache(patientId, data) { sessionCache[patientId] = { ...data, cachedAt: Date.now() }; }
function isCacheValid(patientId) {
  const cache = sessionCache[patientId];
  if (!cache) return false;
  return (Date.now() - cache.cachedAt) < 5 * 60 * 1000; // 5 min cache
}

// ── Timezone detection ──
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

function getLocalDateTime(hometown) {
  const timezone = getTimezoneFromHometown(hometown);
  const now = new Date();
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const dayName = localDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  const monthName = localDate.toLocaleDateString('en-US', { month: 'long', timeZone: timezone });
  const dayNum = localDate.toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone });
  const year = localDate.toLocaleDateString('en-US', { year: 'numeric', timeZone: timezone });
  const hour = localDate.getHours();
  let timeOfDay = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night';
  return { dayName, monthName, dayNum, year, hour, timeOfDay, full: `${dayName}, ${monthName} ${dayNum}, ${year}` };
}

function isMorningSession(hometown) {
  const { hour } = getLocalDateTime(hometown);
  return hour >= 6 && hour <= 11;
}

// ── Seasonal context ──
function getSeasonalContext(hometown) {
  const { monthName, dayName, dayNum, year, full, timeOfDay } = getLocalDateTime(hometown);
  const now = new Date();
  const month = now.getMonth() + 1;
  let season = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'fall' : 'winter';
  const seasonPrompts = {
    spring: "Spring is here — blooming flowers, warmer days, Easter, Mother's Day. Great topics: gardening memories, spring traditions, family gatherings.",
    summer: "It's summer — warm weather, longer days, family vacations, Fourth of July. Great topics: summer traditions, beach or lake memories, cookouts, childhood summers.",
    fall: "Fall is arriving — changing leaves, cooler air, harvest time, Thanksgiving. Great topics: fall traditions, holiday cooking, family gatherings, football season.",
    winter: "It's winter — cozy indoors, holiday season, New Year's. Great topics: Christmas memories, holiday traditions, winter foods, family visits."
  };
  const yr = now.getFullYear();
  function nthWeekday(year, month, weekday, n) {
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (d.getMonth() === month - 1) {
      if (d.getDay() === weekday) { count++; if (count === n) return d.getDate(); }
      d.setDate(d.getDate() + 1);
    }
    return 1;
  }
  function lastWeekday(year, month, weekday) {
    const d = new Date(year, month, 0);
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return d.getDate();
  }
  const holidays = [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 2, day: 14, name: "Valentine's Day" },
    { month: 3, day: 17, name: "St. Patrick's Day" },
    { month: 5, day: nthWeekday(yr, 5, 0, 2), name: "Mother's Day" },
    { month: 5, day: lastWeekday(yr, 5, 1), name: "Memorial Day" },
    { month: 6, day: nthWeekday(yr, 6, 0, 3), name: "Father's Day" },
    { month: 7, day: 4, name: "Independence Day" },
    { month: 9, day: nthWeekday(yr, 9, 1, 1), name: "Labor Day" },
    { month: 10, day: 31, name: "Halloween" },
    { month: 11, day: 11, name: "Veterans Day" },
    { month: 11, day: nthWeekday(yr, 11, 4, 4), name: "Thanksgiving" },
    { month: 12, day: 25, name: "Christmas" },
    { month: 12, day: 31, name: "New Year's Eve" },
  ];
  const upcoming = holidays.filter(h => {
    const holidayDate = new Date(now.getFullYear(), h.month - 1, h.day);
    const daysUntil = Math.ceil((holidayDate - now) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 14;
  }).map(h => {
    const holidayDate = new Date(now.getFullYear(), h.month - 1, h.day);
    const daysUntil = Math.ceil((holidayDate - now) / (1000 * 60 * 60 * 24));
    return daysUntil === 0 ? `Today is ${h.name}!` : daysUntil === 1 ? `${h.name} is tomorrow!` : `${h.name} is in ${daysUntil} days.`;
  });
  let context = `DATE & TIME CONTEXT:\nToday is ${full}. It is currently ${timeOfDay} for the patient.\nIMPORTANT: On the FIRST message of each session, naturally weave in the day, date, AND year — never as a quiz or reminder, just warmly in passing.\n\nSEASONAL CONTEXT:\nIt is currently ${season}. ${seasonPrompts[season]}`;
  if (upcoming.length > 0) context += `\nUpcoming holidays: ${upcoming.join(' ')}\nWeave upcoming holidays naturally into conversation.`;
  return context;
}

// ── Sports helpers ──
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
const TEAM_ID_LOOKUP = {
  'new york yankees': { id: '135260', name: 'New York Yankees', mlbId: 147 },
  'yankees': { id: '135260', name: 'New York Yankees', mlbId: 147 },
  'new york mets': { id: '135270', name: 'New York Mets', mlbId: 121 },
  'mets': { id: '135270', name: 'New York Mets', mlbId: 121 },
  'boston red sox': { id: '135253', name: 'Boston Red Sox', mlbId: 111 },
  'red sox': { id: '135253', name: 'Boston Red Sox', mlbId: 111 },
  'los angeles dodgers': { id: '135261', name: 'Los Angeles Dodgers', mlbId: 119 },
  'dodgers': { id: '135261', name: 'Los Angeles Dodgers', mlbId: 119 },
  'chicago cubs': { id: '135255', name: 'Chicago Cubs', mlbId: 112 },
  'cubs': { id: '135255', name: 'Chicago Cubs', mlbId: 112 },
  'new york giants': { id: '134925', name: 'New York Giants', mlbId: null },
  'new york jets': { id: '134926', name: 'New York Jets', mlbId: null },
  'jets': { id: '134926', name: 'New York Jets', mlbId: null },
  'dallas cowboys': { id: '134916', name: 'Dallas Cowboys', mlbId: null },
  'cowboys': { id: '134916', name: 'Dallas Cowboys', mlbId: null },
  'new england patriots': { id: '134927', name: 'New England Patriots', mlbId: null },
  'patriots': { id: '134927', name: 'New England Patriots', mlbId: null },
  'new york knicks': { id: '134860', name: 'New York Knicks', mlbId: null },
  'knicks': { id: '134860', name: 'New York Knicks', mlbId: null },
  'boston celtics': { id: '134852', name: 'Boston Celtics', mlbId: null },
  'celtics': { id: '134852', name: 'Boston Celtics', mlbId: null },
  'los angeles lakers': { id: '134858', name: 'Los Angeles Lakers', mlbId: null },
  'lakers': { id: '134858', name: 'Los Angeles Lakers', mlbId: null },
};

async function getTeamId(teamName) {
  const key = teamName.trim().toLowerCase();
  if (TEAM_ID_LOOKUP[key]) return TEAM_ID_LOOKUP[key];
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/searchteams.php?t=${encodeURIComponent(teamName.trim())}`);
    const data = await res.json();
    if (data.teams?.[0]) return { id: data.teams[0].idTeam, name: data.teams[0].strTeam, mlbId: null };
  } catch (e) {}
  return null;
}

async function getNextEvents(teamId) {
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/eventsnext.php?id=${teamId}`);
    const data = await res.json();
    return data.events || [];
  } catch (e) { return []; }
}

async function buildSportsContext(favoriteTeamsRaw) {
  if (!favoriteTeamsRaw?.trim()) return '';
  const teamNames = favoriteTeamsRaw.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
  const teamSections = [];
  for (const teamName of teamNames) {
    const team = await getTeamId(teamName);
    if (!team) continue;
    const events = await getNextEvents(team.id);
    let section = `── ${team.name} ──`;
    if (events.length === 0) {
      section += `\nSchedule: No upcoming games found.`;
    } else {
      const upcoming = events.slice(0, 3).map(ev => {
        const d = ev.dateEvent ? new Date(ev.dateEvent + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
        return `${d}: ${ev.strHomeTeam || ''} vs. ${ev.strAwayTeam || ''}`;
      });
      section += `\nUpcoming games:\n  • ${upcoming.join('\n  • ')}`;
    }
    teamSections.push(section);
  }
  if (teamSections.length === 0) return '';
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `SPORTS INFO (live data as of ${todayStr}):\n${teamSections.join('\n\n')}\n\nAnswer sports questions directly and confidently. Keep it warm and conversational.`;
}

// ── Claude API call ──
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
    method: 'POST', headers: ANTHROPIC_HEADERS, body: CLAUDE_BODY(messages)
  });
  let data = await response.json();
  if (!response.ok) throw new Error('Anthropic API error');

  let loopCount = 0;
  while (data.stop_reason === 'tool_use' && loopCount < 3) {
    loopCount++;
    const toolUseBlock = data.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;
    messages = [...messages, { role: 'assistant', content: data.content }];
    messages = [...messages, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: 'Please search the web for this query and return the result.' }] }];
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: ANTHROPIC_HEADERS, body: CLAUDE_BODY(messages) });
    data = await response.json();
    if (!response.ok) throw new Error('Anthropic API error in tool loop');
  }
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// ─────────────────────────────────────────────
//  Main handler — OpenAI-compatible format
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

    // ── Extract patientId from messages ──
    const allMessages = body.messages || [];
    const systemMsg = allMessages.find(m => m.role === 'system');
    let patientId = 'recMLLC4fJHBUhE5w'; // default to Scarlett

    if (systemMsg?.content) {
      const match = systemMsg.content.match(/PATIENT_ID:([^\s]+)/);
      if (match) patientId = match[1];
    }

    // Filter to user/assistant messages only
    const messages = allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '' }));

    // ── Load patient profile ──
    let patientProfile = '', greetingName = '', favoriteTeamsRaw = '';
    let favoriteSongs = '', favoriteArtists = '', musicToAvoid = '';
    let morningPlaylist = '', musicMemories = '', sportsContext = '';
    let hometown = '', photoContext = '', photoMap = {};

    if (isCacheValid(patientId)) {
      const cache = getCache(patientId);
      ({ patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists,
         musicToAvoid, morningPlaylist, musicMemories, sportsContext, hometown, photoContext, photoMap } = cache);
    } else {
      try {
        const airtableRes = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
          { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
        );
        const airtableData = await airtableRes.json();
        const f = airtableData.fields || {};

        greetingName = f['Preferred Name'] || f['Patient Full Name'] || '';
        favoriteTeamsRaw = f['Favorite Teams'] || '';
        favoriteSongs = f['Favorite Songs'] || '';
        favoriteArtists = f['Favorite Artists'] || '';
        musicToAvoid = f['Music to Avoid'] || '';
        musicMemories = f['Music Memories'] || '';
        hometown = f['Hometown'] || '';
        morningPlaylist = f['Morning Playlist'] || '';
        const favoriteColors = f['Favorite Colors'] || '';
        const favoriteClothing = f['Favorite Clothing'] || '';
        const dressingNotes = f['Dressing Notes'] || '';

        const photoLabels = f['Photo Labels'] || '';
        const attachments = f['Family Photos'] || [];
        if (photoLabels && attachments.length > 0) {
          const photoList = photoLabels.split(',').map(p => p.trim()).filter(Boolean);
          attachments.forEach((att, idx) => {
            if (photoList[idx]) photoMap[photoList[idx]] = att.url || att.thumbnails?.large?.url || '';
          });
          const photoNames = photoList.join(', ');
          photoContext = `FAMILY PHOTOS (Reminiscence Therapy):\nYou have family photos available to display on screen. Photos available: ${photoNames}.\n\nEarly in the session, proactively bring up a photo as a reminiscence therapy tool. Say something warm like "I have a beautiful photo of Sara I'd love to show you!" then include SHOW_PHOTO:Sara to display it. After showing the photo, ask a gentle open-ended question to spark memory — like "Tell me about Sara. What is she like?" or "What's one of your favorite memories with her?" Listen warmly and follow their lead.\n\nIf there are multiple photos, you can show one per session. The SHOW_PHOTO signal must exactly match one of these names: ${photoNames}. Never mention you are reading from a list.`;
          console.log('DEBUG photoMap built:', JSON.stringify(photoMap));
        }

        patientProfile = `PATIENT PROFILE:
Name: ${f['Patient Full Name'] || ''} (prefers: ${greetingName})
Age: ${f['Age'] || ''} | Hometown: ${hometown} | Living situation: ${f['Living Situation'] || ''}
Spouse: ${f['Spouse Name'] ? `${f['Spouse Name']} (${f['Spouse Status'] || ''})` : 'Not provided'}
Children: ${f['Children'] || 'Not provided'} | Grandchildren: ${f['Grandchildren'] || 'Not provided'}
Career: ${f['Career'] || ''} | Places lived: ${f['Places Lived'] || ''}
Special memories: ${f['Special Memories'] || ''} | Faith: ${f['Faith'] || ''}
Favorite topics: ${f['Favorite Topics'] || ''}
Favorite Artists: ${favoriteArtists} | Favorite Songs: ${favoriteSongs}
Music Memories: ${musicMemories} | Music to Avoid: ${musicToAvoid}
Morning Playlist: ${morningPlaylist}
Favorite Colors: ${favoriteColors} | Favorite Clothing: ${favoriteClothing}
Dressing Notes: ${dressingNotes}
Favorite Sports: ${f['Favorite Sports'] || ''} | Favorite Teams: ${favoriteTeamsRaw}
Favorite Movies: ${f['Favorite Movies'] || ''} | Favorite Foods: ${f['Favorite Foods'] || ''}
Pets: ${f['Pets'] || ''} | Topics to avoid: ${f['Topics To Avoid'] || ''}
Cognitive notes: ${f['Cognitive Notes'] || ''}`.trim();
      } catch (e) {
        console.error('Airtable fetch error:', e);
      }

      sportsContext = await buildSportsContext(favoriteTeamsRaw);
      setCache(patientId, { patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists, musicToAvoid, musicMemories, morningPlaylist, hometown, sportsContext, photoContext, photoMap });
    }

    // ── Seasonal context ──
    const seasonalContext = getSeasonalContext(hometown);

    // ── Morning music + clothing trigger ──
    console.log("DEBUG morning:", { morningPlaylist, favoriteSongs, hometown });
    let morningMusicInstruction = '';
    if (isMorningSession(hometown)) {
      const playlistSource = morningPlaylist || favoriteSongs;
      if (playlistSource) {
        const songs = playlistSource.split(',').map(s => s.trim()).filter(Boolean);
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        const artistHint = favoriteArtists ? favoriteArtists.split(',')[0].trim() + ' ' : '';
        if (randomSong) morningMusicInstruction += `\nMORNING MUSIC: Naturally mention "I put on ${randomSong} for you this morning" and include "PLAY_MUSIC:${artistHint}${randomSong}" in your response.`;
      }
      morningMusicInstruction += `\nMORNING CLOTHING REMINDER: Check today's weather for the patient's Hometown using web search, then warmly suggest what to wear referencing their Favorite Colors and Clothing.`;
    }

    // ── Music guidance ──
    let musicGuidance = '';
    if (favoriteArtists || favoriteSongs || musicMemories || musicToAvoid) {
      musicGuidance = `\nMUSIC GUIDANCE:\nThe patient loves: ${favoriteArtists}${favoriteSongs ? ` and songs like ${favoriteSongs}` : ''}.\n${musicMemories ? `Music memories: ${musicMemories}` : ''}\n${musicToAvoid ? `Never play or suggest: ${musicToAvoid}` : ''}\nIf they ask to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song, e.g. "PLAY_MUSIC:Frank Sinatra My Way" or "PLAY_MUSIC:Frank Sinatra". Always include the artist name to avoid wrong versions.`;
    }

    // ── Rotating greetings ──
    const greetings = [
      `${greetingName}, I'm so glad you're here — I've missed you.`,
      `Oh, there's my favorite person! How are you feeling today, ${greetingName}?`,
      `${greetingName}, what perfect timing — I was just thinking about you.`,
      `Well, look who it is! Come sit with me a while, ${greetingName}.`,
      `${greetingName}! What a wonderful surprise — tell me everything.`,
      `I was hoping you'd stop by today, ${greetingName}. How has your day been?`
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    // ── System prompt ──
    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak: Keep responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen: Always respond to what the person actually said before asking anything new. Pick up on emotional cues.

What you never do: Give medical advice. Say "As an AI" or refer to yourself as a bot. Never break character.

What you can do: Use web search for weather questions, current news, and sports scores. If someone asks about a game, championship, or sports news you are not sure about, use web search to find the current answer. If asked to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song name — always include the artist to get the right version.

Your one goal: Make whoever you're speaking with feel like the most interesting person in the room.

Your opening greeting for this session: "${greeting}"
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Never reveal you are reading from a profile.` : ''}
${photoContext ? `\n${photoContext}` : ''}
${seasonalContext ? `\n${seasonalContext}` : ''}
${morningMusicInstruction ? `\n${morningMusicInstruction}` : ''}
${musicGuidance ? `\n${musicGuidance}` : ''}
${sportsContext ? `\n${sportsContext}` : ''}`;

    // ── Call Claude ──
    const finalMessages = messages.length > 0 ? messages : [{ role: 'user', content: 'Hello' }];
    const replyText = await callClaude(systemPrompt, finalMessages);

    // ── Check for SHOW_PHOTO signal ──
    const photoMatch = replyText.match(/SHOW_PHOTO:([^\n]+)/);
    if (photoMatch) {
      const photoLabel = photoMatch[1].trim();
      const photoUrl = photoMap[photoLabel];
      if (photoUrl) {
        try {
          await fetch('https://rose-proxy.vercel.app/api/photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, url: photoUrl, label: photoLabel })
          });
          console.log(`Photo queued: ${photoLabel} → ${photoUrl}`);
        } catch (e) { console.error('Photo queue post failed:', e.message); }
      } else {
        console.warn(`SHOW_PHOTO signal received but no URL found for label: "${photoLabel}". Available: ${JSON.stringify(Object.keys(photoMap))}`);
      }
    }

    // ── Check for PLAY_MUSIC signal ──
    const musicMatch = replyText.match(/PLAY_MUSIC:([^\n]+)/);
    if (musicMatch && patientId) {
      const musicQuery = musicMatch[1].trim();
      try {
        await fetch('https://rose-proxy.vercel.app/api/music-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, query: musicQuery })
        });
      } catch (e) { console.error('Music queue post failed:', e.message); }
    }

    // ── Clean reply ──
    const cleanReply = replyText.replace(/PLAY_MUSIC:[^\n]+/g, '').replace(/SHOW_PHOTO:[^\n]+/g, '').trim();
    const isStreaming = req.body && req.body.stream === true;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.status(200);
      const chunkId = 'chatcmpl-' + Date.now();
      const created = Math.floor(Date.now() / 1000);
      const chunk = JSON.stringify({
        id: chunkId,
        object: 'chat.completion.chunk',
        created: created,
        model: 'claude-haiku-4-5-20251001',
        choices: [{ index: 0, delta: { role: 'assistant', content: cleanReply }, finish_reason: null }]
      });
      res.write('data: ' + chunk + '\n\n');
      const finalChunk = JSON.stringify({
        id: chunkId,
        object: 'chat.completion.chunk',
        created: created,
        model: 'claude-haiku-4-5-20251001',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      });
      res.write('data: ' + finalChunk + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    return res.status(200).json({
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'claude-haiku-4-5-20251001',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: cleanReply },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
}
