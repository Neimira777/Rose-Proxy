export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    object: 'list',
    data: [
      {
        id: 'claude-3-5-haiku-20241022',
        object: 'model',
        created: 1700000000,
        owned_by: 'anthropic'
      }
    ]
  });
}
