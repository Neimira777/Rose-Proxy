export default function handler(req, res) {
  const { patientId } = req.query;
  if (!patientId) return res.status(400).json({ error: 'Missing patientId' });

  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: 'https://rose-proxy.vercel.app/api/spotify-callback',
    state: patientId
  });

  return res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
