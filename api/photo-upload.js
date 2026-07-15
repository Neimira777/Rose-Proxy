// ─────────────────────────────────────────────
//  photo-upload.js
//  Receives a photo upload from the family portal
//  Saves it to Airtable Photos table
//  Then triggers vision-description.js automatically
//  POST /api/photo-upload
//  Body: { patientId, photoBase64, photoName, mimeType, peopleNames, occasion }
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { patientId, photoBase64, photoName, mimeType, peopleNames, occasion } = req.body || {};
  if (!patientId || !photoBase64 || !photoName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // ── Step 1: Upload photo to Airtable Photos table ──
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Photos`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Photo Name': photoName,
            'People': peopleNames || '',
            'Occasion': occasion || '',
            "Patient's Table": [patientId],
            'Photo': [
              {
                filename: photoName,
                url: `data:${mimeType || 'image/jpeg'};base64,${photoBase64}`
              }
            ]
          }
        })
      }
    );

    const airtableData = await airtableRes.json();
    if (!airtableRes.ok) {
      console.error('Airtable create error:', JSON.stringify(airtableData));
      throw new Error('Failed to save photo to Airtable');
    }

    const recordId = airtableData.id;
    const photoUrl = airtableData.fields?.Photo?.[0]?.url;

    console.log(`Photo saved to Airtable. Record: ${recordId}, URL: ${photoUrl}`);

    if (!photoUrl) {
      // Airtable sometimes takes a moment to process attachments
      // Return success and let the webhook handle vision later
      return res.status(200).json({
        ok: true,
        recordId,
        message: 'Photo saved. Vision description will be generated shortly.'
      });
    }

    // ── Step 2: Trigger vision description automatically ──
    try {
      const visionRes = await fetch('https://rose-proxy.vercel.app/api/vision-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId,
          photoUrl,
          peopleNames: peopleNames || '',
          occasion: occasion || ''
        })
      });

      const visionData = await visionRes.json();
      if (!visionRes.ok) {
        console.error('Vision description error:', visionData);
        return res.status(200).json({
          ok: true,
          recordId,
          warning: 'Photo saved but vision description failed. Will retry later.'
        });
      }

      console.log(`Vision description complete for record ${recordId}`);

      return res.status(200).json({
        ok: true,
        recordId,
        description: visionData.description,
        message: 'Photo saved and described successfully!'
      });

    } catch (visionErr) {
      console.error('Vision trigger error:', visionErr.message);
      return res.status(200).json({
        ok: true,
        recordId,
        warning: 'Photo saved but vision description failed: ' + visionErr.message
      });
    }

  } catch (error) {
    console.error('Photo upload error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
