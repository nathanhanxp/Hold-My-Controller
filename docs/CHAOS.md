# Chaos drill (run the day before the demo)

Each row of the degradation matrix (PLAN.md 8.8), what to do, and what you should see.

| Drill | How | Expected |
|---|---|---|
| Mongo down (dev) | `MONGODB_URI=mongodb://127.0.0.1:1` with `FORKLAB_MODE=mock` | App starts on memory; header reads "Database unreachable: using memory" |
| Mongo down (live) | same URI with `FORKLAB_MODE=live` | Server refuses to start with a readable error (`store.fails_fast_in_live`) |
| RPC blocked | `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:1` | Status shows RPC down; anchors stay pending; license explains why it waits; pages still load |
| Gemini key unset | remove `GEMINI_API_KEY` | AI badge reads "AI: Nemotron (Gemini unavailable)" (or cached/local without Nemotron) |
| Gemini outage switch | `ALLOW_CHAOS=1`, Status page, tick "Simulate Gemini outage" | Same prompt answers through Nemotron; badge changes |
| Both AI keys unset | remove `GEMINI_API_KEY` and `NVIDIA_API_KEY` | Demo prompts answer "AI: cached"; other prompts "AI: local" (starts from the closest free mechanic, authors credited) |
| Atlas index dropped | drop `graphs_structure` / `graphs_semantic` | Recommended rail still shows "From the same lineage"; describe search says it fell back |
| Wallet disconnected | disconnect in the wallet | Read-only; license asks to connect (live) or records Simulated (mock) |
| Fonts blocked | block fonts.googleapis.com | System serif and sans fallbacks |
| Worker stopped | stop `forklab-chain.service` | Publishes succeed; Status shows the queue depth growing |

After the drill: `SMOKE_URL=https://yourdomain.xyz npm run smoke` must exit 0.
