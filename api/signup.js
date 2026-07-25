// ─────────────────────────────────────────────
//  signup.js
//  Public onboarding endpoint. Family or client fills out
//  a short form on the website — this creates their Member
//  Table record in Airtable and sends a welcome email with
//  their personal Rose link, photo upload link, and iPad
//  setup instructions.
//  POST /api/signup
//  Body: { fullName, preferredName, familyEmail, visitTimes }
// ─────────────────────────────────────────────

import nodemailer from 'nodemailer';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fullName, preferredName, familyEmail, visitTimes, isDemo } = req.body || {};
  if (!fullName || !familyEmail) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    // ── Step 1: Create the Member Table record ──
    // Generate a random access token so the member's personal link never
    // exposes the real Airtable record ID (which would reveal internal
    // database structure and, if guessed/enumerated, other members' data).
    const accessToken = crypto.randomBytes(16).toString('hex');

    const createRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Client Full Name': fullName,
            'Preferred Name': preferredName || fullName.split(' ')[0],
            'Family Email': familyEmail,
            'Visit Times': visitTimes || '',
            'Preferred Companion': 'Rose',
            'Access Token': accessToken
          }
        })
      }
    );

    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error('Signup — Airtable create error:', JSON.stringify(createData));
      throw new Error('Failed to create member record');
    }

    const recordId = createData.id;
    const nmrId = createData.fields['Client ID'] || '';
    console.log(`Signup — new member created: ${recordId} (${nmrId})`);

    // ── Step 2: Build the personal links ──
    // Uses the access token, not the raw record ID — the link itself
    // reveals nothing about the underlying database.
    const roseLink = `https://rose-proxy.vercel.app/launch.html?token=${accessToken}${isDemo ? '&demo=true' : ''}`;
    const photoLink = `https://rose-proxy.vercel.app/photos-upload.html?patient=${nmrId}`;

    // ── Step 3: Send the welcome email via Gmail SMTP ──
    // Uses a Google Workspace account + App Password (not the account's
    // normal password — App Passwords are generated under Google Account
    // > Security > 2-Step Verification > App Passwords).
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,       // e.g. linda@neimira.com
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });

      await transporter.sendMail({
        from: `"Neimira — Rose" <${process.env.GMAIL_USER}>`,
        to: familyEmail,
        subject: `Welcome to Neimira, ${preferredName || fullName}!`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1e3a8a;">Welcome to Neimira!</h2>
            <p>We're so glad ${preferredName || fullName} will be spending time with Rose.</p>
            <p>Here are your personal links to get started:</p>
            <p>
              <a href="${roseLink}" style="display:inline-block;background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;">Visit Rose</a>
            </p>
            <p>
              <a href="${photoLink}" style="display:inline-block;background:#0ea5a4;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;">Share Family Photos</a>
            </p>
            <h3 style="margin-top:32px;">Setting up your iPad</h3>
            <ul>
              <li>Settings → Display & Brightness → Auto-Lock → Never</li>
              <li>Keep the iPad plugged in</li>
              <li>Settings → Safari → Auto-Play → Allow All Auto-Play</li>
              <li>Open the Rose link above in Safari, then tap the Share icon → "Add to Home Screen" — this keeps microphone permissions saved</li>
            </ul>
            <p style="margin-top:24px;color:#555;">If you have any questions, just reply to this email.</p>
          </div>
        `
      });

      console.log(`Signup — welcome email sent to ${familyEmail}`);
    } catch (emailErr) {
      // Record already exists even if the email fails — don't block signup
      // on an email delivery hiccup, just log it so it can be resent manually.
      console.error('Signup — welcome email failed:', emailErr.message);
      return res.status(200).json({
        ok: true,
        recordId,
        nmrId,
        roseLink,
        photoLink,
        warning: 'Member created, but the welcome email failed to send. Links are included in this response for manual follow-up.'
      });
    }

    return res.status(200).json({
      ok: true,
      recordId,
      nmrId,
      message: 'Welcome email sent!'
    });

  } catch (error) {
    console.error('Signup error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
