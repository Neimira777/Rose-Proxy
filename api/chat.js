<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' blob: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neimira — Visit with Rose</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #F5F6F8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    .logo-area { text-align: center; margin-bottom: 40px; }
    .logo-title {
      font-size: 28px; font-weight: 700; letter-spacing: 6px;
      text-transform: uppercase; color: #1A237E;
    }
    .logo-tagline {
      font-size: 12px; letter-spacing: 3px;
      text-transform: uppercase; color: #00BCD4; margin-top: 6px;
    }
    .mode-container { width: 100%; max-width: 600px; }
    .mode-card {
      background: white; border-radius: 20px; padding: 40px;
      margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center;
    }
    .mode-card h2 {
      color: #1A237E; font-size: 20px; letter-spacing: 2px;
      text-transform: uppercase; margin-bottom: 10px;
    }
    .mode-card p { color: #666; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
    .patient-list { display: none; flex-direction: column; gap: 12px; margin-top: 16px; }
    .patient-btn {
      background: linear-gradient(135deg, #00BCD4, #2979FF);
      color: white; border: none; border-radius: 12px; padding: 16px 24px;
      font-size: 16px; font-weight: 600; letter-spacing: 1px; cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }
    .patient-btn:hover { transform: translateY(-2px); opacity: 0.9; }
    .visit-btn {
      background: linear-gradient(135deg, #00BCD4, #2979FF);
      color: white; border: none; border-radius: 16px; padding: 20px 48px;
      font-size: 18px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
      cursor: pointer; transition: transform 0.2s, opacity 0.2s; width: 100%;
    }
    .visit-btn:hover { transform: translateY(-2px); opacity: 0.9; }
    .loading { color: #999; font-size: 14px; margin-top: 12px; }
    .divider { text-align: center; color: #ccc; font-size: 12px; letter-spacing: 2px; margin: 10px 0; }
    #spotify-player {
      display: none; background: white; border-radius: 20px; padding: 20px 24px;
      margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center;
    }
    #spotify-player.visible { display: block; }
    #spotify-player h3 {
      color: #1A237E; font-size: 13px; letter-spacing: 2px;
      text-transform: uppercase; margin-bottom: 12px;
    }
    #now-playing { color: #666; font-size: 13px; margin-bottom: 12px; min-height: 18px; }
    .spotify-controls { display: flex; justify-content: center; gap: 12px; }
    .spotify-btn {
      background: linear-gradient(135deg, #1DB954, #1aa34a);
      color: white; border: none; border-radius: 10px; padding: 10px 20px;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;
    }
    .spotify-btn:hover { opacity: 0.85; }
    .spotify-btn.secondary { background: #eee; color: #333; }
  </style>
</head>
<body>

  <div class="logo-area">
    <div class="logo-title">Neimira</div>
    <div class="logo-tagline">AI Companion Technology</div>
  </div>

  <div class="mode-container">
    <div id="spotify-player">
      <h3>🎵 Now Playing</h3>
      <div id="now-playing">Ready to play music</div>
      <div class="spotify-controls">
        <button class="spotify-btn secondary" onclick="spotifyPrevious()">⏮</button>
        <button class="spotify-btn" id="playPauseBtn" onclick="spotifyPlayPause()">⏸ Pause</button>
        <button class="spotify-btn secondary" onclick="spotifyNext()">⏭</button>
      </div>
    </div>
  </div>

  <div class="mode-container" id="selectionScreen">
    <div class="mode-card">
      <h2>Facility</h2>
      <p>Select a patient to begin their session with Rose.</p>
      <div class="patient-list" id="patientList">
        <div class="loading">Loading patients...</div>
      </div>
      <button class="visit-btn" id="loadPatientsBtn" onclick="loadPatients()">Load Patients</button>
    </div>

    <div class="divider">— OR —</div>

    <div class="mode-card">
      <h2>Home</h2>
      <p>Welcome back. Rose is ready for your visit.</p>
      <button class="visit-btn" onclick="launchRose('recMLLC4fJHBUhE5w')">Visit with Rose 🌹</button>
    </div>
  </div>

  <script type="module"
    src="https://agent.d-id.com/v2/index.js"
    data-mode="fabio"
    data-client-key="ck_-MqtRhwe5B0Gqmpm3oow5"
    data-agent-id="v2_agt_LZBI4lcW"
    data-name="did-agent"
    data-monitor="true"
    data-orientation="horizontal"
    data-position="right"
    data-open-mode="expanded">
  </script>

  <script src="https://sdk.scdn.co/spotify-player.js"></script>

  <script>
    const HOME_PATIENT_ID = 'recMLLC4fJHBUhE5w';
    let spotifyPlayer = null;
    let spotifyDeviceId = null;
    let currentPatientId = null;
    let isPlaying = false;
    let musicPollInterval = null;

    // ── Spotify SDK ready ──
    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log('Spotify SDK ready');
    };

    // ── Initialize Spotify ──
    async function initSpotify(patientId) {
      try {
        const res = await fetch('https://rose-proxy.vercel.app/api/spotify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId })
        });
        const data = await res.json();
        if (!data.access_token) { console.log('No Spotify token'); return; }

        spotifyPlayer = new Spotify.Player({
          name: 'Rose — Neimira',
          getOAuthToken: cb => cb(data.access_token),
          volume: 0.7
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
          console.log('Spotify player ready, device:', device_id);
          spotifyDeviceId = device_id;
          document.getElementById('spotify-player').classList.add('visible');
        });

        spotifyPlayer.addListener('player_state_changed', state => {
          if (!state) return;
          isPlaying = !state.paused;
          const track = state.track_window?.current_track;
          if (track) {
            document.getElementById('now-playing').textContent =
              track.name + ' — ' + track.artists.map(a => a.name).join(', ');
          }
          document.getElementById('playPauseBtn').textContent = isPlaying ? '⏸ Pause' : '▶ Play';
        });

        spotifyPlayer.connect();
      } catch (e) {
        console.error('Spotify init error:', e);
      }
    }

    // ── Play by search query ──
    async function spotifyPlayBySearch(query) {
      try {
        const tokenRes = await fetch('https://rose-proxy.vercel.app/api/spotify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: currentPatientId })
        });
        const tokenData = await tokenRes.json();
        const access_token = tokenData.access_token;
        if (!access_token) return;

        const searchRes = await fetch(
          'https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=1',
          { headers: { 'Authorization': 'Bearer ' + access_token } }
        );
        const searchData = await searchRes.json();
        const uri = searchData.tracks?.items?.[0]?.uri;
        if (!uri) { console.log('No track found for:', query); return; }

        await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + spotifyDeviceId, {
          method: 'PUT',
          headers: { 'Authorization': 'Bearer ' + access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [uri] })
        });

        console.log('Now playing:', query);
      } catch (e) {
        console.error('Spotify play error:', e);
      }
    }

    // ── Poll music queue every 2 seconds ──
    function startMusicQueuePolling(patientId) {
      if (musicPollInterval) clearInterval(musicPollInterval);
      musicPollInterval = setInterval(async () => {
        try {
          const res = await fetch(
            'https://rose-proxy.vercel.app/api/music-queue?patientId=' + patientId
          );
          const data = await res.json();
          if (data.query) {
            console.log('Music queue triggered:', data.query);
            spotifyPlayBySearch(data.query);
          }
        } catch (e) {
          console.error('Music queue poll error:', e);
        }
      }, 2000);
      console.log('Music queue polling started');
    }

    // ── Controls ──
    function spotifyPlayPause() { if (spotifyPlayer) spotifyPlayer.togglePlay(); }
    function spotifyNext() { if (spotifyPlayer) spotifyPlayer.nextTrack(); }
    function spotifyPrevious() { if (spotifyPlayer) spotifyPlayer.previousTrack(); }

    // ── Load patients ──
    async function loadPatients() {
      document.getElementById('loadPatientsBtn').style.display = 'none';
      const list = document.getElementById('patientList');
      list.style.display = 'flex';
      list.innerHTML = '<div class="loading">Loading patients...</div>';
      try {
        const res = await fetch('https://rose-proxy.vercel.app/api/patients');
        const data = await res.json();
        list.innerHTML = '';
        data.patients.forEach(patient => {
          const btn = document.createElement('button');
          btn.className = 'patient-btn';
          btn.textContent = patient.name;
          btn.onclick = () => launchRose(patient.id);
          list.appendChild(btn);
        });
      } catch (e) {
        list.innerHTML = '<div class="loading">Error loading patients.</div>';
      }
    }

    // ── Launch Rose ──
    function launchRose(patientId) {
      currentPatientId = patientId;
      initSpotify(patientId);
      startMusicQueuePolling(patientId);
      const agent = document.querySelector('[data-name="did-agent"]');
      if (agent) agent.setAttribute('data-patient-id', patientId);
      const event = new CustomEvent('did-agent:open');
      window.dispatchEvent(event);
    }
  </script>

</body>
</html>
