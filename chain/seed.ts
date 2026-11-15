// Prepares devnet for the demo: initializes Config (5 percent fee), registers the paid seeded mechanics,
// and opens this week's game with the treasury pool. Run once after deploying the program.
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { loadDotEnv, authorityKeypair } from "./lib/env";
import { buildInitializeIx, buildRegisterMechanicIx, configPda, mechanicPda, programConfigured, withRpcRetry } from "../web/lib/solana";
import { MongoStore } from "../web/lib/store/mongo";
import { MemoryStore } from "../web/lib/store/memory";
import { seedStore } from "../web/lib/store/seed";
import { localEmbed, LOCAL_EMBED_MODEL } from "../web/lib/ai/embed-local";
import { describeGraph } from "../web/lib/services/describe";
import { ensureWeeklyGame } from "../web/lib/services/challenges";
import { devnetCreateChallenge } from "../web/lib/services/chain-server";

loadDotEnv();
async function main() {
  if (!programConfigured()) throw new Error("Set NEXT_PUBLIC_PROGRAM_ID to the deployed program id first (anchor deploy --provider.cluster devnet).");
  const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", { commitment: "confirmed", disableRetryOnRateLimit: true });
  const authority = authorityKeypair();
  const feeWallet = new PublicKey(process.env.FEE_WALLET ?? authority.publicKey.toBase58());
  if (!(await conn.getAccountInfo(configPda()))) {
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(buildInitializeIx(authority.publicKey, 500, feeWallet)), [authority]);
    console.log(`Config initialized: ${sig}`);
  }
  const embed = (t: string) => ({ vector: localEmbed(t, Number(process.env.EMBED_DIM ?? 768)), model: LOCAL_EMBED_MODEL });
  const store = process.env.MONGODB_URI ? await MongoStore.connect(process.env.MONGODB_URI, process.env.MONGODB_DB ?? "forklab") : new MemoryStore();
  if (store instanceof MongoStore ? await store.isEmpty() : true) await seedStore(store, "live", embed, describeGraph);
  for (const d of await store.listGraphs({ license: "paid", limit: 50 })) {
    if (await conn.getAccountInfo(mechanicPda(d._id))) continue;
    const ix = buildRegisterMechanicIx(authority.publicKey, d._id, d.parentId, d.license.type === "paid" ? d.license.priceLamports : 0, d.shares.map((s) => ({ wallet: new PublicKey(s.wallet!), bps: s.bps })));
    const sig = await withRpcRetry(() => sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority]));
    console.log(`Registered ${d.title}: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const { created, challenge } = await ensureWeeklyGame(store, new Date(), Number(process.env.WEEKLY_POOL_LAMPORTS ?? 200_000_000), devnetCreateChallenge);
  console.log(created ? `Opened ${challenge._id} with a ${challenge.prize.poolLamports} lamport pool.` : `${challenge._id} already open.`);
  process.exit(0);
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
