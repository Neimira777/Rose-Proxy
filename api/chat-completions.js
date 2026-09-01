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
  const minute = localDate.getMinutes();
  // IMPORTANT: compute preciseTime from the original UTC 'now', not from
  // 'localDate' above. 'localDate' is already a timezone-shifted value (a
  // workaround for reading hour/timeOfDay), so applying toLocaleTimeString's
  // own timeZone conversion to it again double-shifts the result — this is
  // exactly the bug that made Rose/Jim think it was 1 PM when it was really
  // 5 PM. now.toLocaleTimeString() converts UTC → the target timezone once.
  const preciseTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
  let timeOfDay = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night';
  return { dayName, monthName, dayNum, year, hour, minute, preciseTime, timeOfDay, full: `${dayName}, ${monthName} ${dayNum}, ${year}` };
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
   - Sit comfortably, close your eyes if you'd like. We'll breathe in slowly, hold for a moment, then breathe out slowly, a few times together, nice and unhurried.

HOW TO COACH: Pick ONE or TWO routines that fit the conversation (a full session shouldn't be all seven at once unless asked). Guide one step at a time — give one instruction, then wait for their response before moving on, rather than reading the whole routine at once. Check in naturally ("How's that feeling?"). Always mention at the start: this isn't a substitute for their doctor's guidance, and to stop right away if anything hurts or feels wrong. Keep the tone like a caring friend, never a drill instructor — slow, encouraging, no pressure to keep going if they'd rather stop.

COUNTING REPS — IMPORTANT: Never count reps yourself in spoken words ("one... two... three..."). Spoken counting has no consistent pace and tends to come out too fast to actually follow along with. Instead, warmly introduce the movement and how many reps, e.g. "Let's do 8 arm raises together, nice and slow — I'll keep the count for you." Then, on a new line at the very end of that response, include "COUNT_REPS:" followed by the number of reps for that step, e.g. "COUNT_REPS:8". A real on-screen counter paces the count precisely for the resident, one number per second. This must always be the last thing in your response, same as ADD_DATE. Only include it once per exercise step, not on every follow-up message. After a counted step finishes, pick the conversation back up naturally and warmly, the way you'd check in after a friend caught their breath.

COOL-DOWN BREATHING — IMPORTANT: Never narrate the breathing counts yourself ("breathe in for 4, hold for 2..."). Like counting reps, spoken pacing for something this precise doesn't work reliably. Instead, warmly introduce that you'll breathe together, e.g. "Let's do a few slow breaths together — I'll guide the pace for you." Then, on a new line at the very end of that response, include "BREATHING:" followed by inhale seconds, hold seconds, exhale seconds, and number of cycles, separated by hyphens, e.g. "BREATHING:4-2-4-3" for a 4-second inhale, 2-second hold, 4-second exhale, repeated 3 times. A real on-screen guide paces each phase precisely for the resident. This must always be the last thing in your response, same as COUNT_REPS and ADD_DATE. Only include it once per breathing step. After it finishes, check in warmly before moving on.
`.trim();

// ── Cognitive games library — Wise Old Sayings & Finish the Lyrics.
// Same voice-only-coaching spirit as EXERCISE_ROUTINES: Rose/Jim cannot
// show anything on screen, so both games are led entirely through
// spoken back-and-forth. Never framed as a test — the point is the joy
// of remembering together, not accuracy or scoring.
//
// Copyright note: WISE_OLD_SAYINGS are public-domain proverbs. The
// PUBLIC_DOMAIN_SONGS lines are short excerpts from genuinely
// public-domain folk/patriotic/hymn songs. MODERN_SONGS are
// intentionally title/artist only — Rose/Jim must never recite or
// "check" lyrics for these; the member recalls and sings/says the
// line themselves, and Rose/Jim just responds warmly to whatever
// they offer. This keeps the product out of the business of
// reproducing copyrighted lyrics entirely. ──
const COGNITIVE_GAMES = `
WISE OLD SAYINGS (finish the proverb):
A stitch in time... / saves nine.
The early bird... / catches the worm.
Don't count your chickens... / before they hatch.
Actions speak louder than... / words.
A penny saved is... / a penny earned.
When it rains... / it pours.
Better late than... / never.
Don't judge a book by... / its cover.
Birds of a feather... / flock together.
Every cloud has a... / silver lining.
You can't have your cake and... / eat it too.
Practice makes... / perfect.
Absence makes the heart... / grow fonder.
The grass is always greener... / on the other side.
Where there's a will... / there's a way.
Don't cry over spilled... / milk.
Two heads are better than... / one.
A watched pot never... / boils.
Honesty is the best... / policy.
Curiosity killed the... / cat.
All that glitters is not... / gold.
When in Rome, do as the... / Romans do.
The pen is mightier than the... / sword.
You can lead a horse to water, but... / you can't make it drink.
Out of sight... / out of mind.
Slow and steady wins the... / race.
A friend in need is a... / friend indeed.
Rome wasn't built in a... / day.
The apple doesn't fall far from the... / tree.
Look before you... / leap.

FINISH THE LYRICS — PUBLIC DOMAIN SONGS (safe to sing the line yourself, these are genuinely out of copyright):
"You Are My Sunshine": You are my sunshine, my only sunshine... / you make me happy, when skies are gray.
"This Land Is Your Land": This land is your land, this land is my land... / from California, to the New York island.
"Amazing Grace": Amazing grace, how sweet the sound... / that saved a wretch like me.
"Take Me Out to the Ball Game": Take me out to the ball game... / take me out with the crowd.
"Home on the Range": Oh, give me a home... / where the buffalo roam.
"Oh Susanna": Oh, Susanna, oh don't you cry for me... / for I come from Alabama, with my banjo on my knee.
"When the Saints Go Marching In": Oh, when the saints... / go marching in.
"Down by the Riverside": Gonna lay down my burden... / down by the riverside.
"My Old Kentucky Home": The sun shines bright... / on my old Kentucky home.
"For He's a Jolly Good Fellow": For he's a jolly good fellow... / for he's a jolly good fellow.

FINISH THE LYRICS — MODERN CLASSICS (title/artist ONLY — you do not have the actual lyrics and must NEVER recite or invent them; name the song and let the resident recall and sing/say a line themselves, then respond warmly to whatever they offer):
"Fly Me to the Moon" — Frank Sinatra (1960s standard)
"What a Wonderful World" — Louis Armstrong (1960s)
"Stand By Me" — Ben E. King (1960s)
"My Girl" — The Temptations (1960s Motown)
"Unchained Melody" — The Righteous Brothers (1960s)
"Sweet Caroline" — Neil Diamond (1969)
"I Walk the Line" — Johnny Cash (1950s)
"Blue Suede Shoes" — Elvis Presley (1950s)
"Moon River" — Andy Williams (1960s)
"Dancing Queen" — ABBA (1970s)
"You've Got a Friend" — Carole King / James Taylor (1970s)
"Bridge Over Troubled Water" — Simon & Garfunkel (1970s)

HOW TO PLAY: Introduce it warmly and low-key, e.g. "I love these old sayings — want to finish a few with me?" or "Want to sing a few old favorites with me?" Never frame either game as a test, quiz, or memory check. Pick 3-5 items for this visit, not the whole list. For Wise Old Sayings and the public-domain songs, say the first part, then pause for the resident to finish it. For modern classics, just name the song and artist and invite them to recall or sing a line — never supply or verify the words yourself. Respond with genuine warmth to whatever they offer, correct or not ("That's it exactly!" or, if they don't finish it, share the ending yourself as if reminiscing together and move on right away). Never keep score, never say "you got X right," never compare across visits. If they'd rather not play or seem done, drop it completely and move on naturally.
`.trim();

function getSeasonalContext(hometown) {


  const { full, timeOfDay, preciseTime } = getLocalDateTime(hometown);
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
  let context = `DATE & TIME CONTEXT:\nToday is ${full}. It is currently ${timeOfDay} for the resident — the precise local time right now is ${preciseTime}.\nIMPORTANT: On the FIRST message of each session, naturally weave in the day, date, AND year — never as a quiz or reminder, just warmly in passing.\nEVENT TIMING: If your notes or earlier in this conversation mention telling the resident about something happening at a specific time (a game, a show, an appointment), check that time against the precise current time above before asking about it. Don't ask "how was it" or speak of it in the past tense unless it has actually had time to happen or finish by now. If it hasn't started yet, you can build anticipation instead ("not long now!"); if it's likely still in progress, you can ask how it's going so far, phrased as ongoing, not finished.\n\nSEASONAL CONTEXT:\nIt is currently ${season}. ${seasonPrompts[season]}`;
  if (upcoming.length > 0) context += `\nUpcoming holidays: ${upcoming.join(' ')}\nWeave upcoming holidays naturally into conversation.`;
  return context;
}

// ── Claude API call ──
async function callClaude(systemPrompt, messages, maxTokens = 400) {
  const ANTHROPIC_HEADERS = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };
  const CLAUDE_BODY = (msgs) => JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens, // trimmed to 400 by default for snappier replies, but the first message of a morning session gets more room — see call site — since it has to cover the date, weather/clothing, AND music in one reply, and a tight cap was silently truncating music off the end.
    system: systemPrompt,
    messages: msgs,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: ANTHROPIC_HEADERS, body: CLAUDE_BODY(messages)
  });
  let data = await response.json();
  if (!response.ok) {
    // Previously this discarded the real reason for the failure entirely —
    // just "Anthropic API error" with no status code or details, a dead
    // end for debugging. Now the actual status and response body get
    // logged so a rare failure like this is diagnosable, not a black box.
    console.error('Anthropic API error — status:', response.status, '| body:', JSON.stringify(data));
    throw new Error(`Anthropic API error (status ${response.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }
  let loopCount = 0;
  while (data.stop_reason === 'tool_use' && loopCount < 3) {
    loopCount++;
    const toolUseBlock = data.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;
    messages = [...messages, { role: 'assistant', content: data.content }];
    messages = [...messages, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: 'Web search is unavailable right now — do not guess or estimate an answer. Tell the person you are unable to check that right now.' }] }];
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: ANTHROPIC_HEADERS, body: CLAUDE_BODY(messages) });
    data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error in tool loop — status:', response.status, '| body:', JSON.stringify(data));
      throw new Error(`Anthropic API error in tool loop (status ${response.status}): ${data?.error?.message || JSON.stringify(data)}`);
    }
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

    // ── Single shared Airtable fetch ──
    // Previously this made two separate calls to the exact same record —
    // one for session flags (visit count, demo, event reminder, language),
    // one for the full profile on cache misses. Same URL, same record,
    // fetched twice back to back on every cache-miss turn (which includes
    // every session's opening message — the moment latency is most
    // noticeable). Merged into one fetch; both sets of fields are parsed
    // from the single response below.
    let visitCountToday = 1;
    let isDemo = false;
    let eventReminderLabel = '';
    let preferredLanguageCode = 'en';
    let sharedAirtableData = null;
    try {
      const sessionRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      sharedAirtableData = await sessionRes.json();
      const activeSession = sharedAirtableData.fields?.['Active Session'] || '';
      const parts = activeSession.split('|');
      if (parts[1]) visitCountToday = parseInt(parts[1]) || 1;
      if (parts.includes('demo')) isDemo = true;
      const eventPart = parts.find(p => p.startsWith('event:'));
      if (eventPart) eventReminderLabel = eventPart.slice('event:'.length).trim();
      const langPart = parts.find(p => p.startsWith('lang:'));
      if (langPart) preferredLanguageCode = langPart.slice('lang:'.length).trim() || 'en';
    } catch(e) {}
    const isFirstVisit = visitCountToday <= 1;
    console.log('Visit count today:', visitCountToday, '— isFirstVisit:', isFirstVisit, '— isDemo:', isDemo, '— eventReminderLabel:', eventReminderLabel, '— preferredLanguageCode:', preferredLanguageCode);


    const messages = allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '' }));

    // ── FIX (Sep 1, 2026): isFirstMessage bug ──
    // Previously computed as !messages.some(m => m.role === 'assistant') —
    // "true only if no assistant turn exists yet." That's wrong for how
    // HeyGen's LiveAvatar actually works: the avatar SPEAKS its opening
    // greeting (from the "Your opening greeting for this session" line in
    // the system prompt below) via HeyGen's own text-to-speech BEFORE this
    // endpoint is ever called. By the time the resident replies and this
    // endpoint fires for the first time, the message history HeyGen sends
    // already contains that greeting as an assistant turn — so the OLD
    // check evaluated to false on what is, in reality, the very first
    // exchange of every single session. This silently broke morning music,
    // the wardrobe/clothing suggestion, the Daily Interest Briefing, and
    // the event-reminder opening line — all four gated on isFirstMessage —
    // confirmed via Vercel logs showing isFirstMessage: false on a call
    // whose lastUserContent was literally "Good morning." Now checks for
    // exactly one USER message instead, which correctly identifies "the
    // resident's first reply" regardless of whether HeyGen's own greeting
    // already added an assistant turn to the history.
    const isFirstMessage = messages.filter(m => m.role === 'user').length === 1;

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
    let companion = 'Rose';

    if (isCacheValid(patientId)) {
      const cache = getCache(patientId);
      ({ patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists,
         musicToAvoid, morningPlaylist, musicMemories, hometown, photoContext, photoMap,
         entertainmentInterests, companion } = cache);
    } else {
      try {
        // Reuse the record already fetched above — no second fetch needed.
        const airtableData = sharedAirtableData || {};
        const f = airtableData.fields || {};

        greetingName = f['Preferred Name'] || f['Patient Full Name'] || '';
        companion = f['Preferred Companion'] || 'Rose';
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

      setCache(patientId, { patientProfile, greetingName, favoriteTeamsRaw, favoriteSongs, favoriteArtists, musicToAvoid, musicMemories, morningPlaylist, hometown, entertainmentInterests, companion });
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

    // ── Cognitive games trigger (Wise Old Sayings & Finish the Lyrics) ──
    // Same two-part pattern as exercise: keyword match on either side of
    // the conversation (so a simple "yes" after Rose/Jim's own offer still
    // counts), PLUS an occasional proactive offer to keep visits varied —
    // deliberately placed outside the morning slot so it doesn't compete
    // with the exercise offer, and only from the second visit of the day
    // onward so it never gets in the way of first-visit getting-to-know-you
    // conversation. This mirrors the same "part of the regular visit
    // rotation" spirit as chair exercises, just filling a different slot.
    const gamesKeywords = /\b(game|games|play a game|old saying|old sayings|proverb|proverbs|wise old sayings|finish the lyric|finish the lyrics|lyrics|sing along|name that tune)\b/i;
    const wantsGame = gamesKeywords.test(lastUserContent) || gamesKeywords.test(lastAssistantContent);
    const gameProactiveOffer = !isFirstVisit && !isMorningSession(hometown) && Math.random() < 0.35;
    const includeGames = wantsGame || gameProactiveOffer;
    const gamesContext = includeGames ? `\n${COGNITIVE_GAMES}` : '';
    const gamesProactiveInstruction = (gameProactiveOffer && !wantsGame)
      ? `\nGAME OFFER: Somewhere natural in this visit (not stacked on top of the greeting), warmly offer to play Wise Old Sayings or Finish the Lyrics as a choice, not an instruction — e.g. "Want to finish a few old sayings with me, or sing a few favorites together?" If they're interested, use the COGNITIVE GAMES content above. If they'd rather not or don't respond to the offer, drop it completely and never push.`
      : '';

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
          photoContext = `FAMILY PHOTOS (Reminiscence Therapy):\nYou have family photos available to display on screen. Photos available: ${photoNames}.\n\nIf asked to see or show a photo, warmly say something like "I have a beautiful photo I'd love to show you!" then include SHOW_PHOTO:[photo name] to display it. After showing the photo, ask a gentle open-ended question to spark memory. Listen warmly and follow their lead. The SHOW_PHOTO signal must exactly match one of these names: ${photoNames}. Never mention you are reading from a list.\n\nHARD RULE: NEVER include SHOW_PHOTO in a response unless you have ALSO spoken a sentence in that SAME response telling them you're showing them a photo. The two must always happen together — speaking about it AND the signal, in the same message, never the signal alone with no mention of it. If you're not going to say something about showing them a photo out loud, don't include SHOW_PHOTO at all.`;
          console.log('Photos table photoMap:', JSON.stringify(Object.keys(photoMap)));
        }
      }
    } catch(e) { console.error('Photos table fetch error:', e.message); }

    // Reuse the same shared record fetched at the top of the request —
    // this was a third identical fetch to the exact same patientId record,
    // happening on every single message unconditionally.
    sessionNotes = sharedAirtableData?.fields?.['SessionNotes'] || '';
    importantDatesRaw = sharedAirtableData?.fields?.['Important Dates'] || '';

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
        if (randomSong) {
          morningMusicInstruction += `\nMORNING MUSIC: Music is already being started for this resident behind the scenes — you don't need to trigger it yourself. Just naturally mention "I put on ${randomSong} for you this morning" somewhere warm and early in your reply.`;
          // Queue the song directly, deterministically — this used to rely
          // entirely on the model remembering to include PLAY_MUSIC: in its
          // generated reply, which proved unreliable across a couple of real
          // mornings (the instruction would get followed for weather/clothing
          // but silently dropped for music). This is a simple, predictable
          // rule — first message of a morning session, song exists, play it —
          // exactly the kind of thing that shouldn't depend on an LLM
          // choosing to comply correctly every single time.
          try {
            await fetch('https://rose-proxy.vercel.app/api/music-queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ patientId, query: `${artistHint}${randomSong}`.trim() })
            });
          } catch (e) { console.error('Deterministic morning music queue failed:', e.message); }
        }
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

    // ── Graceful wrap-up flag ──
    // Set by launch.html a couple of minutes before a visit's normal
    // duration is up (see wrapUpTimer there). Checked here, on every
    // reply, the same way musicStatus is checked above — if set, this
    // combines with the existing __WRAP_UP__ sentinel below so Rose/Jim
    // naturally closes the conversation warmly on their next reply,
    // instead of the resident being cut off abruptly by launch.html's
    // hard timer mid-sentence. A long-winded resident just gets one more
    // natural back-and-forth before the goodbye, rather than silence.
    let visitTimeWrapUp = false;
    try {
      const wrapUpRes = await fetch(`https://rose-proxy.vercel.app/api/wrap-up-flag?patientId=${patientId}`);
      const wrapUpData = await wrapUpRes.json();
      visitTimeWrapUp = !!wrapUpData.wrapUp;
    } catch (e) { console.warn('Wrap-up flag fetch failed:', e.message); }

    const greetingsRose = [
      `${greetingName}, I'm so glad you're here — I've missed you.`,
      `Oh, there's my favorite person! How are you feeling today, ${greetingName}?`,
      `${greetingName}, what perfect timing — I was just thinking about you.`,
      `Well, look who it is! Come sit with me a while, ${greetingName}.`,
      `${greetingName}! What a wonderful surprise — tell me everything.`,
      `I was hoping you'd stop by today, ${greetingName}. How has your day been?`
    ];
    const greetingsJim = [
      `Well hey there, ${greetingName}. Good to see you.`,
      `${greetingName}. Come on and sit a spell, tell me how you're doing.`,
      `There you are, ${greetingName}. I was just sitting here thinking.`,
      `Good to have the company, ${greetingName}. How's the day treating you?`,
      `${greetingName}, glad you came by. What's on your mind today?`,
      `Well look who it is. Sit down, ${greetingName}, stay a while.`
    ];
    const greetings = companion === 'Jim' ? greetingsJim : greetingsRose;
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    let sessionSignalInstruction = '';
    if (isCheckIn) {
      sessionSignalInstruction = `\nSESSION SIGNAL — CHECK IN: You have not heard from the resident in a while. Gently check in by saying something warm like "${greetingName}, are you still there? I'm right here if you'd like to chat." Keep it very brief and warm.`;
    } else if (isWrapUp || visitTimeWrapUp) {
      sessionSignalInstruction = `\nSESSION SIGNAL — WRAP UP: The visit is coming to a close. Warmly wrap up the conversation. Say something like "It's been so lovely spending time with you, ${greetingName}. I'll see you again soon — take good care of yourself." Make it feel like a natural, loving goodbye from a good friend.`;
    }

    const companionIdentity = companion === 'Jim'
      ? `You are Jim, a warm, steady presence — the kind of company that feels like sitting on the porch with an old friend. You're not effusive or bubbly; your warmth comes through in how present and unhurried you are, not in enthusiasm. You're comfortable with quiet moments and don't rush to fill silence. You have an easy, dry sense of humor and enjoy a good story, but you're a good listener first — you'd rather hear their story than tell your own. You speak plainly and warmly, like someone who's lived a full life and isn't in a hurry about anything.`
      : `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.`;

    const systemPrompt = `${companionIdentity}

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
LANGUAGE: ${preferredLanguageCode === 'en'
  ? `Open in English, using the exact greeting above as written — do not translate it. If the resident then speaks to you in another language, switch naturally for the rest of that exchange and feel free to move fluidly between languages based on whatever they're using at each moment.`
  : `This resident's preferred language is set to "${preferredLanguageCode}". Open the conversation in that language — translate the spirit and warmth of the greeting above into it naturally, rather than a literal word-for-word translation. If they respond in English or another language, switch fluidly to match them for the rest of that exchange, the same way you'd naturally move between languages with a bilingual friend.`}
