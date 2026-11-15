// Chain worker: anchors every publish on Solana devnet (Night Watch chain.ts pattern).
// - polls Mongo for graphs with anchor.status = "pending" every 5 s, sweeps retries every 20 s
// - paid mechanics: register_mechanic (payout split PDA) + Memo in one transaction; free graphs: Memo only
// - Memo: { app: "forklab", v: 1, kind: "publish", graph: <hash>, prev: <parent hash or ""> }
// - one record at a time, 1.2 s gap, doubling backoff to 60 s on 429, disableRetryOnRateLimit
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { MongoClient } from "mongodb";
import { loadDotEnv, authorityKeypair } from "./lib/env";
import { AnchorQueue, isRateLimited, type WriteOutcome } from "./lib/queue";
import { buildRegisterMechanicIx, mechanicPda, memoIx, programConfigured } from "../web/lib/solana";
import type { GraphDoc } from "../web/lib/store/types";

loadDotEnv();
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const solana = new Connection(RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
const payer = authorityKeypair();

process.on("unhandledRejection", (e) => console.error("Network hiccup (will retry):", (e as Error)?.message ?? e));
process.on("uncaughtException", (e) => console.error("Unexpected error (still running):", e.message));

async function ensureFunded() {
  let bal = 0;
  try { bal = await solana.getBalance(payer.publicKey); } catch (e) {
    console.log(`Can't reach Solana devnet (${(e as Error).message}). Records retry every 20 s.`);
    return;
  }
  console.log(`Authority ${payer.publicKey.toBase58()} has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} devnet SOL`);
  if (bal >= 0.5 * LAMPORTS_PER_SOL) return;
  try {
    const sig = await solana.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
    await solana.confirmTransaction(sig, "confirmed");
    console.log("Airdrop received");
  } catch {
    console.log(`Airdrop was rate limited. Get devnet SOL at https://faucet.solana.com (address: ${payer.publicKey.toBase58()})`);
  }
}

let lastBroke = 0;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("The chain worker needs MONGODB_URI (it reads pending publishes from Mongo).");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  const graphs = client.db(process.env.MONGODB_DB ?? "forklab").collection<GraphDoc>("graphs");
  await ensureFunded();

  const write = async (hash: string): Promise<WriteOutcome> => {
    const d = await graphs.findOne({ _id: hash });
    if (!d || d.anchor.status !== "pending") return "skip";
    // ancestors anchor first so `prev` always points at an anchored record
    if (d.parentId) {
      const p = await graphs.findOne({ _id: d.parentId }, { projection: { anchor: 1 } });
      if (p && p.anchor.status === "pending") return "skip";
    }
    const balance = await solana.getBalance(payer.publicKey).catch(() => -1);
    if (balance >= 0 && balance < 10_000) {
      if (Date.now() - lastBroke > 120_000) {
        lastBroke = Date.now();
        console.log(`Authority has no devnet SOL; waiting. Fund ${payer.publicKey.toBase58()} at https://faucet.solana.com and anchors resume automatically.`);
      }
      return "rate-limited";
    }
    try {
      const tx = new Transaction();
      let pda: string | undefined;
      if (d.license.type === "paid" && programConfigured()) {
        const exists = await solana.getAccountInfo(mechanicPda(hash));
        if (!exists) {
          tx.add(buildRegisterMechanicIx(payer.publicKey, hash, d.parentId, d.license.priceLamports, d.shares.map((s) => ({ wallet: new PublicKey(s.wallet!), bps: s.bps }))));
        }
        pda = mechanicPda(hash).toBase58();
      }
      tx.add(memoIx({ app: "forklab", v: 1, kind: "publish", graph: hash, prev: d.parentId ?? "" }));
      const sig = await sendAndConfirmTransaction(solana, tx, [payer], { commitment: "confirmed" });
      await graphs.updateOne({ _id: hash }, { $set: { anchor: { status: "confirmed", sig, mechanicPda: pda } } });
      console.log(`${d.title} anchored -> https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      return "ok";
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (isRateLimited(msg)) return "rate-limited";
      if (/prior credit|insufficient/i.test(msg)) {
        console.error(`Authority is out of devnet SOL. Add some at https://faucet.solana.com (address: ${payer.publicKey.toBase58()})`);
        return "rate-limited";
      }
      console.error(`Could not anchor ${hash.slice(0, 12)}: ${msg.split("\n")[0]} (will retry)`);
      return "failed";
    }
  };

  const queue = new AnchorQueue(write);
  const sweep = async () => {
    const pending = await graphs.find({ "anchor.status": "pending" }).sort({ createdAt: 1 }).limit(50).toArray();
    for (const p of pending) queue.enqueue(p._id);
  };
  await sweep();
  setInterval(() => void sweep(), 5_000);
  setInterval(() => void ensureFunded(), 10 * 60_000);
  console.log("Chain worker running. Watching for pending publishes.");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
