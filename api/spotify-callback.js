
export default async function handler(req, res) {
  const AT = 'pat7fkWo0HF8HqVjB.d75cb4df659f4e13781aa603485b19fb2657f86a361d3dd453435bae5b34d0a3';
  const code = req.query.code;
  const patientId = req.query.state;

  if (!code || !patientId) {
    return res.status(400).send('Missing code or patientId');
  }

  const credentials = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=authorization_code&code=' + code + '&redirect_uri=https://rose-proxy.vercel.app/api/spotify-callback'
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return res.status(500).send('Token error: ' + JSON.stringify(tokenData));
  }

  const airtableRes = await fetch(
    'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
    {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + process.env.AIRTABLE_TOKEN,
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

  const airtableData = await airtableRes.json();
  console.log('Airtable response:', JSON.stringify(airtableData));

  return res.status(200).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#00BCD4">Spotify Connected!</h2><p>You can close this window.</p></body></html>');
}
