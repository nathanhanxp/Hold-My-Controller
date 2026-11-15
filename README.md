# Hold My Controller

Every game mechanic is a playable, forkable node graph. Play it in the browser, remix it, export C# for Unity, and when someone licenses a mechanic the payment splits on Solana devnet between the people who wrote its nodes. A Community tab runs a weekly minigame on the winning mechanic with replay-verified scores and a prize pool that pays the top players and the mechanic's contributors.

The build plan is in [PLAN.md](PLAN.md). Agent rules and run commands are in [AGENTS.md](AGENTS.md).

## Quick start (no keys, no database)

```
npm install
cp .env.example web/.env.local     # FORKLAB_MODE=mock is the default
npm run dev                        # http://localhost:3000
```

Mock mode uses an in-memory store seeded with a lineage (Jump by @mira, forked into Dodge by @theo, forked into Collect by @ana, plus Gust, Temple, Hop and dash, three levels, prefabs and themes), cached AI answers for the demo prompts, and receipts clearly labelled Simulated.

## Layout

| Path | What |
|---|---|
| `engine/` | Pure TypeScript: graph schema, canonical hashing, attribution, diff, seeded RNG streams (port of res-q), fixed-point world and interpreter, rules, replay verification, minigame composition, payout flattening, snapshots, structure vectors, assets, C# and Unity asset exporters. No React, Next or Solana. |
| `web/` | Next.js 16 app: pages, API routes, store (memory or MongoDB Atlas), AI router (Gemini, Nemotron, cached fixtures, local), Solana client and Blink routes, Verify, recommendations. |
| `programs/forklab/` | Anchor 0.32 program: license split (fee, then authors, dust to first) and challenge prize escrow (settle by bps, refund after grace). |
| `chain/` | Chain worker (Memo anchoring with a one-at-a-time queue and 429 backoff), devnet seed, weekly settle job. |
| `bot/` | Weekly post (Grok blurb, X post, `--dry-run`). |
| `deploy/vultr/` | cloud-init, Caddyfile, systemd units and timer. |
| `scripts/` | `smoke.ts`, `create-indexes.ts`, `count-tests.ts`. |
| `inspo/` | Reference repos used while building (gitignored; safe to delete). |

## Going live on devnet

1. MongoDB Atlas: set `MONGODB_URI`, run `npm run indexes`.
2. Program: `anchor build && anchor keys sync && anchor deploy --provider.cluster devnet`; set `NEXT_PUBLIC_PROGRAM_ID`.
3. Authority keypair: `chain/wallets.json` is created on first run (gitignored). Fund it at faucet.solana.com.
4. `npm run seed -w chain` initializes Config (5 percent fee), registers the paid seeded mechanics and opens this week's game.
5. `FORKLAB_MODE=live`, start the web app, `npm run start -w chain`, and the hourly `settle-weekly` timer.
6. AI: `GEMINI_API_KEY`, `GEMINI_MODEL`, `EMBED_MODEL`; fallback `NVIDIA_API_KEY`, `NVIDIA_MODEL_ID`, `NVIDIA_BASE_URL` (https only). Check current model ids before setting them.

## What is verified here, and what is not

- `npm run check` runs typecheck plus engine, web and chain tests and `cargo test -p forklab` (program split math).
- The on-chain tests in `programs/forklab/tests` skip without a local validator; run them with `anchor test` where the Solana toolchain is installed. `challenge.refund_after_grace` needs a clock warp.
- The C# parity harness (`npm run parity -w engine`) needs dotnet 8, which was not available on the build machine; the TypeScript goldens pass and the generated C# mirrors the interpreter line for line, but run the comparison before claiming parity.
- The Unity asset importer has not been run against Unity. Test it in a clean project.
- Blinks unfurl only where a Blink-aware wallet or client is used; otherwise the URL opens the mechanic page.

## Honest limits

Attribution is computed off-chain by a published algorithm; the chain stores the hash and enforces the payout. Replay verification stops forged scores, not scripted inputs. Votes are Sybil-prone because wallets are free. The settle authority is trusted to submit the published payout list; anyone can recompute it from the snapshot. Devnet only. The Community tab is community-run and not an official FaZe program.
