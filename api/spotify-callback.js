export default async function handler(req, res) {
  const { code, state: patientId, error } = req.query;

  if (error) return res.status(400).send(`Spotify authorization failed: ${error}`);
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
