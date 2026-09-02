# Neimira — Business Plan

*Draft compiled Sep 2, 2026. Living document — update as the pilot and
pricing decisions solidify. Figures marked "assumption" are modeling
placeholders, not confirmed numbers, and should be replaced with real
data as it comes in (especially from the Bergen Family Center pilot).*

## 1. Executive Summary

Neimira builds Rose and Jim, warm, transparently-AI, video-based
companions for older adults living independently or with family. Members
have structured daily video visits, each visit fully present rather than
an always-on surveillance product, no camera monitoring, and the
companion never impersonates a real family member.

The company is solo-founder (Linda Licameli), pre-revenue, and
self-funded, currently preparing a pilot with the Bergen Family Center
(target: 5-8 participants, Tier 2-equivalent, 1 month initial term).
Hosting runs on Vercel at a flat $20/mo, and the dominant cost driver by
far is the HeyGen LiveAvatar streaming service (~95%+ of per-user cost).

## 2. Problem & Opportunity

- Older adults aging in place, or living with family who can't be
  present all day, face isolation and a gap between "no support" and
  "expensive human home care."
- Existing "senior tech" products lean either toward passive monitoring
  (fall detection, cameras, wearables) or toward generic chatbots with no
  continuity, warmth, or daily structure.
- Families want reassurance and connection for their relative without
  surveillance, and without the emotional dishonesty of a device
  pretending to be a real person.
- The US population 65+ is large and growing (tens of millions of
  people, per Census Bureau data) and a large majority say they'd prefer
  to age in place rather than move to a facility — this is a durable
  demand trend, not a fad, though Neimira's addressable slice of it
  depends heavily on pricing and channel (direct-to-family vs.
  senior-living/home-care partners) — TAM/SAM/SOM sizing is a follow-up
  exercise once pilot conversion data exists, not something to fabricate
  here.

## 3. Product / Solution

**Rose and Jim** are the same underlying product, presented through one
unified companion page (`launch.html`) themed by the member's preferred
companion in Airtable.

Core experience:
- **Structured daily visits** — live, video, conversational (HeyGen
  LiveAvatar + Claude Haiku 4.5), not always-on. A visit is fully
  present, then ends warmly (including a graceful wrap-up so a
  long-winded member gets an in-character goodbye instead of an abrupt
  cutoff).
- **Personalization** — entertainment interests, important dates, event
  reminders, weather, morning music (YouTube-search-based), and a Family
  Hub for relatives to manage content and switch companions.
- **Free-standing, credit-free features** available any time between
  visits, independent of HeyGen credits: Soothing Sounds, Voice
  Reminders (ElevenLabs TTS / self-hosted mp3s), and a planned Audio
  Stories feature using the same architecture with public-domain
  literature (candidates drafted, not yet approved).
- **Cognitive engagement** — games and prompts (finish-the-phrase,
  Categories, Reminiscence Prompts flagged as clinically-grounded
  techniques) built on public-domain or member-supplied content only,
  for copyright safety.
- **Transparency & dignity by design** — always identifies as AI if
  asked, never uses diminutive or age-labeling language, calls people
  "members" (not patients/users/residents) in anything member- or
  family-facing.

## 4. Market & Competitive Landscape

Neimira sits between two existing categories, and is differentiated from
both:

| Category | Example approach | Gap Neimira fills |
|---|---|---|
| Passive monitoring / safety tech | Fall detection, wearables, cameras | No real relationship or daily engagement; surveillance framing |
| Generic AI chatbots / smart speakers | Alexa, general LLM chat apps | No visual/video warmth, no daily structure, no continuity of relationship, not designed around aging-specific dignity norms |
| Human companion care | Paid companion visits, home care aides | Far more expensive, harder to schedule daily, not scalable |

Neimira's position: a **video-based, emotionally consistent, structured
daily companion** at a fraction of human companion-care cost, sold
directly to families and, longer-term, through senior-living and
home-care/family-center partners (the Bergen Family Center pilot is the
first test of this channel).

## 5. Business Model & Pricing

No billing infrastructure (Stripe etc.) is built yet — pricing tiers
below are a manual/Airtable-field concept, not yet enforced in code.
Tiers differentiate by **visits per day**, not visit length or gated
features — every tier gets the full feature set.

| Tier | Price/mo | Visits/day | Notes |
|---|---|---|---|
| Tier 1 | $79 | 1 | All features |
| Tier 2 | $129 | 2 | All features |
| Tier 3 | $239 | 3 | All features + extras (TBD) |

