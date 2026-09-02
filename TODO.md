# Neimira — Outstanding TODO List
(Compiled Sep 1, 2026 from product/dev planning)

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
