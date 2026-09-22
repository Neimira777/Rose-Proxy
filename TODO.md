# Neimira — Outstanding TODO List
(Compiled Sep 1, 2026 from product/dev planning)

## CareLink360 Partnership Status (as of Sep 11, 2026)

**PAUSED Sep 22, 2026:** Paula emailed to step back from the demo
integration for now (too busy; wants to revisit when she can do it
properly). Linda replied telling her to take her time.
`api/carelink360-session.js` is switched off via
`CARELINK360_ENABLED = false` — flip it back to resume. Everything below
is the status as of the pause.

**Already built and live (main branch):**
- `api/carelink360-session.js` — partner-facing endpoint, gated by
  `CARELINK360_API_KEY` env var, resolves a member's Access Token to a
  launch URL. Demo key currently in use (in Vercel); a fresh key was
  generated and given to Linda to swap in once the contract is signed —
  do NOT reuse the demo key for the real integration.
- `public/integration-demo.html` — lets Linda simulate a CareLink360 API
  call live (paste key + member token, see the real response, open the
  resulting companion link). Used successfully in the Sep 10 dry run and
  in the Sep 11 meeting with Paula.
- Cross-member identity-leak fix in `chat-completions.js` (Sep 9) — no
  longer guesses the wrong member when two visits' Active Session
  timestamps are within 3 minutes of each other.
- Demo member records in Airtable: "Walter" (generic demo, Jim,
  recEdFG5AjQ8tnP1M) and Paula Muller's own real account (NMR-15,
  Jim, token starting `abdbedfa5e...`, already has real visit history
  from testing with Linda).