Channel strategy:
1. **Direct-to-family** — the primary channel today (signup flow already
   exists at `signup.html`).
2. **Senior-living / family-center partnerships** — Bergen Family Center
   pilot is the first test; if it validates, this becomes a repeatable
   B2B2C channel (partner absorbs onboarding/device logistics, families
   or the partner pay per-member).

## 6. Technology & Architecture

- **Frontend:** `launch.html`, a single unified page for both companions,
  themed dynamically via Airtable's `Preferred Companion` field.
- **Avatar/voice:** HeyGen LiveAvatar (`@heygen/liveavatar-web-sdk`).
- **Conversational LLM:** Anthropic Claude Haiku 4.5, via a custom
  OpenAI-compatible endpoint (`chat-completions.js`) that HeyGen calls
  into.
- **Member database:** Airtable.
- **Standalone audio (Soothing Sounds, Voice Reminders, planned Audio
  Stories):** ElevenLabs TTS or self-hosted mp3s directly — deliberately
  decoupled from HeyGen credits to stay free/cheap to run at any time.
- **Music:** YouTube search fallback (Spotify integration exists in code
  but is disabled due to Spotify Developer Mode restrictions).
- **Hosting:** Vercel, flat $20/mo regardless of user count.

This is a lean, low-fixed-cost stack: the only cost that scales with
usage is HeyGen credits, which makes unit economics almost entirely a
function of visit volume and length (see below).

## 7. Cost Structure & Unit Economics

