// ─────────────────────────────────────────────
//  /api/debug-voices  (TEMPORARY — delete once you've found a voice_id)
//  Just visit this URL in your browser after deploying:
//    https://rose-proxy.vercel.app/api/debug-voices
//  Pulls LiveAvatar's FULL voice catalog (following pagination) using the
//  API key already configured in Vercel, and groups voices by their actual
//  language code — so you can see Spanish (or any other) options directly,
//  no Discord or separate script needed.
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    let url = 'https://api.liveavatar.com/v1/voices';
    let allVoices = [];
    let pagesFetched = 0;
    let firstPageRaw = null;

    while (url && pagesFetched < 10) {
      const response = await fetch(url, { headers: { 'X-API-KEY': process.env.LIVEAVATAR_API_KEY } });
      const raw = await response.json();
      const data = raw.data || raw; // API wraps the real payload in a "data" field
      if (pagesFetched === 0) firstPageRaw = { status: response.status, keys: Object.keys(raw || {}) };
      if (!response.ok) {
        return res.status(200).json({ note: 'LiveAvatar returned an error mid-pagination.', status: response.status, raw });
      }
      const results = data.results || [];
      allVoices = allVoices.concat(results);
      url = data.next || null;
      pagesFetched++;
    }

    const byLanguage = {};
    for (const v of allVoices) {
      const lang = v.language || 'unknown';
      if (!byLanguage[lang]) byLanguage[lang] = [];
      byLanguage[lang].push({ id: v.id, name: v.name, gender: v.gender });
    }

    const nonEnglish = allVoices.filter(v => v.language && v.language !== 'en');

    return res.status(200).json({
      note: 'Temporary debug endpoint — delete api/debug-voices.js once you have found a voice_id.',
      totalVoices: allVoices.length,
      pagesFetched,
      firstPageRaw,
      languageCounts: Object.fromEntries(Object.entries(byLanguage).map(([k, v]) => [k, v.length])),
      nonEnglishVoices: nonEnglish.map(v => ({ id: v.id, name: v.name, language: v.language, gender: v.gender })),
      byLanguage
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
