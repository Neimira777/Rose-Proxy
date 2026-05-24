
export const config = {
  api: {
    bodyParser: true,
  },
};


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  try {
    const airtableRes = await fetch(
      'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
      { headers: { 'Authorization': 'Bearer ' + process.env.AIRTABLE_WRITE_TOKEN } }
    );

    const airtableData = await airtableRes.json();
    const accessToken = airtableData.fields?.['Spotify Access Token'];
    const refreshToken = airtableData.fields?.['Spotify Refresh Token'];

    if (!accessToken) {
      return res.status(404).json({ error: 'No Spotify token found. Please authorize Spotify first.' });
    }

    // If we have a refresh token, get a fresh access token
    if (refreshToken) {
      const credentials = Buffer.from(
        process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
      ).toString('base64');

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + credentials,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=refresh_token&refresh_token=' + refreshToken
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        // Save new access token to Airtable
        await fetch(
          'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
          {
            method: 'PATCH',
            headers: {
              'Authorization': 'Bearer ' + process.env.AIRTABLE_WRITE_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: { 'Spotify Access Token': tokenData.access_token }
            })
          }
        );
        return res.status(200).json({ access_token: tokenData.access_token });
      }
    }

    // Return existing access token
    return res.status(200).json({ access_token: accessToken });

  } catch (e) {
    console.error('Spotify token error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
