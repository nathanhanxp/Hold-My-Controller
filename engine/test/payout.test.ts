import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, flattenPayout, lamportsFor, PayoutError, snapshotBodyHash, verifySnapshot } from "../src/index";

const players = [
  { player: "p1", wallet: "W1", score: 30, replayHash: "r1" },
  { player: "p2", wallet: "W2", score: 20, replayHash: "r2" },
  { player: "p3", wallet: "W3", score: 10, replayHash: "r3" },
  { player: "p4", wallet: "W4", score: 5, replayHash: "r4" },
];
const sum = (l: { bps: number }[]) => l.reduce((a, b) => a + b.bps, 0);

test("payout.sums_to_10000", () => {
  const out = flattenPayout({ kind: "game", players, contributors: [{ handle: "a", wallet: "C1", bps: 6000 }, { handle: "b", wallet: "C2", bps: 3000 }, { handle: "c", wallet: "C3", bps: 1000 }] });
  assert.deepEqual(out.map((l) => l.bps), [3500, 2100, 1400, 1800, 900, 300]);
  assert.equal(sum(out), 10_000);
  const ep = flattenPayout({ kind: "episode", builders: [
    { graph: "g1", author: "a", wallet: "A", votes: 4, ruleOk: true, publishedAt: 1 },
    { graph: "g2", author: "b", wallet: "B", votes: 9, ruleOk: true, publishedAt: 2 },
    { graph: "g3", author: "c", wallet: "C", votes: 99, ruleOk: false, publishedAt: 3 },
  ] });
  assert.deepEqual(ep, [{ wallet: "B", bps: 6250 }, { wallet: "A", bps: 3750 }]);
});

test("payout.merges_duplicate_wallets", () => {
  const out = flattenPayout({ kind: "game", players, contributors: [{ handle: "p1", wallet: "W1", bps: 10000 }] });
  assert.equal(out.filter((l) => l.wallet === "W1").length, 1);
  assert.equal(out.find((l) => l.wallet === "W1")!.bps, 3500 + 3000);
  assert.equal(sum(out), 10_000);
});

test("payout.remainder_to_rank_one", () => {
  const out = flattenPayout({ kind: "game", players, contributors: [{ handle: "a", wallet: "C1", bps: 3334 }, { handle: "b", wallet: "C2", bps: 3333 }, { handle: "c", wallet: "C3", bps: 3333 }] });
  assert.deepEqual(out.map((l) => l.bps), [3502, 2100, 1400, 1000, 999, 999]);
});

test("payout.renormalises_fewer_players", () => {
  const out = flattenPayout({ kind: "game", players: players.slice(0, 2), contributors: [{ handle: "a", wallet: "C1", bps: 10000 }] });
  assert.deepEqual(out.map((l) => l.bps), [4375, 2625, 3000]);
});

test("payout.no_players_blocks_settle", () => {
  assert.throws(() => flattenPayout({ kind: "game", players: [], contributors: [{ handle: "a", wallet: "C", bps: 10000 }] }), (e: unknown) => e instanceof PayoutError && e.code === "NO_WINNERS");
  assert.throws(() => flattenPayout({ kind: "episode", builders: [] }), PayoutError);
});

test("snapshot.hash_stable", () => {
  const s = buildSnapshot({ challengeId: "202646", kind: "game", endedAt: 1, builders: [], game: { levelHash: "l", mechanicHash: "m", seed: 1 }, players, contributors: [{ handle: "a", wallet: "C1", bps: 10000 }] });
  const h = snapshotBodyHash(s);
  assert.equal(snapshotBodyHash(JSON.parse(JSON.stringify(s))), h);
  assert.equal(verifySnapshot(s, h).ok, true);
  const tampered = structuredClone(s);
  tampered.payouts[0].bps -= 1;
  tampered.payouts[1].bps += 1;
  assert.equal(verifySnapshot(tampered, h).ok, false);
  const lam = lamportsFor(1_000_000_001, s.payouts);
  assert.equal(lam.reduce((a, b) => a + b, 0), 1_000_000_001);
});
