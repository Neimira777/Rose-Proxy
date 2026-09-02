# CLAUDE.md — Neimira (rose-proxy)

Context for Claude Code sessions working in this repo. Read this before
making changes — several bugs here have come from missing context that's
captured below.

## What this is

Neimira is an AI companion technology company. The product is Rose and
Jim — warm, video-based AI companions for older adults living
independently or with family. This repo (`rose-proxy`) is the backend +
frontend for the companion experience, deployed on Vercel as
`app.neimira.com`.

**Founder/owner:** Linda Licameli — non-technical, sole technical and
business decision-maker. She relies on Claude (both chat and Claude Code)
as her primary development partner. Explain changes clearly; don't assume
deep engineering background.

## Product philosophy (do not violate)

- Rose/Jim are **transparently AI** — never impersonate a real family
  member, always identify as AI if asked directly.
- **No camera or visual monitoring** — the product works from
  conversation only, never surveillance.
- Never use diminutive terms ("honey," "sweetie," "dear") or age-labeling
  terms ("senior," "elderly," "old") — always use the person's name.
- Terminology: call people **"members,"** not patients/users/residents in
  user-facing copy (though the Airtable table and some internal code
  still says "patientId" — that's a legacy internal name, not
  user-facing).
- Structured daily visits (not always-on) are the deliberate emotional
  model — a good friend visits, is fully present, then life continues.

## Architecture

- **Frontend:** `launch.html` — the single unified companion page for
  BOTH Rose and Jim, dynamically themed via the member's `Preferred
  Companion` Airtable field. (`launch-jim.html` is dead legacy D-ID code
  — safe to delete, do not edit it.)
- **Avatar/voice (live conversation):** HeyGen LiveAvatar
  (`@heygen/liveavatar-web-sdk`), NOT the older deprecated
  `@heygen/streaming-avatar` package — don't reference that SDK's API
  when working in this repo.
- **Conversational LLM:** Anthropic Claude Haiku 4.5
  (`claude-haiku-4-5-20251001`), called from `chat-completions.js` (the
  custom OpenAI-compatible endpoint HeyGen's LiveAvatar calls into).
- **Member database:** Airtable.
- **Music:** YouTube search fallback (Spotify integration exists in code
  but is fully disabled via `SPOTIFY_ENABLED = false` due to Spotify
  Developer Mode restrictions — don't re-enable without checking if
  Spotify's rules have changed).
- **Standalone audio features** (Soothing Sounds, Voice Reminders, and
  planned Audio Stories) use **ElevenLabs TTS or self-hosted mp3s
  directly** — NOT HeyGen avatar credits. These are meant to stay
  genuinely free/cheap to run, available any time, independent of a live
  visit.
- **Hosting:** Vercel, flat $20/mo (not per-user).

## Critical gotcha: HeyGen's own greeting happens BEFORE your code runs

HeyGen's LiveAvatar speaks its opening greeting via its own TTS
**before** `chat-completions.js` is ever called. By the time the member's
first reply reaches this endpoint, the greeting is already in the message
history as an `assistant` turn. **Do not** compute "is this the first
message of the session" as "no assistant turn exists yet" — that's
always false. Use `messages.filter(m => m.role === 'user').length === 1`
instead. (This exact bug silently broke morning music, the wardrobe
suggestion, the Daily Interest Briefing, and the event-reminder opening
line simultaneously — found and fixed Sep 1, 2026.)

## Cost model (important for any pricing/capacity work)

- HeyGen is **~95%+ of total per-user cost** — everything else (Claude
  API, hosting, Airtable, ElevenLabs) is a rounding error by comparison.
- Currently modeling costs around the **HeyGen Business plan** ($475/mo
  for 6,000 credits), not Essential — a single active user's usage
  exceeds Essential's entire monthly pool.
- Full Mode (live conversational streaming) = **2 credits/minute**.
  Avatar Only (no voice interaction) = 1 credit/minute.
- Tiers differentiate by **visits per day**, not visit length or gated
  features — all tiers get the full feature set.

## Known open bugs (check before assuming something is fixed)

- **Companion-mismatch bug:** on some first page loads,
  `loadClientProfile()`'s fetch to `/api/patients` silently never
  executes (confirmed via logs — sibling functions in the same startup
  block run fine), so the wrong companion name displays until a manual
  reload. Root cause not yet found. If touching `loadClientProfile()` or
  identity resolution in `launch.html`, be aware of this.

## Conventions worth following

- New standalone credit-free features should follow the existing
  Soothing Sounds / Voice Reminders pattern: self-hosted files or direct
  ElevenLabs calls, a small dedicated API endpoint (GET/POST/DELETE by
  `patientId`), simple in-memory or localStorage state.
- Session-start cleanup in `launchRose()` DELETEs any leftover
  queue/flag from a previous session (music-queue, photos, exercise-
  queue, breathing-queue, wrap-up-flag) — if you add a new per-visit
  signal, add its cleanup here too.
- Copyright care: cognitive games and any lyric/story content must stick
  to genuinely public-domain material, or title/artist-only references
  where the member supplies the actual words (see `COGNITIVE_GAMES` in
  `chat-completions.js` for the established pattern).
- Diagnostic/one-time debug files should be deleted once their bug is
  resolved, not left in the codebase (there are three pending cleanup:
  `api/check-voice-compat.js`, `api/check-elevenlabs-voices.js`,
  `api/list-elevenlabs-voices.js`).

## When making changes

- This is a solo-founder, pre-revenue, self-funded product with real
  members relying on it emotionally — prioritize not breaking working
  features over cleverness.
- Show Linda a diff/summary of what changed before committing, especially
  for anything touching `launch.html` or `chat-completions.js` (both are
  large, dense files where a small mistake is easy to miss).
- No billing infrastructure (Stripe etc.) exists yet — tier logic is
  currently a manual/Airtable-field concept only, not enforced in code.
