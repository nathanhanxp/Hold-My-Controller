import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenPayout } from "@forklab/engine";
import { seeded } from "./helpers";
import { ballot, ballotWinners, nextGameId, nominate, voteFor } from "../lib/services/ballot";
import { ensureWeeklyGame, makersOf, snapshotFor } from "../lib/services/challenges";

const DAY = 86_400_000;

test("ballot.seeds_nominees_for_every_slot", async () => {
  const s = await seeded();
  const b = await ballot(s);
  assert.equal(b.game, nextGameId());
  assert.ok(b.slots.mechanic.length > 0 && b.slots.level.length > 0 && b.slots.look.length > 0, "something to vote on in each slot");
});

test("ballot.vote_rules", async () => {
  const s = await seeded();
  const b = await ballot(s);
  const m = b.slots.mechanic[0];
  await voteFor(s, "mechanic", m.id, "voter1");
  await assert.rejects(voteFor(s, "mechanic", m.id, "voter1"), /already voted/);
  await assert.rejects(voteFor(s, "mechanic", m.id, m.author), /own piece/);
  await assert.rejects(voteFor(s, "mechanic", "nope", "voter2"), /not on the ballot/);
  const after = await ballot(s);
  assert.equal(after.slots.mechanic.find((x) => x.id === m.id)!.votes, 1);
});

test("ballot.nominate_checks_the_slot", async () => {
  const s = await seeded();
  const level = (await s.listGraphs({ kind: "level", limit: 1 }))[0];
  await assert.rejects(nominate(s, "mechanic", level._id, "ana"), /not a published mechanic/);
  const theme = (await s.listAssets({ kind: "theme", limit: 5 }))[0];
  const b = await ballot(s);
  if (!b.slots.look.some((x) => x.id === theme._id)) await nominate(s, "look", theme._id, "ana");
  await assert.rejects(nominate(s, "look", theme._id, "ana"), /Already nominated/);
});

test("ballot.winners_become_next_weeks_game_and_makers_get_paid", async () => {
  const s = await seeded();
  const b = await ballot(s);
  const pickMech = b.slots.mechanic[b.slots.mechanic.length - 1];
  const pickLevel = b.slots.level[b.slots.level.length - 1];
  const pickLook = b.slots.look[0];
  await voteFor(s, "mechanic", pickMech.id, "v1");
  await voteFor(s, "level", pickLevel.id, "v1");
  await voteFor(s, "look", pickLook.id, "v1");
  const w = await ballotWinners(s, b.game);
  assert.equal(w.mechanic!.graphId, pickMech.id);
  // next week's game is built from the winners
  const { challenge } = await ensureWeeklyGame(s, new Date(Date.now() + 7 * DAY), 1000);
  assert.equal(challenge._id, b.game);
  assert.equal(challenge.minigame!.mechanicHash, pickMech.id);
  assert.equal(challenge.minigame!.levelHash, pickLevel.id);
  assert.equal(challenge.look?.assetId, pickLook.id);
  assert.equal(challenge.chosenBy, "vote");
  // makers: mechanic authors share half, level and look authors a quarter each, summing to the whole makers' pot
  const mech = (await s.getGraph(pickMech.id))!;
  const level = (await s.getGraph(pickLevel.id))!;
  const makers = await makersOf(s, challenge, mech, level);
  assert.equal(makers.reduce((t, m) => t + m.bps, 0), 10_000);
  const snap = await snapshotFor(s, challenge);
  assert.deepEqual(snap.contributors, makers, "the settle snapshot pays the same makers");
  const lines = flattenPayout({ ...snap, players: [{ player: "p1", wallet: "P1wallet", score: 10, replayHash: "r", verifiedAt: 1 }] });
  const makerBps = lines.filter((l) => makers.some((m) => m.wallet === l.wallet)).reduce((t, l) => t + l.bps, 0);
  assert.ok(makerBps >= 2990 && makerBps <= 3000, `makers get the 30% pot (got ${makerBps})`);
});