- Neimira logo saved as `public/assets/neimira-logo.png` (see "Brand
  assets" section of CLAUDE.md) — used in the pilot term sheet
  letterhead.

**Contract:** Pilot Integration & Confidentiality Term Sheet drafted,
attorney-reviewed, filled in (60-day term w/ mutual-written-agreement
extension clause, $0 fee, $0 liability cap, NJ governing law), sent to
Paula with Neimira letterhead. **Not yet signed as of Sep 11.**

**Open technical question with HeyGen (submitted Sep 11):** Paula
proposed a mic-toggle sleep/wake UX for CareLink360's resident-facing
tablets (mic muted = avatar minimized/idle, mic on = avatar wakes
instantly, no lag, expands to front). This requires a LiveAvatar session
to stay connected during idle periods and switch to conversational mode
instantly — NOT confirmed possible yet. Sent HeyGen support:
- Both current avatar IDs (Rose: `0b44776d-3211-44e5-a459-bcb6f49e0fcd`,
  Jim: `fab08c79-fabb-4e04-90b8-926eb34982c6`)
- Our actual session-creation and keep-alive request shapes
- Escalated to HeyGen's engineering team (per their Sep 11 reply);
  response pending.
- Known constraint already confirmed by HeyGen support: **Business plan
  caps individual sessions at 60 minutes** — "stay connected all day" is
  not possible on the current plan regardless of the idle-billing
  answer.

**Open commercial question with HeyGen:** Their Enterprise sales
qualification flow asked whether a $40k/year minimum commitment works.
Linda paused this — she's unsure whether Neimira or CareLink360 is
meant to own this cost. A clarifying (softened) email was sent to Paula
on Sep 11 asking who should be driving the Enterprise conversation with
HeyGen, without directly naming cost. **Awaiting Paula's reply before
proceeding further with HeyGen's Enterprise sales flow.**

**Product-direction note (Linda's call, made Sep 11):** Linda is open to
an "always-connected, mic-toggle" experience for the CareLink360 device
specifically — a real departure from Neimira's stated "structured
visits, not always-on" philosophy elsewhere in this doc. Worth
revisiting explicitly once HeyGen's technical answer comes back, since
it affects both cost model and whether this becomes how Neimira works
everywhere or just a CareLink360-specific mode.

**Not yet built** (per Paula's original MVP list, deliberately paused
until pilot is confirmed): create-user API, submit-profile-updates API,
tap-bypass beyond the mic-toggle idea, general load-time reduction.

## Pilot Prep — Bergen Family Center (target: Thursday meeting w/ Corrin)
- [ ] Finalize Audio Stories initial set (5-8 stories, 750-1,500 words each,
      mixed mood). Draft candidates: The Gift of the Magi, The Last Leaf
      (O. Henry), The Selfish Giant, The Nightingale and the Rose (Oscar
      Wilde), The Old Man and His Grandson (Brothers Grimm), a bundle of
      3 Aesop's Fables, Rip Van Winkle (abridged) — several need trimming
      to fit word target. NOT YET APPROVED by Linda.
- [ ] Build Audio Stories feature: same architecture as Voice Reminders —
      self-hosted pre-generated mp3s via ElevenLabs (Sarah/Brian voice
      IDs), public-domain source, standalone/credit-free (no HeyGen
      avatar credits used), accessible from waiting screen like Soothing
      Sounds.
- [ ] Decide + confirm pilot structure with Corrin: 1 month initial
      duration (option to extend), 5-8 participants, Tier 2-equivalent
      (2 visits/day), families use their own devices (browser-based, no
      iPads provided) — confirm device/wifi capability upfront.
- [ ] Confirm with Corrin: no hard cap on visits/credits per participant
      yet — monitoring usage manually via existing visit-count logging
      for this small pilot size.

## Bug Fixes — Ready to Commit
- [ ] Commit isFirstMessage fix in chat-completions.js (root cause found
      Sep 1: greeting from HeyGen's own TTS was already counted as an
      assistant turn before this endpoint ever ran, making isFirstMessage
      always false on the true first exchange — broke morning music,
      wardrobe suggestion, Daily Interest Briefing, and event-reminder
      opening line all at once). Fixed version delivered, not yet
      confirmed via a real morning visit.
- [ ] Commit graceful visit wrap-up feature (Sep 1): new api/wrap-up-flag.js
      endpoint + launch.html/chat-completions.js changes so a long-winded
      resident gets a warm in-character goodbye instead of an abrupt
      mid-sentence cutoff. NOTE: wrap-up-flag.js currently uses simple
      in-memory storage — verify this matches how music-status.js stores
      its flag (in-memory vs. durable) for cross-instance reliability.

## Open / Unresolved Bugs
- [ ] Companion-mismatch bug (first seen Aug 31): on some first page
      loads, loadClientProfile()/api/patients never gets called at all
      (confirmed via logs — its sibling functions in the same startup
      block ran fine), showing the wrong companion name ("Rose" instead
      of "Jim") until a manual page reload. Root cause NOT yet found —
      likely a JS error thrown specifically in/before that fetch, silently
      swallowed by its own catch block. Next step: add explicit logging
      inside loadClientProfile() (raw response + timestamp) to catch it
      if it recurs — appears intermittent, not consistently reproducible.

## Feature Roadmap — Not Yet Started
- [ ] VC intro video — Rose/Jim explaining Neimira via HeyGen's
      pre-recorded Video Generation API, for the website and pilot
      onboarding.
- [ ] Self-serve language change — currently only editable directly in
      Airtable; proposed: Family Hub dropdown (like Companion Switching)
      writing to Preferred Language via a new API endpoint, constrained
      to validated languages only (Spanish proven; Turkish/Chinese
      untested/limited).
- [ ] Standalone/credit-free feature ideas not yet decided: "Memory
      Moments" (passive pre-recorded version of the finish-the-phrase
      games), Guess the Sound, guided relaxation/stretch audio,
      sing-along tracks. Live-conversation ideas (Rose/Jim-led):
      Categories, Reminiscence Prompts, gentle riddles, "On this day...".
      Categories and Reminiscence Prompts flagged as clinically-grounded
      techniques worth highlighting to Corrin specifically.

## Pricing / Business (implementation not started)
- [ ] Implement new tier structure in Airtable (visitDuration/visits-per-
      day per member, tier field) — decided: Tier 1 $79 (1 visit/day, all
      features), Tier 2 $129 (2 visits/day), Tier 3 $239 (3 visits/day +
      extra features). No billing infrastructure (Stripe etc.) built yet.
- [ ] Update pricing slide/deck with finalized tier numbers.

## Cleanup
- [ ] Delete three one-time diagnostic files no longer needed:
      api/check-voice-compat.js, api/check-elevenlabs-voices.js,
      api/list-elevenlabs-voices.js
- [ ] Delete launch-jim.html — dead legacy D-ID code, confirmed safe to
      remove (launch.html now handles both companions dynamically).
