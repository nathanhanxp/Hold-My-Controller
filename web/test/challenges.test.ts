import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, verifySnapshot } from "@forklab/engine";
import { castVote, enterChallenge, ensureWeeklyGame, playerStandings, settleChallenge, submitReplay, type SettleSender } from "../lib/services/challenges";
import { ApiError } from "../lib/services/publish";
import { gameIdFor } from "../lib/services/weeks";
import { seeded } from "./helpers";

const DAY = 86_400_000;
const SPACE = 1 << KEYS.indexOf("Space");
const sent: Array<{ id: string; hash: string; n: number }> = [];
const sender: SettleSender = async (c, hash, payouts) => { sent.push({ id: c._id, hash, n: payouts.length }); return { sig: `SIMULATED-${c._id}`, simulated: true }; };

test("api.entry_requires_free_license", async () => {
  const s = await seeded();
  const collect = (await s.listGraphs({})).find((g) => g.title === "Collect")!;
  await assert.rejects(enterChallenge(s, "ep-2", collect._id, "ana"), (e: unknown) => e instanceof ApiError && e.code === "NOT_FREE");
  const dodge = (await s.listGraphs({})).find((g) => g.title === "Dodge")!;
  const r = await enterChallenge(s, "ep-2", dodge._id, "theo");
  assert.equal(r.ok, false, "Dodge has no sacred object, so the server rule check fails");
  await assert.rejects(enterChallenge(s, "ep-2", dodge._id, "mira"), (e: unknown) => e instanceof ApiError && e.code === "NOT_OWNER");
});

test("api.vote_once_per_wallet", async () => {
  const s = await seeded();
  const temple = (await s.listGraphs({})).find((g) => g.title === "Temple")!;
  await castVote(s, "ep-2", temple._id, "W-rhea", "rhea");
  await assert.rejects(castVote(s, "ep-2", temple._id, "W-rhea", "rhea"), (e: unknown) => e instanceof ApiError && e.code === "DUPLICATE");
  await assert.rejects(castVote(s, "ep-2", temple._id, "W-omar", "omar"), (e: unknown) => e instanceof ApiError && e.code === "OWN_ENTRY");
  await assert.rejects(castVote(s, "ep-2", temple._id, "W-new", "newbie"), (e: unknown) => e instanceof ApiError && e.code === "NEEDS_PLAY");
});

test("replay.server_score_lands_on_board", async () => {
  const s = await seeded();
  const id = gameIdFor(new Date());
  const c = (await s.getChallenge(id))!;
  const script = { graphHash: c.minigame!.mechanicHash, seed: c.minigame!.seed, ticks: 2400, inputs: [[20, SPACE], [21, 0], [70, SPACE], [71, 0]] };
  const r = await submitReplay(s, id, { player: "zed", wallet: "Wzed", script, claimedScore: 9999 });
  assert.equal(r.forgedClaimRejected, true);
  const row = (await playerStandings(s, id)).find((x) => x.player === "zed")!;
  assert.equal(row.score, r.score);
  assert.notEqual(row.score, 9999);
  await assert.rejects(submitReplay(s, id, { player: "zed", script: { ...script, seed: 1 } }), (e: unknown) => e instanceof ApiError && e.code === "REPLAY_WRONG_SEED");
});

test("challenge.settles_by_bps (service)", async () => {
  const s = await seeded();
  const last = gameIdFor(new Date(Date.now() - 7 * DAY));
  const r = await settleChallenge(s, last, sender);
  assert.equal(r.challenge.prize.status, "settled");
  const pay = r.challenge.prize.payouts!;
  assert.equal(pay.reduce((a, b) => a + b.bps, 0), 10_000);
  assert.ok(pay.some((p) => p.role === "contributor") && pay.some((p) => p.role === "player"));
  const snap = (await s.getSnapshot(last))!;
  assert.equal(verifySnapshot(snap.body, r.challenge.prize.snapshotHash!).ok, true);
  const again = await settleChallenge(s, last, sender);
  assert.equal(again.already, true, "settling twice is a no-op");
  assert.equal(sent.filter((x) => x.id === last).length, 1);
});

test("challenge.rejects_early_settle (service)", async () => {
  const s = await seeded();
  await assert.rejects(settleChallenge(s, gameIdFor(new Date()), sender), (e: unknown) => e instanceof ApiError && e.code === "TOO_EARLY");
});

test("payout.no_players_blocks_settle (service)", async () => {
  const s = await seeded();
  const last = gameIdFor(new Date(Date.now() - 7 * DAY));
  for (const r of await s.replays(last)) s.replayDocs.delete(r._id);
  await assert.rejects(settleChallenge(s, last, sender), (e: unknown) => e instanceof ApiError && e.code === "NO_WINNERS");
  assert.equal((await s.getChallenge(last))!.prize.status, "no_winners");
});

test("settle_weekly.is_idempotent", async () => {
  const s = await seeded();
  const next = new Date(Date.now() + 7 * DAY);
  const a = await ensureWeeklyGame(s, next, 1000);
  const b = await ensureWeeklyGame(s, next, 1000);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal((await s.listChallenges()).filter((c) => c._id === gameIdFor(next)).length, 1);
});

test("settle_weekly.opens_next_game_with_winner", async () => {
  const s = await seeded();
  const { challenge } = await ensureWeeklyGame(s, new Date(Date.now() + 14 * DAY), 1000);
  const dodge = (await s.listGraphs({})).find((g) => g.title === "Dodge")!;
  assert.equal(challenge.minigame!.mechanicHash, dodge._id, "Dodge won episode 1");
});
