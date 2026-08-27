// ─────────────────────────────────────────────
//  signup.js
//  Public onboarding endpoint. Family or client fills out
//  a short form on the website — this creates their Member
//  Table record in Airtable, sends a welcome email with
//  their personal Rose link, photo upload link, and iPad
//  setup instructions, AND automatically invites them to
//  the Neimira TestFlight beta so they receive Apple's
//  install invite without Linda adding them manually.
//  POST /api/signup
//  Body: { fullName, preferredName, familyEmail, visitTimes }
// ─────────────────────────────────────────────

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ── Family Code generation ──
// A short, human-typeable code (e.g. "NMR4829") for the native app's
// "Enter your family code" screen — see api/resolve-code.js. This is
// deliberately separate from the long Access Token used in email links:
// that token is fine to click, but nobody should have to type 32 random
// hex characters by hand on a tablet.
//
// Uses a neutral "NMR" prefix rather than the companion name (Rose/Jim) —
// members can switch companions at will (see switch-companion.js), and a
// code that said "ROSE4829" while someone is now actually visiting with
// Jim would read as a mismatch or make them second-guess whether they
// typed it right. The code identifies the PERSON, not their current
// companion choice, so it should stay stable regardless of switches.
//
// Checks Airtable for a collision before accepting a code, since two
// members sharing a code would let one see the other's data. Retries a
// few times with a fresh random suffix rather than trusting randomness
// alone — the pool of 4-digit suffixes is small enough that a collision,
// while unlikely, is realistic once there are hundreds of members.
async function generateUniqueFamilyCode() {
  const prefix = 'NMR';
  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 9000); // 4 digits, never leading-zero
    const candidate = `${prefix}${suffix}`;
    try {
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_ID}?filterByFormula=${encodeURIComponent(`UPPER({Family Code})="${candidate}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` } }
      );
      const checkData = await checkRes.json();
      if (!checkData.records || checkData.records.length === 0) {
        return candidate; // no collision — safe to use
      }
      console.warn(`Family Code collision on ${candidate}, retrying (attempt ${attempt + 1})`);
    } catch (e) {
      console.warn('Family Code uniqueness check failed, using candidate anyway:', e.message);
      return candidate; // don't let a transient Airtable hiccup block signup entirely
    }
  }
  // Extremely unlikely fallback after 6 collisions — add a longer random
  // suffix so signup never hard-fails over this.
  return `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
}

// ── App Store Connect API authentication ──
// Apple's API uses a short-lived signed JWT, not a plain API key — every
// request needs a fresh token (max 20 min lifetime) signed with the
// downloaded .p8 private key. This mirrors exactly what Median itself
// does behind the scenes with the same style of key.
function generateAppleApiToken() {
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const keyId = process.env.APPLE_KEY_ID;
  const issuerId = process.env.APPLE_ISSUER_ID;
  if (!privateKey || !keyId || !issuerId) {
    throw new Error('Missing Apple API credentials (APPLE_PRIVATE_KEY / APPLE_KEY_ID / APPLE_ISSUER_ID)');
  }
  return jwt.sign(
    { iss: issuerId, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', expiresIn: '19m', header: { kid: keyId, typ: 'JWT' } }
  );
}

// ── Automatically invite the new member to TestFlight ──
// Closes the gap where Linda previously had to manually add every new
// signup's email to the Pilot Testers group in App Store Connect. This
// runs the exact same action, just triggered automatically at signup.
//
// Deliberately non-blocking and non-fatal: if Apple's API is down, the
// key is misconfigured, or anything else goes wrong here, signup itself
// must still succeed — a family should never be blocked from getting
// their welcome email over a TestFlight hiccup. Failures are logged so
// Linda can add someone manually as a fallback, same as before this
// feature existed.
async function inviteToTestFlight(email, fullName) {
  const groupId = process.env.APPLE_PILOT_GROUP_ID || '368d1164-03f4-4bdd-96bf-992036c7e644';
  try {
    const appleToken = generateAppleApiToken();
    const [firstName, ...rest] = (fullName || '').trim().split(/\s+/);
    const lastName = rest.join(' ') || '';

    const res = await fetch('https://api.appstoreconnect.apple.com/v1/betaTesters', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appleToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          type: 'betaTesters',
          attributes: {
            email,
            firstName: firstName || undefined,
            lastName: lastName || undefined
          },
          relationships: {
            betaGroups: {
              data: [{ type: 'betaGroups', id: groupId }]
            }
          }
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      // Apple returns 409 if this email is already a tester — not a real
      // failure, just means they're already invited (e.g. Linda added them
      // manually earlier, or they signed up twice).
      const alreadyExists = res.status === 409 || JSON.stringify(data).includes('ALREADY_EXISTS');
      if (alreadyExists) {
        console.log(`Signup — ${email} is already a TestFlight tester, skipping.`);
        return { ok: true, alreadyExists: true };
      }
      console.error('Signup — TestFlight invite failed:', res.status, JSON.stringify(data));
      return { ok: false, error: data };
    }
    console.log(`Signup — TestFlight invite sent to ${email}`);
    return { ok: true };
  } catch (e) {
    console.error('Signup — TestFlight invite error:', e.message);
    return { ok: false, error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fullName, preferredName, familyEmail, visitTimes, isDemo, companion, preferredLanguage } = req.body || {};
  if (!fullName || !familyEmail) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const resolvedCompanion = companion === 'Jim' ? 'Jim' : 'Rose';

  try {
    // ── Step 1: Create the Member Table record ──
    // Generate a random access token so the member's personal link never
    // exposes the real Airtable record ID (which would reveal internal
    // database structure and, if guessed/enumerated, other members' data).
    const accessToken = crypto.randomBytes(16).toString('hex');

    // Generate their short Family Code up front so it can be saved in the
    // same create call as everything else, rather than a separate write.
    const familyCode = await generateUniqueFamilyCode();

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
            'Preferred Companion': resolvedCompanion,
            'Preferred Language': preferredLanguage || '',
            'Access Token': accessToken,
            'Family Code': familyCode
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
    console.log(`Signup — new member created: ${recordId} (${nmrId}) — Family Code: ${familyCode}`);

    // ── Step 2: Invite them to TestFlight automatically ──
    // Fired off before the email so any TestFlight invite (if it succeeds)
    // and the welcome email arrive close together, rather than the email
    // going out first and the invite trickling in separately later.
    const testFlightResult = await inviteToTestFlight(familyEmail, fullName);

    // ── Step 3: Build the personal links ──
    // Uses the access token, not the raw record ID — the link itself
    // reveals nothing about the underlying database.
    // Uses app.neimira.com (not the rose-proxy.vercel.app address) so every
    // link a family sees — starting with this very first email — stays
    // under the real Neimira domain rather than a generic Vercel URL.
    const hubLink = `https://app.neimira.com/family-hub.html?token=${accessToken}${isDemo ? '&demo=true' : ''}`;

    // ── Step 4: Send the welcome email via Gmail SMTP ──
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
        from: `"Neimira — ${resolvedCompanion}" <${process.env.GMAIL_USER}>`,
        to: familyEmail,
        subject: `Welcome to Neimira, ${preferredName || fullName}!`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1e3a8a;">Welcome to Neimira!</h2>
            <p>We're so glad ${preferredName || fullName} will be spending time with ${resolvedCompanion}.</p>
            <p>One link is all you'll ever need — visit with ${resolvedCompanion}, add important dates like birthdays and appointments, and share photos, all in one place:</p>
            <p>
              <a href="${hubLink}" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Open Family Hub</a>
            </p>
            <h3 style="margin-top:32px;">Using the Neimira app</h3>
            <p>If you've installed the Neimira app on an iPad, open it and enter this Family Code when asked:</p>
            <p style="text-align:center;">
              <span style="display:inline-block;background:#f0f4ff;color:#1e3a8a;padding:12px 28px;border-radius:8px;font-size:22px;font-weight:700;letter-spacing:3px;">${familyCode}</span>
            </p>
            <p style="color:#555;font-size:14px;">You'll only need to enter this once — the app will remember it on that device from then on.</p>
            <h3 style="margin-top:32px;">Setting up your iPad</h3>
            <ul>
              <li>You should receive a separate email from Apple/TestFlight shortly with instructions to install the Neimira app — look for a "View in TestFlight" button. <strong>Important:</strong> this invite went to <em>${familyEmail}</em>. If that's the same email address tied to your Apple ID (the one used for the App Store), it should open smoothly. If it's a different email, Apple may prompt you to create a brand-new Apple ID for it — if that happens, it's easiest to cancel and let us know so we can resend the invite to your actual Apple ID email instead.</li>
              <li>Settings → Display & Brightness → Auto-Lock → Never</li>
              <li>Keep the iPad plugged in</li>
              <li>Open the Family Hub link above in Safari, tap "Visit with ${resolvedCompanion}," then tap the Share icon → "Add to Home Screen" for that page — this keeps microphone permissions saved</li>
              <li><strong>Once a day, just tap the screen once</strong> (even just to see the waiting clock) — this is what lets background music play during ${resolvedCompanion}'s visits. It's a quirk of how iPads handle sound, not a setting, so there's nothing to configure — just a quick tap sometime each day.</li>
            </ul>
            <p style="margin-top:24px;color:#555;font-size:14px;"><strong>A note on privacy:</strong> leaving the iPad unlocked all day only affects how quickly ${resolvedCompanion} can start — it doesn't expose anything else. ${resolvedCompanion} never asks for or has access to banking, passwords, or financial information of any kind, and apps like banking apps require their own separate login regardless of the iPad's own lock setting. If you'd still like extra peace of mind, Guided Access (in iPad Accessibility settings) can lock the device to only the ${resolvedCompanion} experience.</p>
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
        hubLink,
        familyCode,
        testFlightInvited: testFlightResult.ok,
        warning: 'Member created, but the welcome email failed to send. Links are included in this response for manual follow-up.'
      });
    }

    return res.status(200).json({
      ok: true,
      recordId,
      nmrId,
      familyCode,
      testFlightInvited: testFlightResult.ok,
      message: 'Welcome email sent!'
    });

  } catch (error) {
    console.error('Signup error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
