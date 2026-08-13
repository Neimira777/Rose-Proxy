export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { patientId } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
  try {
    // Fetch tokens from Airtable
    const airtableRes = await fetch(
      'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
      { headers: { 'Authorization': 'Bearer ' + process.env.AIRTABLE_WRITE_TOKEN } }
    );
    const airtableData = await airtableRes.json();
    const accessToken = airtableData.fields?.['Spotify Access Token'];
    const refreshToken = airtableData.fields?.['SpotifyRefreshToken'];
    if (!accessToken) {
      return res.status(404).json({ error: 'No Spotify token found. Please authorize Spotify first.' });
    }
    // If we have a refresh token, always get a fresh access token
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
      // ── Handle invalid_grant — token expired or revoked ──
      if (tokenData.error === 'invalid_grant') {
        console.error('Spotify invalid_grant — refresh token expired. Reauthorization required.');
        // Discard the stored refresh token so we don't keep retrying
        await fetch(
          'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
          {
            method: 'PATCH',
            headers: {
              'Authorization': 'Bearer ' + process.env.AIRTABLE_WRITE_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                'SpotifyRefreshToken': '',
                'Spotify Access Token': ''
              }
            })
          }
        );
        return res.status(401).json({
          error: 'spotify_reauth_required',
          message: 'Spotify authorization has expired. Please reauthorize at /api/spotify-login'
        });
      }
      if (tokenData.access_token) {
        // Save new access token and rotate refresh token if Spotify issued a new one
        await fetch(
          'https://api.airtable.com/v0/appnW28KnOAO9UI9K/tblWZWMZNWfpbVVRX/' + patientId,
          {
            method: 'PATCH',
            headers: {
              'Authorization': 'Bearer ' + process.env.AIRTABLE_WRITE_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                'Spotify Access Token': tokenData.access_token,
                ...(tokenData.refresh_token && { 'SpotifyRefreshToken': tokenData.refresh_token })
              }
            })
          }
        );
        return res.status(200).json({ access_token: tokenData.access_token });
      }
      // ── Refresh attempt failed for some reason other than invalid_grant ──
      // Previously this just logged the raw tokenData object with no status
      // code and silently fell back to the OLD access token stored in
      // Airtable below — an access token that's very likely ALSO already
      // expired (Spotify access tokens last about an hour), since the
      // whole reason we're in this refresh branch is that we always try
      // to get a fresh one. That silent fallback to a stale token is the
      // most likely cause of a burst of 401s and failed WebSocket
      // connections on the front end: real errors with no clear reason.
      // Now the actual HTTP status and full response body get logged, so
      // a repeat of this is actually diagnosable — same fix pattern as
      // the Anthropic API error logging from the chat-completions bug.
      console.error('Spotify refresh failed — status:', tokenRes.status, '| body:', JSON.stringify(tokenData));
    }
    // Fall back to existing access token if refresh unavailable or failed.
    // Kept as a last resort (better than returning nothing at all if the
    // stored token happens to still be valid), but now at least the
    // failure that led here is actually logged with real detail above.
    return res.status(200).json({ access_token: accessToken });
  } catch (e) {
    console.error('Spotify token error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
