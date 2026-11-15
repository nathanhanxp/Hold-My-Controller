import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, Transaction } from "@solana/web3.js";
import { AnchorQueue } from "../lib/queue";
import { buildSettleIx, memoIx } from "../../web/lib/solana";

test("chain.backoff_on_429", async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const q = new AnchorQueue(async (id) => {
    calls += 1;
    if (id === "a" && calls <= 3) return "rate-limited";
    return "ok";
  }, async (ms) => { sleeps.push(ms); });
  q.enqueue("a");
  q.enqueue("b");
  await q.drain();
  while (q.draining) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(sleeps.slice(0, 3), [5000, 10000, 20000], "doubling backoff");
  assert.ok(q.log.includes("ok a") && q.log.includes("ok b"));
  assert.ok(q.log.indexOf("ok a") < q.log.indexOf("ok b"), "order kept");
  assert.ok(sleeps.includes(1200), "1.2 s gap between records");
});

test("chain.backoff_caps_at_60s", async () => {
  const sleeps: number[] = [];
  let n = 0;
  const q = new AnchorQueue(async () => (++n < 8 ? "rate-limited" : "ok"), async (ms) => { sleeps.push(ms); });
  q.enqueue("x");
  while (q.draining) await new Promise((r) => setTimeout(r, 5));
  assert.equal(Math.max(...sleeps), 60_000);
});

test("challenge.settle_tx_fits_12_recipients", () => {
  const authority = Keypair.generate();
  const payouts = Array.from({ length: 12 }, (_, i) => ({ wallet: Keypair.generate().publicKey, bps: i === 0 ? 10_000 - 11 * 833 : 833 }));
  const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: "11111111111111111111111111111111" })
    .add(buildSettleIx(authority.publicKey, 202646n, "ab".repeat(32), payouts))
    .add(memoIx({ app: "forklab", v: 1, kind: "settle", challenge: "game-202646", snapshot: "ab".repeat(32) }));
  tx.sign(authority);
  const size = tx.serialize().length;
  assert.ok(size <= 1232, `settle tx is ${size} bytes`);
});
