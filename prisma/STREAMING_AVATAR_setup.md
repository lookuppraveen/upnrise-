# Streaming Avatar (HeyGen) — one-time provider setup

The Roleplay player now supports two-way avatar video. The backend is
wired against HeyGen Streaming Avatar v1 (separate product from
HeyGen's standard video-render API we already use for the Video
module's "Generate Roleplay Video" card). To turn it on for your
tenant, you need:

1. A HeyGen account on the **Creator** plan or higher — Streaming
   Avatar isn't on the free plan. Pricing: https://www.heygen.com/pricing
2. The same API key you already use for the standard render flow —
   Streaming Avatar bills the same account.
3. A streaming-capable avatar selected (most stock avatars work; check
   the "Streaming" badge in HeyGen's avatar library).

## 1. Pick the streaming avatar + voice

HeyGen dashboard → **Avatars** library:

- Filter by **"Streaming Avatar"** — only these support the realtime API.
- Copy the **avatar ID** (it's a short string like `Anna_public_3_20240108`).
- Pick a voice from **Voices** → copy the **voice ID** (e.g.
  `2d5b0e6cf36f460aa7fc47e3eee4ba54`).

## 2. Configure the provider in UPnRise

Sign in as your admin user → `/admin/video-providers` → **Add provider**:

- **Provider type:** HeyGen
- **API key:** your HeyGen API key (Settings → API)
- **Avatar ID:** the streaming-capable ID from step 1
- **Voice ID:** the voice ID from step 1
- **Default?** ✅ yes — the streaming endpoint looks up the default
  HeyGen provider for the tenant

If you already had a HeyGen provider configured for the
non-streaming render pipeline, just edit it to point at a
streaming-capable avatar ID — the streaming API and the render API
share the same key.

## 3. Try it

Open any roleplay module → click **Preview as trainee** → flip
**Voice on** in the composer. The first response from the AI will be
spoken via HeyGen's avatar; subsequent learner turns route through
mic → STT → /turn → HeyGen task → avatar lip-syncs the reply.

The streaming avatar shows up in the **left panel** of the player
(currently shows the "Persona" text card) — it replaces that card
with a live video when the WebRTC connection is up.

## How billing works

HeyGen charges per **streaming minute**. A session starts when the
player calls `POST /api/roleplay/streaming/session` and ends when:

- The player unmounts (DELETE call fires from React cleanup)
- HeyGen GCs an idle session after ~3 min of silence

Closed-session calls are best-effort — if the browser tab crashes
without firing DELETE, HeyGen will still GC the session, but you
might see a couple of extra billed seconds. The server-side
DELETE handler swallows errors so a missed teardown never blocks
the player.

## Troubleshooting

- **"no default streaming-capable provider configured"** — Step 2
  not done, or the provider isn't marked default, or its `kind` isn't
  `heygen`. Check `/admin/video-providers`.
- **`streaming.new` 401** — wrong API key. Re-paste from HeyGen
  Settings → API.
- **`streaming.new` 403** — your HeyGen plan doesn't include
  Streaming Avatar. Upgrade or pick a different provider (D-ID Talks
  Streams + Tavus drivers are scaffolded in
  `src/lib/video/streaming-types.ts` — just need to implement the
  corresponding `*-streaming.ts` file in `/lib/video/providers/`).
- **Avatar appears but doesn't speak** — voice ID isn't valid or
  doesn't pair with the chosen avatar. Some HeyGen avatars only work
  with their built-in voice; clear the voice ID on the provider row
  to let HeyGen pick.
- **Browser console: "RTCPeerConnection failed"** — TURN servers
  not reachable from your network (corporate firewall). HeyGen's
  WebRTC stack requires UDP 3478 outbound. Test from a personal
  network first to isolate.

## Why this isn't enabled by default

The streaming flow only kicks in when:
1. A HeyGen provider is marked default for the tenant, AND
2. The trainee has flipped **Voice on** in the composer

Without those, the player runs in text-only mode (the default before
this feature). So an unconfigured tenant doesn't see broken errors —
voice and avatar are progressive enhancements on top of the text
chat that already works.
