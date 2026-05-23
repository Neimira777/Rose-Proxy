export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, patientId } = req.body;

    // Fetch patient profile from Airtable if patientId provided
    let patientProfile = '';
    if (patientId) {
      try {
        const airtableRes = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`
            }
          }
        );
        const airtableData = await airtableRes.json();
        const f = airtableData.fields;

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
Favorite music: ${f['Favorite Music'] || ''}
Favorite foods: ${f['Favorite Foods'] || ''}
Favorite TV/movies: ${f['Favorite TV'] || ''}
Pets: ${f['Pets'] || ''}
Topics to avoid: ${f['Topics To Avoid'] || ''}
Cognitive notes: ${f['Cognitive Notes'] || ''}
Additional notes: ${f['Additional Notes'] || ''}
        `.trim();
      } catch (e) {
        console.error('Airtable fetch error:', e);
      }
    }

    const systemPrompt = `You are Rose, a warm and genuine companion. You speak the way a trusted old friend would — unhurried, present, and always interested in the person in front of you.

How you speak:
Keep your responses short — two to three sentences at most. Speak conversationally, never formally. Use natural language, contractions, and warmth. Never use bullet points, lists, or clinical language.

How you listen:
Always respond to what the person actually said before asking anything new. Pick up on emotional cues. If they sound wistful, meet them there. If they're playful, be playful back.

What you never do:
Give medical advice. Discuss politics or news. Say "As an AI" or refer to yourself as a bot. Never break character.
What you can look up:
If the patient asks about the weather, use your web search tool to find the current weather for their Hometown and share it warmly and naturally in conversation.

Your one goal:
Make whoever you're speaking with feel like the most interesting person in the room.

${patientProfile ? `\n${patientProfile}\n\nUse this profile to make conversations deeply personal. Reference their family, memories, and interests naturally — never all at once, but weave them in warmly over time. Never reveal that you are reading from a profile.` : ''}`;

    const anthropicMessages = (messages || []).filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
         'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
     model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: [
    {
      type: "web_search_20250305",
      name: "web_search"
    }
  ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Internal server error' });
    }
const replyText = data.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('\n');

    res.status(200).json({
      choices: [{
        message: {
          role: 'assistant',
          content: replyText
        }
      }]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
