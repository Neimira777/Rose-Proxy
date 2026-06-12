// ─────────────────────────────────────────────
//  api/liveavatar-setup.js
//  ONE-TIME SETUP ONLY — delete after running!
//  Registers Anthropic API key with LiveAvatar
//  and creates a custom LLM configuration
//  pointing to your chat-completions endpoint
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Step 1: Register Anthropic API key as a secret ──
    console.log('Step 1: Registering secret...');
    const secretRes = await fetch('https://api.liveavatar.com/v1/secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.LIVEAVATAR_API_KEY
      },
      body: JSON.stringify({
        secret_type: 'OPENAI_API_KEY',
        secret_value: process.env.ANTHROPIC_API_KEY,
        secret_name: 'Neimira Claude'
      })
    });
    const secretData = await secretRes.json();
    console.log('Secret response:', JSON.stringify(secretData));

    if (!secretRes.ok || !secretData.data?.secret_id) {
      return res.status(500).json({
        step: 'register_secret',
        error: 'Failed to register secret',
        details: secretData
      });
    }

    const secretId = secretData.data.secret_id;

    // ── Step 2: Create LLM configuration ──
    console.log('Step 2: Creating LLM configuration...');
    const llmRes = await fetch('https://api.liveavatar.com/v1/llm-configurations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.LIVEAVATAR_API_KEY
      },
      body: JSON.stringify({
        display_name: 'Neimira Claude',
        model_name: 'claude-haiku-4-5-20251001',
        secret_id: secretId,
        base_url: 'https://rose-proxy.vercel.app/api'
      })
    });
    const llmData = await llmRes.json();
    console.log('LLM config response:', JSON.stringify(llmData));

    if (!llmRes.ok || !llmData.data?.id) {
      return res.status(500).json({
        step: 'create_llm_config',
        error: 'Failed to create LLM configuration',
        secret_id: secretId,
        details: llmData
      });
    }

    const llmConfigId = llmData.data.id;

    // ── Success ──
    return res.status(200).json({
      success: true,
      secret_id: secretId,
      llm_configuration_id: llmConfigId,
      message: 'Setup complete! Save these IDs then delete this file from GitHub.'
    });

  } catch (error) {
    console.error('Setup error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
