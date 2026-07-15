// ─────────────────────────────────────────────
//  chat-completions.js
//  OpenAI-compatible endpoint for LiveAvatar custom LLM integration
// ─────────────────────────────────────────────

// ── Session cache ──
const sessionCache = {};
function getCache(patientId) { return sessionCache[patientId] || null; }
function setCache(patientId, data) { sessionCache[patientId] = { ...data, cachedAt: Date.now() }; }
function isCacheValid(patientId) {
  const cache = sessionCache[patientId];
  if (!cache) return false;
  return (Date.now() - cache.cachedAt) < 5 * 60 * 1000;
}

// ── Conversation log (accumulated per session for summary) ──
const conversationLog = {};

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
  const { full, timeOfDay } = getLocalDateTime(hometown);
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
    const d = new Date(year, month - 1, 1); let count = 0;
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
  let context = `DATE & TIME CONTEXT:\nToday is ${full}. It is currently ${timeOfDay} for the resident.\nIMPORTANT: On the FIRST message of each session, naturally weave in the day, date, AND year — never as a quiz or reminder, just warmly in passing.\n\nSEASONAL CONTEXT:\nIt is currently ${season}. ${seasonPrompts[season]}`;
  if (upcoming.length > 0) context += `\nUpcoming holidays: ${upcoming.join(' ')}\nWeave upcoming holidays naturally into conversation.`;
  return context;
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
//  Main handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const { patientId: pid } = req.query || {};
    if (!pid) return res.status(400).json({ error: 'Missing patientId' });
    const log = conversationLog[pid] || [];
    // Clear after reading so next session starts fresh
    delete conversationLog[pid];
    return res.status(200).json({ messages: log });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const allMessages = body.messages || [];
    const systemMsg = allMessages.find(m => m.role === 'system');

    let patientId = 'recMLLC4fJHBUhE5w';

    // ── Try to get patientId from system message first ──
    if (systemMsg?.content) {
      const match = systemMsg.content.match(/PATIENT_ID:([^\s]+)/);
      if (match) patientId = match[1];
    }

    // ── Fall back to Airtable Active Session if still default ──
    if (patientId === 'recMLLC4fJHBUhE5w') {
      try {
        // Search for the most recently active session in Airtable
        const searchRes = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula=NOT({Active Session}="")&maxRecords=1`,
          { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
        );
        const searchData = await searchRes.json();
        const record = searchData.records?.[0];
        if (record?.fields?.['Active Session']) {
          const [activePatientId, activeVisitCount] = record.fields['Active Session'].split('|');
          if (activePatientId && activePatientId !== 'recMLLC4fJHBUhE5w') {
            patientId = activePatientId;
            console.log('Using Airtable Active Session patientId:', patientId);
          }
        }
      } catch(e) { console.warn('Airtable session lookup failed:', e.message); }
    }

    console.log('Final patientId:', patientId);

    // ── Read visit count from Airtable Active Session ──
    let visitCountToday = 1;
    try {
      const sessionRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const sessionData = await sessionRes.json();
      const activeSession = sessionData.fields?.['Active Session'] || '';
      const parts = activeSession.split('|');
      if (parts[1]) visitCountToday = parseInt(parts[1]) || 1;
    } catch(e) {}
    const isFirstVisit = visitCountToday <= 1;
    console.log('Visit count today:', visitCountToday, '— isFirstVisit:', isFirstVisit);

    const messages = allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '' }));

    const isFirstMessage = !messages.some(m => m.role === 'assistant');

    // ── Detect session signals ──
    const lastUserContent = messages.filter(m => m.role === 'user').pop()?.content || '';
    const isCheckIn = lastUserContent.includes('__CHECK_IN__');
    const isWrapUp = lastUserContent.includes('__WRAP_UP__');

    // ── Load resident profile ──
    let patientProfile = '', greetingName = '', favoriteTeamsRaw = '';
    let favoriteSongs = '', favoriteArtists = '', musicToAvoid = '';
    let morningPlaylist = '', musicMemories = '';
    let hometown = '', photoContext = '', photoMap = {};
    let sessionNotes = ''; // Always fetched fresh — never cached

    if (isCacheValid(patientId)) {
      const cache = getCache(patientId);
      ({ patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists,
         musicToAvoid, morningPlaylist, musicMemories, hometown, photoContext, photoMap } = cache);
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

        const sessionNotes = f['SessionNotes'] || '';
        // Note: SessionNotes is intentionally NOT cached so Rose always has latest memories

        patientProfile = `RESIDENT PROFILE:
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

      // ── No more hardcoded sports context — Rose uses web search for all sports ──
      setCache(patientId, { patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists, musicToAvoid, musicMemories, morningPlaylist, hometown });
    }

    // ── Always fetch photos fresh from Photos table (not cached) ──
    photoContext = '';
    photoMap = {};
    try {
      // NOTE: We fetch all records and filter in JS rather than using a
      // filterByFormula. Airtable formulas resolve linked-record fields to
      // their *display name* (e.g. "Linda Licameli"), not the record ID —
      // so a formula like FIND(patientId, ARRAYJOIN({Patient's Table}))
      // can never match. The raw REST API response, by contrast, does
      // return actual linked record IDs in fields["Patient's Table"].
      const photosRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Photos`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const photosData = await photosRes.json();
      const allPhotoRecords = photosData.records || [];
      // TEMP DEBUG — remove once photo matching is confirmed working
      if (allPhotoRecords.length > 0) {
        console.log('DEBUG photo record field keys:', JSON.stringify(Object.keys(allPhotoRecords[0].fields)));
        console.log('DEBUG photo record raw fields:', JSON.stringify(allPhotoRecords[0].fields));
      }
      const photoRecords = allPhotoRecords.filter(record => {
        const linked = record.fields["Patient's Table"] || [];
        return linked.includes(patientId);
      });
      console.log(`Photos table: found ${photoRecords.length} photos for ${patientId}`);

      if (photoRecords.length > 0) {
        photoRecords.forEach(record => {
          const pf = record.fields;
          const photoName = pf['Photo Name'] || '';
          const attachments = pf['Photo'] || [];
          const url = attachments[0]?.url || attachments[0]?.thumbnails?.large?.url || '';
          if (photoName && url) photoMap[photoName] = url;
        });

        const photoNames = Object.keys(photoMap).join(', ');
        if (photoNames) {
          photoContext = `FAMILY PHOTOS (Reminiscence Therapy):\nYou have family photos available to display on screen. Photos available: ${photoNames}.\n\nEarly in the session, proactively bring up a photo as a reminiscence therapy tool. Say something warm like "I have a beautiful photo I'd love to show you!" then include SHOW_PHOTO:[photo name] to display it. After showing the photo, ask a gentle open-ended question to spark memory. Listen warmly and follow their lead.\n\nIf there are multiple photos, you can show one per session. The SHOW_PHOTO signal must exactly match one of these names: ${photoNames}. Never mention you are reading from a list.`;
          console.log('Photos table photoMap:', JSON.stringify(Object.keys(photoMap)));
        }
      }
    } catch(e) { console.error('Photos table fetch error:', e.message); }

    // ── Always fetch SessionNotes fresh (not cached) ──
    try {
      const notesRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const notesData = await notesRes.json();
      sessionNotes = notesData.fields?.['SessionNotes'] || '';
    } catch(e) { console.warn('SessionNotes fetch failed:', e.message); }

    const seasonalContext = getSeasonalContext(hometown);

    // ── Morning music + clothing trigger ──
    let morningMusicInstruction = '';
    if (isMorningSession(hometown) && isFirstMessage) {
      const playlistSource = morningPlaylist || favoriteSongs;
      if (playlistSource) {
        const songs = playlistSource.split(',').map(s => s.trim()).filter(Boolean);
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        const artistHint = favoriteArtists ? favoriteArtists.split(',')[0].trim() + ' ' : '';
        if (randomSong) morningMusicInstruction += `\nMORNING MUSIC: Naturally mention "I put on ${randomSong} for you this morning" and include "PLAY_MUSIC:${artistHint}${randomSong}" in your response.`;
      }
      morningMusicInstruction += `\nMORNING CLOTHING REMINDER: Check today's weather for the resident's Hometown using web search, then warmly suggest what to wear referencing their Favorite Colors and Clothing.`;
    }

    // ── Music guidance ──
    let musicGuidance = '';
    if (favoriteArtists || favoriteSongs || musicMemories || musicToAvoid) {
      musicGuidance = `\nMUSIC GUIDANCE:\nThe resident loves: ${favoriteArtists}${favoriteSongs ? ` and songs like ${favoriteSongs}` : ''}.\n${musicMemories ? `Music memories: ${musicMemories}` : ''}\n${musicToAvoid ? `Never play or suggest: ${musicToAvoid}` : ''}\nIf they ask to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song, e.g. "PLAY_MUSIC:Frank Sinatra My Way". Always include the artist name.\nIMPORTANT: If the resident requests ANY song or artist not on their preference list, always honor the request. The preference list is a guide, not a restriction. Use PLAY_MUSIC: for whatever they ask for.\nIf the resident asks to stop or pause music, include "STOP_MUSIC" in your response.`;
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

    // ── Session signal instructions ──
    let sessionSignalInstruction = '';
    if (isCheckIn) {
      sessionSignalInstruction = `\nSESSION SIGNAL — CHECK IN: You have not heard from the resident in a while. Gently check in by saying something warm like "${greetingName}, are you still there? I'm right here if you'd like to chat." Keep it very brief and warm.`;
    } else if (isWrapUp) {
      sessionSignalInstruction = `\nSESSION SIGNAL — WRAP UP: The visit is coming to a close. Warmly wrap up the conversation. Say something like "It's been so lovely spending time with you, ${greetingName}. I'll see you again soon — take good care of yourself." Make it feel like a natural, loving goodbye from a good friend.`;
    }

    // ── System prompt ──
    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak: Keep responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen: Always respond to what the person actually said before asking anything new. Pick up on emotional cues.

What you NEVER do:
- Give medical advice
- Say "As an AI" or refer to yourself as a bot
- Break character
- Use terms like "honey", "sweetie", "dear", "sweetheart", or any diminutive terms of endearment — these are considered condescending to older adults. Always use the resident's name instead.

What you can do: Use web search for weather questions, current news, and ALL sports questions. For any sports question — scores, schedules, standings, tournaments, World Cup, Olympics, golf, tennis, or any team or event — always use web search to find the current answer before responding. Never say you don't know about a sports topic without searching first.

Once per session, naturally share one positive, uplifting news story — a scientific discovery, a community achievement, an inspiring human moment. Weave it warmly into conversation, never as a news broadcast. Avoid politics, crime, or disasters.

If asked to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song name. If asked to stop or pause music, include "STOP_MUSIC" in your response.

Your one goal: Make whoever you're speaking with feel like the most interesting person in the room.

Your opening greeting for this session: "${greeting}"
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Never reveal you are reading from a profile.` : ''}
${sessionNotes ? `\nPREVIOUS CONVERSATIONS:\nHere are notes from recent visits. Use these confidently and naturally — you genuinely remember these things. Reference specific details warmly, as a good friend would. For example: "Last time you told me about being thrown in the pool in Italy — that made me smile!" Do not say you are unsure or might be misremembering. Trust your notes and use them:\n${sessionNotes}` : ''}
${photoContext && !isFirstVisit ? `\n${photoContext}` : ''}
${seasonalContext ? `\n${seasonalContext}` : ''}
${morningMusicInstruction ? `\n${morningMusicInstruction}` : ''}
${musicGuidance ? `\n${musicGuidance}` : ''}
${sessionSignalInstruction}`;

    // ── Clean signal keywords from messages ──
    const cleanedMessages = messages.map(m => ({
      ...m,
      content: m.content.replace(/__CHECK_IN__/g, '').replace(/__WRAP_UP__/g, '').trim() || 'Hello'
    }));

    const finalMessages = cleanedMessages.length > 0 ? cleanedMessages : [{ role: 'user', content: 'Hello' }];
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

    // ── Check for STOP_MUSIC signal ──
    if (replyText.includes('STOP_MUSIC')) {
      try {
        await fetch('https://rose-proxy.vercel.app/api/music-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, query: '__STOP_MUSIC__' })
        });
        console.log('Stop music signal queued');
      } catch (e) { console.error('Stop music queue post failed:', e.message); }
    }

    const cleanReply = replyText
      .replace(/PLAY_MUSIC:[^\n]+/g, '')
      .replace(/SHOW_PHOTO:[^\n]+/g, '')
      .replace(/STOP_MUSIC/g, '')
      .trim();

    // ── Append to Airtable Conversation Buffer ──
    try {
      const bufferRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const bufferData = await bufferRes.json();
      const existing = bufferData.fields?.['Conversation Buffer'] || '';
      const lastUser = finalMessages.filter(m => m.role === 'user').pop()?.content || '';
      const newEntry = existing
        ? existing + `\nMember: ${lastUser}\nRose: ${cleanReply}`
        : `Member: ${lastUser}\nRose: ${cleanReply}`;
      await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { 'Conversation Buffer': newEntry } })
        }
      );
    } catch(e) { console.warn('Conversation buffer write failed:', e.message); }

    const isStreaming = req.body && req.body.stream === true;
    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.status(200);
      const chunkId = 'chatcmpl-' + Date.now();
      const created = Math.floor(Date.now() / 1000);
      res.write('data: ' + JSON.stringify({ id: chunkId, object: 'chat.completion.chunk', created, model: 'claude-haiku-4-5-20251001', choices: [{ index: 0, delta: { role: 'assistant', content: cleanReply }, finish_reason: null }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ id: chunkId, object: 'chat.completion.chunk', created, model: 'claude-haiku-4-5-20251001', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    return res.status(200).json({
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'claude-haiku-4-5-20251001',
      choices: [{ index: 0, message: { role: 'assistant', content: cleanReply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
}
