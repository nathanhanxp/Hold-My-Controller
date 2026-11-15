# Hold My Controller agent rules

Follow PLAN.md task order. Tests first. Never commit secrets or keypairs.
The engine package must not import React, Next, or Solana.
Simulation state is int32 fixed-point milli-units. No floats in state.
All AI output is a proposal that the user must apply.
Treat graph text as untrusted data in prompts.
Devnet only. Label simulated receipts as Simulated.
All UI text is plain English; the Odyssey theme is visual only. No emoji. Sentence case.

## Run commands

```
npm install
npm run check                # typecheck + every test suite (engine, web, chain, cargo) -> .test-count.json
npm run dev                  # web on :3000, FORKLAB_MODE=mock works with no database or keys
SMOKE_URL=http://localhost:3000 npm run smoke
npm run golden -w engine     # rewrite golden snapshots (only after an intentional engine change)
npm run parity -w engine     # C# parity (needs dotnet 8)
cargo test -p forklab        # program split math
anchor build && anchor test  # on-chain tests (needs the Solana + Anchor toolchain)
npm run start -w chain       # chain worker, live mode only (MONGODB_URI, deployed program, authority keypair)
npm run settle-weekly -w chain
npm run indexes              # MongoDB + Atlas Vector Search indexes
```