- HeyGen is currently modeled on the **Business plan: $475/mo for 6,000
  credits** (not Essential — a single active user's usage already
  exceeds Essential's entire monthly pool).
- **Full Mode** (live conversational streaming, what visits use) = **2
  credits/minute**. Avatar Only (no voice interaction) = 1 credit/min.
- Effective cost per credit at the Business plan: **$475 / 6,000 ≈
  $0.0792/credit**, i.e. **≈ $0.158/minute of live visit**.
- Everything else (Claude API calls, Vercel hosting, Airtable,
  ElevenLabs) is a rounding error next to HeyGen and can be ignored for
  first-pass modeling.

**Illustrative unit economics** (visit length is an assumption — replace
with real pilot data as soon as it exists):

| Tier | Visits/day | Assumed min/visit | Credits/mo | HeyGen cost/mo | Price | Gross margin |
|---|---|---|---|---|---|---|
| Tier 1 | 1 | 15 | ~900 | ~$71 | $79 | ~10% |
| Tier 1 | 1 | 10 | ~600 | ~$48 | $79 | ~40% |
| Tier 2 | 2 | 15 | ~1,800 | ~$143 | $129 | negative |
| Tier 2 | 2 | 10 | ~1,200 | ~$95 | $129 | ~26% |
| Tier 3 | 3 | 10 | ~1,800 | ~$143 | $239 | ~40% |

**Takeaway: visit length is the single biggest lever on margin**, more
than tier count. At ~15 min/visit, Tier 1 and Tier 2 pricing barely
covers HeyGen cost or goes negative; at ~10 min/visit the model works
comfortably. This is exactly why the graceful wrap-up feature (ending
visits warmly rather than letting them run long) is a margin-relevant
feature, not just a UX nicety, and why real visit-length data from the
pilot is the top financial priority, not a nice-to-have.

Also relevant: **HeyGen plan tier itself is a step function**, not smooth
— at higher member counts, moving to a higher HeyGen plan changes the
per-credit cost. Model needs revisiting once concurrent/monthly usage is
known from the pilot.

## 8. Go-to-Market: Bergen Family Center Pilot

Target: Thursday meeting with Corrin.

- **Structure (proposed, to confirm):** 1 month initial duration, option
  to extend; 5-8 participants; Tier 2-equivalent (2 visits/day);
  families use their own devices (browser-based, no iPads provided) —
  device/wifi capability needs confirming upfront.
- **Usage cap:** no hard cap on visits/credits per participant yet for
  this small pilot size — monitored manually via existing visit-count
  logging.
- **Content readiness gate:** Audio Stories (5-8 stories, 750-1,500
  words, mixed mood, public-domain sources) is a target deliverable for
  the pilot but not yet approved by Linda or built.
- **Why this matters strategically:** validates both the product
  (does structured daily video companionship land with real families in
  a care-partner setting?) and the channel (can a family/senior center
  become a repeatable B2B2C distribution path?). Both answers should
  directly inform whether the go-to-market bet shifts more toward
  direct-to-consumer or toward partner channels.

## 9. Roadmap (near-term)

**Committed / ready:**
- Ship the `isFirstMessage` fix (root-caused Sep 1 — HeyGen's own
  greeting was silently counted as the first assistant turn, breaking
  morning music, wardrobe suggestion, Daily Interest Briefing, and the
  event-reminder opening line simultaneously).
- Ship the graceful visit wrap-up feature (verify in-memory flag storage
  matches `music-status.js`'s pattern for cross-instance reliability
  before relying on it in production).
- Build Audio Stories for pilot readiness.

**Open bugs to track:**
- Companion-mismatch bug: `loadClientProfile()`'s fetch to
  `/api/patients` intermittently and silently never executes on first
  page load, showing the wrong companion name until manual reload. Root
  cause not yet found; needs explicit logging to catch it in the wild.

**Not yet started:**
- Self-serve language change via Family Hub (currently Airtable-only).
- Additional standalone/credit-free features under consideration:
  Memory Moments, Guess the Sound, guided relaxation/stretch audio,
  sing-along tracks (standalone); Categories, Reminiscence Prompts,
  gentle riddles, "On this day..." (live-conversation, Rose/Jim-led).
  Categories and Reminiscence Prompts are flagged as clinically-grounded
  techniques worth highlighting to care partners like Corrin
  specifically.
- VC intro video (Rose/Jim explaining Neimira via HeyGen's pre-recorded
  Video Generation API) for the website and pilot onboarding.
- Tier structure implementation in Airtable (visitDuration/visits-per-day
  fields) and updated pricing slide/deck with finalized numbers.
- Billing infrastructure (Stripe or similar) — does not exist yet at
  all; needed before any tier can be commercially enforced.

## 10. Team

Solo-founder: **Linda Licameli** — non-technical, sole business and
product decision-maker, using Claude Code as primary technical
development partner. No other team members currently. Hiring/co-founder
needs are an open question not addressed in this draft — flag for a
future revision once the pilot outcome is known and it's clearer what
skills (clinical/eldercare partnerships? engineering? sales?) would
matter most next.

## 11. Risks

- **Margin risk tied directly to visit length** — see Section 7. This is
  the single most important number to start measuring precisely once the
  pilot is live.
- **Single-vendor dependency on HeyGen** — ~95%+ of unit cost and the
  entire live-avatar experience depend on one vendor's pricing and API
  stability. A pricing change or outage there is a direct existential
  risk to the model as currently built.
- **Solo-founder / non-technical-founder concentration risk** — all
  technical execution currently routes through Claude Code sessions;
  no engineering redundancy.
- **No billing infrastructure** — pricing tiers are not yet enforceable,
  meaning the pilot and any early customers are running on trust/manual
  tracking, not metered billing.
- **Regulatory/clinical positioning** — features referencing
  "clinically-grounded techniques" (Categories, Reminiscence Prompts)
  need care taken not to imply medical/therapeutic claims the product
  isn't licensed or validated to make, especially when presented to a
  care-partner organization like Bergen Family Center.
- **Content/copyright risk** — mitigated by policy (public-domain-only
  or member-supplied content for games/stories) but requires ongoing
  discipline as content volume grows (e.g., the draft Audio Stories list
  still needs trimming/approval against this standard).

## 12. Financial Projections

Not modeled in this draft — pre-revenue, no billing infrastructure, and
pilot conversion/pricing data doesn't exist yet. Once the Bergen Family
Center pilot produces real visit-length and retention numbers, the
unit-economics table in Section 7 should be rebuilt with actuals and
extended into a monthly cash-flow projection (fixed costs: Vercel $20/mo
+ HeyGen plan tier; variable: HeyGen credits by realized visit volume).
Flagging this as an explicit next step rather than filling it with
placeholder numbers that would look precise but aren't grounded in real
data.

## 13. Open Decisions for Linda

- Confirm final pilot structure and usage-cap policy with Corrin.
- Approve (or revise) the Audio Stories initial story list.
- Decide standalone feature roadmap priorities (Section 9).
- Decide when/whether to build billing infrastructure, and revisit
  pricing tiers once real visit-length data exists (Section 7's margin
  math suggests this may need to happen before wide rollout).
- Decide go-to-market emphasis: direct-to-family vs. partner-channel,
  once pilot results are in.
