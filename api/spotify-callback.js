
export default async function handler(req, res) {
  const { code, state: patientId, error } = req.query;

  if (error) return res.status(400).send('Spotify authorization failed');
  if (!code || !patientId) return res.status(400).send('Missing code or patientId');

  try {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://rose-proxy.vercel.app/api/spotify-callback'
      })
    });
if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Spotify token response:', JSON.stringify(tokenData));
      return res.status(500).send('Failed to get Spotify tokens: ' + JSON.stringify(tokenData));
   
    }
    

    await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}/${patientId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Spotify Access Token': tokenData.access_token,
            'Spotify Refresh Token': tokenData.refresh_token
          }
        })
      }
    );

    return res.status(200).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#00BCD4">Spotify Connected!</h2><p>You can close this window.</p></body></html>');

  } catch (e) {
    console.error('Spotify callback error:', e.message);
    return res.status(500).send('Server error');
  }
}
