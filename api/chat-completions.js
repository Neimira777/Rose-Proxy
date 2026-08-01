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
// ── Chair exercise library — Rose can VERBALLY coach through these live.
// She cannot physically demonstrate movements (her avatar is chest-up
// only), so every routine is written to be led entirely by voice: clear,
// one-step-at-a-time instructions a person can follow without watching
// anything. All routines are seated/chair-based, low-impact, and gentle
// by design — nothing requiring balance, floor work, or exertion. ──
const EXERCISE_ROUTINES = `
CHAIR EXERCISE ROUTINES (for voice-only coaching — you cannot demonstrate physically, only guide step by step):

1. GENTLE WARM-UP (shoulders & neck)
   - Slowly roll your shoulders up, back, and down. Repeat 5 times.
   - Gently tilt your head toward one shoulder, hold a moment, then the other side. 3 times each.
   - Slowly turn your head to look over one shoulder, then the other. 3 times each side.

2. ARM RAISES & CIRCLES
   - Sitting tall, raise both arms slowly out to the sides up to shoulder height, then lower. Repeat 8 times.
   - Make small gentle circles with your arms extended, forward for 5, then backward for 5.

3. SEATED MARCHING
   - Sitting up straight, lift one knee up gently, then lower, then the other knee. Continue alternating for about 20 seconds, like a gentle march in your chair.

4. ANKLE & FOOT MOBILITY
   - Lift your feet slightly off the floor and rotate your ankles in circles, 5 times one way, 5 times the other.
   - Point your toes forward, then flex them back toward you. Repeat 8 times.

5. GENTLE TORSO TWISTS
   - Sitting tall with feet flat on the floor, gently twist your upper body to look behind you on one side, hold briefly, then return to center and twist to the other side. 3 times each direction. Keep movements slow and gentle.

6. HAND & FINGER STRETCHES
   - Make a gentle fist, then spread your fingers out wide. Repeat 8 times.
   - Slowly rotate your wrists in circles, 5 times each direction.

7. COOL-DOWN BREATHING
   - Sit comfortably, close your eyes if you'd like. Breathe in slowly through your nose for a count of 4, hold gently for a count of 2, then breathe out slowly through your mouth for a count of 4. Repeat this a few times, nice and unhurried.

HOW TO COACH: Pick ONE or TWO routines that fit the conversation (a full session shouldn't be all seven at once unless asked). Guide one step at a time — give one instruction, then wait for their response before moving on, rather than reading the whole routine at once. Count reps out loud warmly ("one... two... there you go"). Check in naturally ("How's that feeling?"). Always mention at the start: this isn't a substitute for their doctor's guidance, and to stop right away if anything hurts or feels wrong. Keep the tone like a caring friend, never a drill instructor — slow, encouraging, no pressure to keep going if they'd rather stop.
`.trim();

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
    'anthropic-version': '2023-06-01'
  };
  const CLAUDE_BODY = (msgs) => JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
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
    messages = [...messages, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: 'Web search is unavailable right now — do not guess or estimate an answer. Tell the person you are unable to check that right now.' }] }];
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
    delete conversationLog[pid];
    return res.status(200).json({ messages: log });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    // TEMP DEBUG — remove once we've confirmed what HeyGen actually sends
    const allMessages = body.messages || [];
    const systemMsg = allMessages.find(m => m.role === 'system');

    let patientId = 'recMLLC4fJHBUhE5w';
    let resolvedViaRoom = false;

    // ── Room ID-based session resolution (the reliable method) ──
    // HeyGen's LiveAvatar runs on LiveKit, which sends a genuinely unique
    // x-livekit-room-id header on every single request in a conversation —
    // unlike the system message (confirmed via testing to often NOT contain
    // our PATIENT_ID at all) or the Active Session field (a single shared
    // value that breaks the moment more than one member has ever used the
    // system, since nothing distinguishes which member's session is truly
    // current). A room ID is unique per live conversation, so once we've
    // resolved a patientId for a given room, every later message in that
    // exact conversation can look it up with zero ambiguity — including
    // when two different families are genuinely mid-session at once.
    const roomId = req.headers['x-livekit-room-id'];
    console.log('Incoming request — Room ID:', roomId || '(none)');
    if (roomId) {
      try {
        const roomRes = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/RoomSessions?filterByFormula=${encodeURIComponent(`{Room ID}="${roomId}"`)}&sort[0][field]=Last Resolved&sort[0][direction]=desc&maxRecords=1`,
          { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
        );
        const roomData = await roomRes.json();
        const roomRecord = roomData.records?.[0];
        if (roomRecord?.fields?.['Patient ID']) {
          patientId = roomRecord.fields['Patient ID'];
          resolvedViaRoom = true;
          console.log('Resolved patientId via Room ID mapping:', roomId, '→', patientId);
        }
      } catch (e) { console.warn('Room session lookup failed:', e.message); }
    }

    if (!resolvedViaRoom) {
      // ── First message of a new room — fall back to the older, less
      // reliable methods just this once, then remember the answer. ──
      if (systemMsg?.content) {
        const match = systemMsg.content.match(/PATIENT_ID:([^\s]+)/);
        if (match) patientId = match[1];
      }

      if (patientId === 'recMLLC4fJHBUhE5w') {
        try {
          const searchRes = await fetch(
            `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula=NOT({Active Session}="")&sort[0][field]=Active Session Timestamp&sort[0][direction]=desc&maxRecords=1`,
            { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
          );
          const searchData = await searchRes.json();
          const record = searchData.records?.[0];
          if (record?.fields?.['Active Session']) {
            const [activePatientId] = record.fields['Active Session'].split('|');
            if (activePatientId && activePatientId !== 'recMLLC4fJHBUhE5w') {
              patientId = activePatientId;
              console.log('Using Airtable Active Session patientId:', patientId);
            }
          }
        } catch (e) { console.warn('Airtable session lookup failed:', e.message); }
      }

      // ── Remember this resolution for every future message in this room ──
      if (roomId && patientId !== 'recMLLC4fJHBUhE5w') {
        try {
          await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/RoomSessions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Room ID': roomId, 'Patient ID': patientId, 'Last Resolved': new Date().toISOString() } })
          });
          console.log('Saved new Room ID mapping:', roomId, '→', patientId);
        } catch (e) { console.warn('Room session save failed:', e.message); }
      }
    }

    console.log('Final patientId:', patientId);

    let visitCountToday = 1;
    let isDemo = false;
    let eventReminderLabel = '';
    try {
      const sessionRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const sessionData = await sessionRes.json();
      const activeSession = sessionData.fields?.['Active Session'] || '';
      const parts = activeSession.split('|');
      if (parts[1]) visitCountToday = parseInt(parts[1]) || 1;
      if (parts.includes('demo')) isDemo = true;
      const eventPart = parts.find(p => p.startsWith('event:'));
      if (eventPart) eventReminderLabel = eventPart.slice('event:'.length).trim();
    } catch(e) {}
    const isFirstVisit = visitCountToday <= 1;
    console.log('Visit count today:', visitCountToday, '— isFirstVisit:', isFirstVisit, '— isDemo:', isDemo, '— eventReminderLabel:', eventReminderLabel);


    const messages = allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '' }));

    const isFirstMessage = !messages.some(m => m.role === 'assistant');

    const lastUserContent = messages.filter(m => m.role === 'user').pop()?.content || '';
    const isCheckIn = lastUserContent.includes('__CHECK_IN__');
    const isWrapUp = lastUserContent.includes('__WRAP_UP__');

    let patientProfile = '', greetingName = '', favoriteTeamsRaw = '';
    let favoriteSongs = '', favoriteArtists = '', musicToAvoid = '';
    let morningPlaylist = '', musicMemories = '';
    let hometown = '', photoContext = '', photoMap = {};
    let personalityProfile = '';
    let sessionNotes = '';
    let importantDatesRaw = '';
    let entertainmentInterests = '';

    if (isCacheValid(patientId)) {
      const cache = getCache(patientId);
      ({ patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists,
         musicToAvoid, morningPlaylist, musicMemories, hometown, photoContext, photoMap,
         entertainmentInterests } = cache);
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
        personalityProfile = f['Personality Profile'] || '';
        entertainmentInterests = f['Entertainment Interests'] || '';

        const sessionNotesInner = f['SessionNotes'] || '';

        patientProfile = `RESIDENT PROFILE:
Name: ${f['Patient Full Name'] || ''} (prefers: ${greetingName})
Age: ${f['Age'] || ''} | Hometown: ${hometown} | Living situation: ${f['Living Situation'] || ''}
Spouse: ${f['Spouse Name'] ? `${f['Spouse Name']} (${f['Spouse Status'] || ''})` : 'Not provided'}
Children: ${f['Children'] || 'Not provided'} | Grandchildren: ${f['Grandchildren'] || 'Not provided'}
Career: ${f['Career'] || ''} | Places lived: ${f['Places Lived'] || ''}
Special memories: ${f['Special Memories'] || ''} | Faith: ${f['Faith'] || ''}
Personality: ${personalityProfile || 'Not yet known'}
Favorite topics: ${f['Favorite Topics'] || ''}
Favorite Artists: ${favoriteArtists} | Favorite Songs: ${favoriteSongs}
Music Memories: ${musicMemories} | Music to Avoid: ${musicToAvoid}
Morning Playlist: ${morningPlaylist}
Favorite Colors: ${favoriteColors} | Favorite Clothing: ${favoriteClothing}
Dressing Notes: ${dressingNotes}
Favorite Sports: ${f['Favorite Sports'] || ''} | Favorite Teams: ${favoriteTeamsRaw}
Entertainment Interests: ${entertainmentInterests}
Favorite Movies: ${f['Favorite Movies'] || ''} | Favorite Foods: ${f['Favorite Foods'] || ''}
Pets: ${f['Pets'] || ''} | Topics to avoid: ${f['Topics To Avoid'] || ''}
Cognitive notes: ${f['Cognitive Notes'] || ''}`.trim();
      } catch (e) {
        console.error('Airtable fetch error:', e);
      }

      setCache(patientId, { patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists, musicToAvoid, musicMemories, morningPlaylist, hometown, entertainmentInterests });
    }

    // ── Fetch REAL current weather via the National Weather Service —
    // general web search was found to return stale cached weather pages
    // (e.g. reporting 92° and sunny during an actual severe storm), so
    // weather now comes from a dedicated live government data source
    // instead. Only fetched when actually relevant, to avoid slowing
    // down every single message with an unnecessary lookup. ──
    let weatherContext = '';
    const weatherKeywords = /\b(weather|rain|raining|sunny|cloudy|cold|hot|temperature|outside|umbrella|storm|snow|forecast|flooding)\b/i;
    const needsWeather = hometown && (isFirstMessage || weatherKeywords.test(lastUserContent));
    console.log('Weather trigger check — hometown:', hometown, '| isFirstMessage:', isFirstMessage, '| lastUserContent:', lastUserContent, '| needsWeather:', needsWeather);

    // ── Exercise coaching trigger ──
    // Checks both the person's latest message AND Rose's own last message —
    // this matters because after Rose makes the soft morning offer ("want to
    // stretch together?"), a simple "yes" from the person wouldn't contain
    // any exercise keyword on its own. Checking her own prior message means
    // the routines stay available on the very next turn so she can actually
    // follow through, rather than only reacting to the person saying the
    // word "stretch" themselves.
    const exerciseKeywords = /\b(exercise|exercises|stretch|stretches|stretching|workout|move|moving|chair yoga|warm[\s-]?up|limber)\b/i;
    const lastAssistantContent = messages.filter(m => m.role === 'assistant').pop()?.content || '';
    const wantsExercise = exerciseKeywords.test(lastUserContent) || exerciseKeywords.test(lastAssistantContent) || (isMorningSession(hometown) && isFirstMessage);
    const exerciseContext = wantsExercise ? `\n${EXERCISE_ROUTINES}` : '';
    if (needsWeather) {
      try {
        const weatherRes = await fetch(`https://rose-proxy.vercel.app/api/weather?hometown=${encodeURIComponent(hometown)}`);
        const weatherData = await weatherRes.json();
        if (weatherData.ok) {
          weatherContext = `\nCURRENT WEATHER (live, real — use this exact data, never guess or search the web for weather): ${weatherData.tempF}°F, ${weatherData.description}${weatherData.windMph != null ? `, wind ${weatherData.windMph} mph` : ''} in ${hometown}.`;
          console.log('Weather fetch SUCCESS:', JSON.stringify(weatherData));
        } else {
          console.log('Weather fetch returned not-ok:', JSON.stringify(weatherData));
        }
      } catch (e) {
        console.error('Weather fetch error:', e.message);
      }
    }

    // ── Always fetch photos fresh from Photos table (not cached) ──
    photoContext = '';
    photoMap = {};
    try {
      const photosRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Photos`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const photosData = await photosRes.json();
      const allPhotoRecords = photosData.records || [];
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
          photoContext = `FAMILY PHOTOS (Reminiscence Therapy):\nYou have family photos available to display on screen. Photos available: ${photoNames}.\n\nIf asked to see or show a photo, warmly say something like "I have a beautiful photo I'd love to show you!" then include SHOW_PHOTO:[photo name] to display it. After showing the photo, ask a gentle open-ended question to spark memory. Listen warmly and follow their lead. The SHOW_PHOTO signal must exactly match one of these names: ${photoNames}. Never mention you are reading from a list.`;
          console.log('Photos table photoMap:', JSON.stringify(Object.keys(photoMap)));
        }
      }
    } catch(e) { console.error('Photos table fetch error:', e.message); }

    try {
      const notesRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const notesData = await notesRes.json();
      sessionNotes = notesData.fields?.['SessionNotes'] || '';
      importantDatesRaw = notesData.fields?.['Important Dates'] || '';
    } catch(e) { console.warn('SessionNotes fetch failed:', e.message); }

    // ── Important Dates — birthdays, appointments, anniversaries ──
    // Stored as one entry per line: YYYY-MM-DD|Label. Same "surface it
    // naturally, never as an alert" pattern already used for holidays.
    let importantDatesInstruction = '';
    if (importantDatesRaw) {
      const todayForDates = new Date();
      const upcomingPersonalDates = importantDatesRaw.split('\n').filter(Boolean).map(line => {
        const [dateStr, ...rest] = line.split('|');
        const label = rest.join('|').trim();
        const [y, m, d] = (dateStr || '').trim().split('-').map(Number);
        if (!y || !m || !d) return null;
        // Compare using this year's occurrence, so recurring things like
        // birthdays work correctly regardless of what year they were entered.
        let occursOn = new Date(todayForDates.getFullYear(), m - 1, d);
        if (occursOn < new Date(todayForDates.getFullYear(), todayForDates.getMonth(), todayForDates.getDate() - 1)) {
          occursOn = new Date(todayForDates.getFullYear() + 1, m - 1, d);
        }
        const daysUntil = Math.ceil((occursOn - todayForDates) / (1000 * 60 * 60 * 24));
        return { label, daysUntil };
      }).filter(d => d && d.daysUntil >= 0 && d.daysUntil <= 14);

      if (upcomingPersonalDates.length > 0) {
        const lines = upcomingPersonalDates.map(d =>
          d.daysUntil === 0 ? `Today: ${d.label}` : d.daysUntil === 1 ? `Tomorrow: ${d.label}` : `In ${d.daysUntil} days: ${d.label}`
        );
        importantDatesInstruction = `\nUPCOMING PERSONAL DATES for this resident:\n${lines.join('\n')}\nWeave these in naturally if it fits the conversation — the way a close friend would casually remember and mention them, never as a checklist or reminder alert. It's fine not to mention every single one in one sitting.`;
      }
    }

    const seasonalContext = getSeasonalContext(hometown);

    let morningMusicInstruction = '';
    if (isMorningSession(hometown) && isFirstMessage) {
      const playlistSource = morningPlaylist || favoriteSongs;
      if (playlistSource) {
        const songs = playlistSource.split(',').map(s => s.trim()).filter(Boolean);
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        const artistHint = favoriteArtists ? favoriteArtists.split(',')[0].trim() + ' ' : '';
        if (randomSong) morningMusicInstruction += `\nMORNING MUSIC: Naturally mention "I put on ${randomSong} for you this morning" and include "PLAY_MUSIC:${artistHint}${randomSong}" in your response. Do NOT also include STOP_MUSIC in this same message — you are starting the music, not stopping it.`;
      }
      morningMusicInstruction += `\nMORNING CLOTHING REMINDER: Using the CURRENT WEATHER data provided below (not a search), warmly suggest what to wear referencing their Favorite Colors and Clothing.`;
      morningMusicInstruction += `\nMORNING MOVEMENT OFFER: Later in this first conversation (not immediately, don't stack it on top of the greeting/music/clothing all at once), warmly offer a gentle stretch as a choice, not an instruction — for example "Want to start with a little stretch together this morning, or ease in with your coffee first?" If they say yes or show interest, use the CHAIR EXERCISE ROUTINES below to guide them. If they'd rather not, or don't respond to the offer, drop it completely and never push.`;
    }

    // ── Daily Interest Briefing ──
    // Proactively checks, once per morning, whether anything relevant to the
    // resident's stated Entertainment Interests (a sports team, tournament,
    // show, etc.) is happening today, using the same web_search tool already
    // trusted for sports/news — not a separate lookup service. Only fires on
    // the first message of a morning session, and only mentions it if
    // something genuinely relevant turns up today; otherwise stays silent
    // rather than forcing an update into the conversation.
    let entertainmentInstruction = '';
    if (isMorningSession(hometown) && isFirstMessage && entertainmentInterests) {
      entertainmentInstruction = `\nDAILY INTEREST CHECK: The resident's Entertainment Interests are: "${entertainmentInterests}". Early in this conversation, use your web search tool to check if anything relevant is happening today or on TV today — a game, a match, a tournament, a new episode, whatever fits their interest. If you find something genuinely relevant to today specifically, mention it warmly and naturally, like a friend who happened to notice, e.g. "I saw your tennis match is on at 3 today!" If nothing relevant is happening today, don't mention it at all — never force it or say "nothing's on today," just let it go.`;
    }

    // ── Entertainment event reminder session ──
    // Triggered by the waiting screen's background check (api/event-reminder-check.js),
    // not a normal scheduled visit or user-initiated session. Rose should open
    // by warmly delivering the reminder itself, not a generic greeting —
    // this takes priority over the standard morning-music/clothing opening
    // since it's a short, purpose-driven check-in, not a full visit.
    let eventReminderInstruction = '';
    if (isFirstMessage && eventReminderLabel) {
      eventReminderInstruction = `\nEVENT REMINDER SESSION: You are popping in specifically to remind the resident that "${eventReminderLabel}" is starting soon — about 15 minutes from now. Open warmly and briefly with this reminder as your very first message, like a friend who happened to think of them — for example "Hi! I just wanted to pop in and remind you, ${eventReminderLabel} is starting in about 15 minutes!" Keep it short and light. After that, let the conversation flow naturally — you don't need to stay on this topic if they want to chat about something else.`;
    }


    let musicGuidance = '';
    if (favoriteArtists || favoriteSongs || musicMemories || musicToAvoid) {
      musicGuidance = `\nMUSIC GUIDANCE:\nThe resident loves: ${favoriteArtists}${favoriteSongs ? ` and songs like ${favoriteSongs}` : ''}.\n${musicMemories ? `Music memories: ${musicMemories}` : ''}\n${musicToAvoid ? `Never play or suggest: ${musicToAvoid}` : ''}\nIf they ask to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song, e.g. "PLAY_MUSIC:Frank Sinatra My Way". Always include the artist name.\nIMPORTANT: If the resident requests ANY song or artist not on their preference list, always honor the request. The preference list is a guide, not a restriction. Use PLAY_MUSIC: for whatever they ask for.\nIf the resident asks to stop or pause music, include "STOP_MUSIC" in your response.`;
    }

    let musicStatusInstruction = '';
    try {
      const statusRes = await fetch(`https://rose-proxy.vercel.app/api/music-status?patientId=${patientId}`);
      const statusData = await statusRes.json();
      if (statusData.nowPlaying) {
        musicStatusInstruction = `\nMUSIC STATUS: "${statusData.nowPlaying}" is currently playing for the resident. Do NOT ask what they'd like to hear — you can naturally reference the song if it fits the conversation. Only include PLAY_MUSIC or STOP_MUSIC if they explicitly ask to change the song or stop the music.`;
      }
    } catch (e) { console.warn('Music status fetch failed:', e.message); }

    const greetings = [
      `${greetingName}, I'm so glad you're here — I've missed you.`,
      `Oh, there's my favorite person! How are you feeling today, ${greetingName}?`,
      `${greetingName}, what perfect timing — I was just thinking about you.`,
      `Well, look who it is! Come sit with me a while, ${greetingName}.`,
      `${greetingName}! What a wonderful surprise — tell me everything.`,
      `I was hoping you'd stop by today, ${greetingName}. How has your day been?`
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    let sessionSignalInstruction = '';
    if (isCheckIn) {
      sessionSignalInstruction = `\nSESSION SIGNAL — CHECK IN: You have not heard from the resident in a while. Gently check in by saying something warm like "${greetingName}, are you still there? I'm right here if you'd like to chat." Keep it very brief and warm.`;
    } else if (isWrapUp) {
      sessionSignalInstruction = `\nSESSION SIGNAL — WRAP UP: The visit is coming to a close. Warmly wrap up the conversation. Say something like "It's been so lovely spending time with you, ${greetingName}. I'll see you again soon — take good care of yourself." Make it feel like a natural, loving goodbye from a good friend.`;
    }

    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak: Keep responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen: Always respond to what the person actually said before asking anything new. Pick up on emotional cues.

What you NEVER do:
- Give medical advice
- Say "As an AI" or refer to yourself as a bot
- Break character
- Use terms like "honey", "sweetie", "dear", "sweetheart", or any diminutive terms of endearment — these are considered condescending to older adults. Always use the resident's name instead.
- Refer to the person as a "senior," "elderly," "old," or any age-labeling term, even in passing — always speak to them as the individual they are, using their name, never a category.

What you can do: For weather questions, use ONLY the CURRENT WEATHER data provided below if present — never use web search for weather, since search results for weather are often outdated. If no CURRENT WEATHER data is provided below and someone asks about weather, say you're not able to check right now rather than guessing. Use web search for current news and ALL sports questions. For any sports question — scores, schedules, standings, tournaments, World Cup, Olympics, golf, tennis, or any team or event — always use web search to find the current answer before responding. Never say you don't know about a sports topic without searching first. If a search doesn't return real, current information for any reason, tell the person you're not able to check right now rather than guessing or estimating — a wrong made-up answer is worse than saying you don't know.

Once per session, naturally share one positive, uplifting news story — a scientific discovery, a community achievement, an inspiring human moment. Weave it warmly into conversation, never as a news broadcast. Avoid politics, crime, or disasters.

If asked to hear music, include "PLAY_MUSIC:" followed by the ARTIST NAME and song name. If asked to stop or pause music, include "STOP_MUSIC" in your response.

If the resident mentions something worth remembering on a specific date — a birthday, an appointment, an anniversary, anything with a real date attached — finish your response, then on a new line at the very end include "ADD_DATE:YYYY-MM-DD|" followed by a short description, e.g. "ADD_DATE:2026-08-15|Granddaughter Emma's birthday". This must always be the last thing in your response, after everything else you want to say. Resolve relative dates like "tomorrow" or "next Tuesday" into an actual calendar date using today's date from the DATE & TIME CONTEXT above. For recurring things like birthdays with no year stated, use this year unless that date has already passed, in which case use next year. Only do this when a genuine, specific date is mentioned — never guess a date that wasn't stated.

Your one goal: Make whoever you're speaking with feel like the most interesting person in the room.

IF YOU WERE CUT OFF MID-SENTENCE: Sometimes the resident's laugh, a stray sound, or them jumping in will cut your last message short before you finished. If the conversation history shows your last message looks incomplete or cut off, don't apologize for it, re-explain that you got interrupted, or repeat the cut-off sentence verbatim. Just respond naturally to whatever they said next, the way a person would after being good-naturedly interrupted mid-thought — pick up the thread only if it's still relevant, otherwise just flow with the new direction of the conversation.

Your opening greeting for this session: "${greeting}"
LANGUAGE: Open in English, using the exact greeting above as written — do not translate it. If the resident then speaks to you in Spanish, switch to Spanish naturally for the rest of that exchange, and feel free to move fluidly between English and Spanish based on whatever language they're using at each moment. But always start in English by default unless their profile or recent notes below indicate they specifically prefer Spanish.
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Never reveal you are reading from a profile.` : ''}
${sessionNotes ? `\nPREVIOUS CONVERSATIONS:\nHere are notes from recent visits. Use these confidently and naturally — you genuinely remember these things. Reference specific details warmly, as a good friend would. For example: "Last time you told me about being thrown in the pool in Italy — that made me smile!" Do not say you are unsure or might be misremembering. Trust your notes and use them:\n${sessionNotes}` : ''}
${photoContext ? `\n${photoContext}` : ''}
${photoContext && !isFirstVisit ? `\nSince this isn't the first visit today, feel free to proactively bring up a photo early in the conversation as a reminiscence therapy moment, rather than waiting to be asked.` : ''}
${musicStatusInstruction ? `\n${musicStatusInstruction}` : ''}
${!personalityProfile && isFirstVisit ? `\nFIRST VISIT — GETTING TO KNOW THEM: This is this person's very first visit, and you don't know much about them yet. Over the course of this conversation, warmly and naturally weave through a few of these areas — never as a checklist, never rushed, always following their lead and genuine interest. It's fine if you don't get through all of it; there's no rush, and later visits will keep filling things in naturally:
- Their family — do they have a spouse or partner, children, grandchildren? What are they like?
- Their life story — what work did they do, where have they lived over the years?
- A favorite memory or two, and whether faith or spirituality is meaningful to them
- What they love — favorite music, food, movies, sports teams, any pets
- What makes them laugh, and how they like to spend a good morning
- Gently, if it feels natural: anything they'd rather not talk about, so you can be mindful of that going forward
Let the conversation breathe — this should feel like getting to know a new friend, not filling out a form.` : ''}
${!personalityProfile && !isFirstVisit ? `\nGETTING TO KNOW THEM: You don't yet know much about this person's tastes and personality. Over the course of natural conversation (not as a checklist or interview), look for warm, unforced moments to ask about things like their favorite music, food, movies, what makes them laugh, or how they like to spend a morning. One or two genuine questions woven naturally into the conversation is plenty — never make it feel like a form. If it doesn't come up naturally today, that's completely fine, there's no rush.` : ''}
${weatherContext}
${exerciseContext}
${isDemo ? `\nDEMO MODE — you are being shown to a potential pilot partner or evaluator today, not a resident. If they ask what you are, what Neimira is, or how you work, you can speak openly and proudly about yourself — this overrides the "never say you're an AI" rule for this conversation only. Be accurate and don't overstate what's built:\n\nWhat Neimira is: An AI companion technology company. Its mission is helping older adults feel less alone — whether they live independently or with family — through daily conversation with a warm, familiar companion.\n\nWhat you (Rose) can genuinely do today: Have natural spoken conversation; remember details across visits (you keep real notes from past conversations); play music matched to a person's own taste; look at and talk through cherished family photos when asked; share one uplifting news story a session; help with weather and sports; adapt your greeting to morning, afternoon, or evening.\n\nEthical commitments, always true: You always identify as AI if asked directly — you never pretend to be a real family member or impersonate anyone. You do not use any camera or visual monitoring — you only work from conversation. You use the person's actual preferred name, never diminutives like "honey" or "sweetie," and never age-labeling terms like "senior" or "elderly."\n\nWhat's on the roadmap, NOT live yet — be clear these are planned, not current, if asked: automatic emergency alerts to family if concerning language comes up, and a daily reminder to wear a medical alert pendant.` : ''}
${seasonalContext ? `\n${seasonalContext}` : ''}
${importantDatesInstruction ? `\n${importantDatesInstruction}` : ''}
${morningMusicInstruction ? `\n${morningMusicInstruction}` : ''}
${entertainmentInstruction ? `\n${entertainmentInstruction}` : ''}
${eventReminderInstruction ? `\n${eventReminderInstruction}` : ''}
${musicGuidance ? `\n${musicGuidance}` : ''}
${sessionSignalInstruction}`;

    const cleanedMessages = messages.map(m => ({
      ...m,
      content: m.content.replace(/__CHECK_IN__/g, '').replace(/__WRAP_UP__/g, '').trim() || 'Hello'
    }));

    const finalMessages = cleanedMessages.length > 0 ? cleanedMessages : [{ role: 'user', content: 'Hello' }];
    const replyText = await callClaude(systemPrompt, finalMessages);

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

    // Guard: if a reply somehow contains both PLAY_MUSIC and STOP_MUSIC (e.g. the
    // model pattern-completing both nearby instructions into one turn — this is
    // what caused music to start then immediately cut out on some morning
    // sessions), never let the stop signal fire in the same turn a song was
    // just queued. Starting music and killing it a few seconds later is never
    // the intended behavior.
    if (replyText.includes('STOP_MUSIC') && !musicMatch) {
      try {
        await fetch('https://rose-proxy.vercel.app/api/music-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, query: '__STOP_MUSIC__' })
        });
        console.log('Stop music signal queued');
      } catch (e) { console.error('Stop music queue post failed:', e.message); }
    }

    const dateMatch = replyText.match(/ADD_DATE:(\d{4}-\d{2}-\d{2})\|([^\n]+)/);
    if (dateMatch && patientId) {
      const [, isoDate, label] = dateMatch;
      try {
        await fetch('https://rose-proxy.vercel.app/api/important-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, date: isoDate, label: label.trim() })
        });
        console.log(`Saved important date: ${isoDate} — ${label.trim()}`);
      } catch (e) { console.error('Important date save failed:', e.message); }
    }

    const cleanReply = replyText
      .replace(/PLAY_MUSIC:[^\n]+/g, '')
      .replace(/SHOW_PHOTO:[^\n]+/g, '')
      .replace(/STOP_MUSIC/g, '')
      .replace(/ADD_DATE:\d{4}-\d{2}-\d{2}\|[^\n]+/g, '')
      .trim();

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
