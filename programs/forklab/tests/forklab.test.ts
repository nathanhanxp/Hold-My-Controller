// On-chain tests for programs/forklab. Run with `anchor test` (starts a local validator and deploys the program),
// or against any RPC with the program deployed: FORKLAB_TEST_RPC=http://127.0.0.1:8899 NEXT_PUBLIC_PROGRAM_ID=<id>.
// Each test skips with a message when no validator is reachable, so `npm run check` stays green on machines
// without the Solana toolchain. The split math itself is covered by `cargo test -p forklab`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  buildCreateChallengeIx, buildInitializeIx, buildLicenseIx, buildRegisterMechanicIx, buildSettleIx, buildRefundIx, challengePda, configPda, fetchConfig, mechanicPda,
} from "../../../web/lib/solana";

const RPC = process.env.FORKLAB_TEST_RPC ?? process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
const conn = new Connection(RPC, "confirmed");
const authority = Keypair.generate();
const feeWallet = Keypair.generate();

async function up(): Promise<boolean> {
  try { await conn.getVersion(); return true; } catch { return false; }
}
async function fund(k: Keypair, sol = 5) {
  const sig = await conn.requestAirdrop(k.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const send = (ixs: Parameters<Transaction["add"]>, signers: Keypair[]) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });

let ready = false;
test("setup", async (t) => {
  if (!(await up())) { t.skip(`no validator at ${RPC}`); return; }
  await fund(authority, 20);
  if (!(await conn.getAccountInfo(configPda()))) await send([buildInitializeIx(authority.publicKey, 500, feeWallet.publicKey)], [authority]);
  const cfg = await fetchConfig().catch(() => null);
  ready = !!cfg;
});

async function registered(price: number, authors: Keypair[], bps: number[]) {
  const h = hash(`m-${Math.random()}`);
  await send([buildRegisterMechanicIx(authority.publicKey, h, null, price, authors.map((a, i) => ({ wallet: a.publicKey, bps: bps[i] })))], [authority]);
  return h;
}

test("program.conserves_lamports", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const authors = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const buyer = Keypair.generate();
  await fund(buyer);
  const h = await registered(100_000_001, authors, [3334, 3333, 3333]);
  const before = await Promise.all([...authors, feeWallet].map((k) => conn.getBalance(k.publicKey)));
  await send([buildLicenseIx(buyer.publicKey, h, feeWallet.publicKey, authors.map((a) => a.publicKey))], [buyer]);
  const after = await Promise.all([...authors, feeWallet].map((k) => conn.getBalance(k.publicKey)));
  const received = after.reduce((s, v, i) => s + v - before[i], 0);
  assert.equal(received, 100_000_001);
});

test("program.rejects_wrong_authors", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const authors = [Keypair.generate(), Keypair.generate()];
  const buyer = Keypair.generate();
  await fund(buyer);
  const h = await registered(1_000_000, authors, [5000, 5000]);
  await assert.rejects(send([buildLicenseIx(buyer.publicKey, h, feeWallet.publicKey, [authors[1].publicKey, authors[0].publicKey])], [buyer]));
});

test("program.rejects_double_license", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const a = Keypair.generate();
  const buyer = Keypair.generate();
  await fund(buyer);
  const h = await registered(1_000_000, [a], [10_000]);
  await send([buildLicenseIx(buyer.publicKey, h, feeWallet.publicKey, [a.publicKey])], [buyer]);
  await assert.rejects(send([buildLicenseIx(buyer.publicKey, h, feeWallet.publicKey, [a.publicKey])], [buyer]));
});

test("program.rejects_bad_shares", async (t) => {
  if (!ready) return t.skip("validator not ready");
  await assert.rejects(registered(1000, [Keypair.generate(), Keypair.generate()], [5000, 4000]));
});

test("program.rejects_free_mechanic", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const a = Keypair.generate();
  const buyer = Keypair.generate();
  await fund(buyer);
  const h = await registered(0, [a], [10_000]);
  await assert.rejects(send([buildLicenseIx(buyer.publicKey, h, feeWallet.publicKey, [a.publicKey])], [buyer]));
});

test("program.fee_only_to_fee_wallet", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const a = Keypair.generate();
  const buyer = Keypair.generate();
  await fund(buyer);
  const h = await registered(1_000_000, [a], [10_000]);
  const impostor = Keypair.generate();
  await assert.rejects(send([buildLicenseIx(buyer.publicKey, h, impostor.publicKey, [a.publicKey])], [buyer]));
  assert.ok(mechanicPda(h));
});

async function challenge(endsInSec: number, maxWinners = 12, pool = LAMPORTS_PER_SOL) {
  const id = BigInt(Math.floor(Math.random() * 1e12));
  await send([buildCreateChallengeIx(authority.publicKey, id, "game", Date.now() + endsInSec * 1000, maxWinners, pool)], [authority]);
  return id;
}
const hex32 = "ab".repeat(32);

test("challenge.rejects_early_settle", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const id = await challenge(3600);
  await assert.rejects(send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: Keypair.generate().publicKey, bps: 10_000 }])], [authority]));
});

test("challenge.settles_by_bps and rejects_double_settle", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const id = await challenge(3);
  await new Promise((r) => setTimeout(r, 5000));
  const w = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  await send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: w[0].publicKey, bps: 5000 }, { wallet: w[1].publicKey, bps: 3000 }, { wallet: w[2].publicKey, bps: 2000 }])], [authority]);
  const bal = await Promise.all(w.map((k) => conn.getBalance(k.publicKey)));
  assert.deepEqual(bal, [500_000_000, 300_000_000, 200_000_000]);
  await assert.rejects(send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: w[0].publicKey, bps: 10_000 }])], [authority]));
});

test("challenge.rejects_non_authority, rejects_bad_split, rejects_duplicate_recipient, rejects_more_than_max_winners", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const id = await challenge(3, 2);
  await new Promise((r) => setTimeout(r, 5000));
  const stranger = Keypair.generate();
  await fund(stranger, 1);
  const a = Keypair.generate().publicKey, b = Keypair.generate().publicKey, c = Keypair.generate().publicKey;
  await assert.rejects(send([buildSettleIx(stranger.publicKey, id, hex32, [{ wallet: a, bps: 10_000 }])], [stranger]));
  await assert.rejects(send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: a, bps: 6000 }, { wallet: b, bps: 3000 }])], [authority]));
  await assert.rejects(send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: a, bps: 5000 }, { wallet: a, bps: 5000 }])], [authority]));
  await assert.rejects(send([buildSettleIx(authority.publicKey, id, hex32, [{ wallet: a, bps: 4000 }, { wallet: b, bps: 3000 }, { wallet: c, bps: 3000 }])], [authority]));
});

test("challenge.refund_blocked_before_grace", async (t) => {
  if (!ready) return t.skip("validator not ready");
  const id = await challenge(3);
  await new Promise((r) => setTimeout(r, 4000));
  await assert.rejects(send([buildRefundIx(authority.publicKey, id)], [authority]));
  assert.ok(challengePda(id));
});

// refund_after_grace needs a 7-day clock warp; run it with solana-bankrun or a validator with --warp-slot.
test("challenge.refund_after_grace", { skip: "needs clock warp (bankrun or --warp-slot); see PLAN.md 6.4" }, () => {});
void SystemProgram; void PublicKey;
