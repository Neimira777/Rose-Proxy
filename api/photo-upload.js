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
    // ── Step 1: Create the Photos record with metadata only (no attachment yet) ──
    const createRes = await fetch(
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
            "Patient's Table": [patientId]
          }
        })
      }
    );

    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error('Airtable create error:', JSON.stringify(createData));
      throw new Error('Failed to create photo record in Airtable');
    }

    const recordId = createData.id;
    console.log(`Photo record created. Record: ${recordId}`);

    // ── Step 2: Upload the actual file bytes via Airtable's content upload endpoint ──
    // This is the endpoint that reliably accepts base64 directly (unlike the
    // regular record API, which needs a publicly-hosted URL for attachments).
    const uploadRes = await fetch(
      `https://content.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${recordId}/Photo/uploadAttachment`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentType: mimeType || 'image/jpeg',
          file: photoBase64,
          filename: photoName
        })
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      console.error('Airtable attachment upload error:', JSON.stringify(uploadData));
      // Record exists but has no photo attached yet — still return ok so the
      // family isn't shown an error, but flag it so it's easy to spot in logs.
      return res.status(200).json({
        ok: true,
        recordId,
        warning: 'Photo record created but attachment upload failed. Will need retry.'
      });
    }

    const photoUrl = uploadData.fields?.Photo?.[0]?.url;
    console.log(`Photo attached to record. Record: ${recordId}, URL: ${photoUrl}`);

    if (!photoUrl) {
      return res.status(200).json({
        ok: true,
        recordId,
        message: 'Photo saved. Vision description will be generated shortly.'
      });
    }

    // ── Step 3: Trigger vision description automatically ──
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
