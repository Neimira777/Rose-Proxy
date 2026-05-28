// ─────────────────────────────────────────────
//  /api/models
//  Returns an OpenAI-compatible models list
//  D-ID calls this endpoint to populate the Model dropdown
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    object: 'list',
    data: [
      {
        id: 'claude-haiku-4-5-20251001',
        object: 'model',
        created: 1700000000,
        owned_by: 'anthropic'
      }
    ]
  });
}
