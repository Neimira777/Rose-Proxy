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
  try {
    let url = 'https://api.liveavatar.com/v1/voices?voice_type=public&page_size=100';
    let allVoices = [];
    let pagesFetched = 0;

    while (url && pagesFetched < 10) {
      const response = await fetch(url, { headers: { 'X-API-KEY': process.env.LIVEAVATAR_API_KEY } });
      const data = await response.json();
      if (!response.ok) {
        return res.status(200).json({ note: 'LiveAvatar returned an error mid-pagination.', status: response.status, raw: data });
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
      languageCounts: Object.fromEntries(Object.entries(byLanguage).map(([k, v]) => [k, v.length])),
      nonEnglishVoices: nonEnglish.map(v => ({ id: v.id, name: v.name, language: v.language, gender: v.gender })),
      byLanguage
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