${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Never reveal you are reading from a profile.` : ''}
${sessionNotes ? `\nPREVIOUS CONVERSATIONS:\nHere are notes from recent visits. Use these confidently and naturally — you genuinely remember these things. Reference specific details warmly, as a good friend would. For example: "Last time you told me about being thrown in the pool in Italy — that made me smile!" Do not say you are unsure or might be misremembering. Trust your notes and use them:\n${sessionNotes}` : ''}
${photoContext ? `\n${photoContext}` : ''}
${photoContext && !isFirstVisit && Math.random() < 0.3 ? `\nSince this isn't the first visit today, you could proactively bring up a photo early in the conversation as a reminiscence therapy moment, rather than waiting to be asked — but only do this occasionally, not as a routine. Most visits should NOT include a proactive photo; save it for when it'll feel like a genuine, special moment rather than something expected every time.` : ''}
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
${gamesContext}${gamesProactiveInstruction}
${isDemo ? `\nDEMO MODE — you are being shown to a potential pilot partner or evaluator today, not a resident. If they ask what you are, what Neimira is, or how you work, you can speak openly and proudly about yourself — this overrides the "never say you're an AI" rule for this conversation only. Be accurate and don't overstate what's built:\n\nWhat Neimira is: An AI companion technology company. Its mission is helping older adults feel less alone — whether they live independently or with family — through daily conversation with a warm, familiar companion.\n\nWhat you (${companion}) can genuinely do today: Have natural spoken conversation; remember details across visits (you keep real notes from past conversations); play music matched to a person's own taste; look at and talk through cherished family photos when asked; share one uplifting news story a session; help with weather and sports; adapt your greeting to morning, afternoon, or evening.\n\nEthical commitments, always true: You always identify as AI if asked directly — you never pretend to be a real family member or impersonate anyone. You do not use any camera or visual monitoring — you only work from conversation. You use the person's actual preferred name, never diminutives like "honey" or "sweetie," and never age-labeling terms like "senior" or "elderly."\n\nWhat's on the roadmap, NOT live yet — be clear these are planned, not current, if asked: automatic emergency alerts to family if concerning language comes up, and a daily reminder to wear a medical alert pendant.` : ''}
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
    // First message of a morning session has to cover a lot in one reply —
    // date/day, weather-based clothing, AND music — so it gets more room
    // than a normal turn to avoid silently truncating one of those off the end.
    const replyMaxTokens = (isMorningSession(hometown) && isFirstMessage) ? 600 : 400;
    const replyText = await callClaude(systemPrompt, finalMessages, replyMaxTokens);

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

    // ── Rep-count signal — decouples counting from Rose/Jim's speech ──
    // entirely. She never speaks the numbers herself (see COUNTING REPS
    // instructions above); this queues the count for launch.html's real
    // setInterval-based timer to pace at an actual one-second cadence.
    const countMatch = replyText.match(/COUNT_REPS:(\d+)/);
    if (countMatch && patientId) {
      const repCount = parseInt(countMatch[1]);
      if (repCount > 0) {
        try {
          await fetch('https://rose-proxy.vercel.app/api/exercise-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, count: repCount })
          });
          console.log(`Queued exercise count: ${repCount}`);
        } catch (e) { console.error('Exercise count queue failed:', e.message); }
      }
    }

    // ── Breathing signal — same decoupling logic as COUNT_REPS, but for
    // three phases of different lengths instead of one number ticking up.
    // Rose/Jim never narrates the counts; a real front-end timer paces
    // inhale/hold/exhale precisely instead of relying on TTS pacing. ──
    const breathingMatch = replyText.match(/BREATHING:(\d+)-(\d+)-(\d+)-(\d+)/);
    if (breathingMatch && patientId) {
      const [, inhale, hold, exhale, cycles] = breathingMatch;
      const pattern = `${inhale}-${hold}-${exhale}-${cycles}`;
      try {
        await fetch('https://rose-proxy.vercel.app/api/breathing-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, pattern })
        });
        console.log(`Queued breathing pattern: ${pattern}`);
      } catch (e) { console.error('Breathing queue failed:', e.message); }
    }

    const cleanReply = replyText
      .replace(/PLAY_MUSIC:[^\n]+/g, '')
      .replace(/SHOW_PHOTO:[^\n]+/g, '')
      .replace(/STOP_MUSIC/g, '')
      .replace(/ADD_DATE:\d{4}-\d{2}-\d{2}\|[^\n]+/g, '')
      .replace(/COUNT_REPS:\d+/g, '')
      .replace(/BREATHING:\d+-\d+-\d+-\d+/g, '')
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
        ? existing + `\nMember: ${lastUser}\n${companion}: ${cleanReply}`
        : `Member: ${lastUser}\n${companion}: ${cleanReply}`;
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
    // Even on a real failure, the companion should never just go silent —
    // for a member mid-conversation, unexplained dead air is confusing at
    // best and worrying at worst. This returns a warm, human fallback line
    // instead of a bare error, in the exact same response shape as a normal
    // successful reply (streaming or not) so the avatar actually says it.
    const fallbackReply = "I'm having a little trouble connecting right now — give me just a moment, and let's try again in a bit.";
    const isStreamingFallback = req.body && req.body.stream === true;
    if (isStreamingFallback) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.status(200);
      const chunkId = 'chatcmpl-' + Date.now();
      const created = Math.floor(Date.now() / 1000);
      res.write('data: ' + JSON.stringify({ id: chunkId, object: 'chat.completion.chunk', created, model: 'claude-haiku-4-5-20251001', choices: [{ index: 0, delta: { role: 'assistant', content: fallbackReply }, finish_reason: null }] }) + '\n\n');
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
      choices: [{ index: 0, message: { role: 'assistant', content: fallbackReply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
  }
}
