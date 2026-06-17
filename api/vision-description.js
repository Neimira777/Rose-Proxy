// ─────────────────────────────────────────────
//  vision-description.js
//  Receives a photo URL, sends it to Claude vision,
//  returns a rich description and saves it to Airtable
//  POST /api/vision-description
//  Body: { recordId, photoUrl, peopleNames, occasion }
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recordId, photoUrl, peopleNames, occasion } = req.body || {};
  if (!recordId || !photoUrl) return res.status(400).json({ error: 'Missing recordId or photoUrl' });

  try {
    // ── Fetch the image and convert to base64 ──
    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) throw new Error('Could not fetch photo from URL');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    // ── Build the prompt for Claude vision ──
    const peopleContext = peopleNames
      ? `The family has identified the following people in this photo: ${peopleNames}. Use these names when describing who is where in the photo.`
      : 'No names have been provided yet. Describe the people by appearance, position, and approximate age.';

    const occasionContext = occasion
      ? `The occasion is: ${occasion}.`
      : 'No occasion has been specified.';

    const prompt = `You are helping an AI companion named Rose who speaks with elderly dementia patients. Rose will use your description to have warm, meaningful conversations about this family photo during reminiscence therapy sessions.

${peopleContext}
${occasionContext}

Please analyze this photo and provide a rich, warm description that includes:
1. Who is in the photo and where they are positioned (left, center, right, front, back)
2. Approximate ages of each person
3. The setting or location (living room, backyard, church, beach, etc.)
4. The approximate decade or year based on clothing, photo quality, and style
5. The occasion or event if identifiable (wedding, holiday, birthday, casual gathering)
6. The emotional tone and expressions (joyful, formal, relaxed, celebratory)
7. Any meaningful details (clothing, decorations, season, weather)

Write the description in a warm, natural way that Rose can draw from naturally in conversation. Keep it to 3-4 sentences maximum. Do not use bullet points. Write as if you are describing the photo to a caring friend.`;

    // ── Call Claude vision ──
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: contentType,
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error('Claude vision API error: ' + JSON.stringify(claudeData));

    const description = claudeData.content?.[0]?.text || '';
    if (!description) throw new Error('No description returned from Claude');

    console.log(`Vision description generated for record ${recordId}: ${description.substring(0, 100)}...`);

    // ── Build Full Context combining people names + description ──
    const fullContext = peopleNames
      ? `People: ${peopleNames}. ${occasion ? `Occasion: ${occasion}. ` : ''}${description}`
      : description;

    // ── Save back to Airtable Photos table ──
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Photos/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Claude Description': description,
            'Full Context': fullContext
          }
        })
      }
    );

    const airtableData = await airtableRes.json();
    if (!airtableRes.ok) throw new Error('Airtable save error: ' + JSON.stringify(airtableData));

    console.log(`Airtable updated for record ${recordId}`);

    return res.status(200).json({
      ok: true,
      description,
      fullContext
    });

  } catch (error) {
    console.error('Vision description error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
