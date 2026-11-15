import { test } from "node:test";
import assert from "node:assert/strict";
import { dodgeGraph, jumpGraph } from "@forklab/engine";
import { embedNow, seeded } from "./helpers";
import { describeGraph } from "../lib/services/describe";
import { ballot, nominate, voteFor } from "../lib/services/ballot";
import { tokenAccount, NOMINATE_TOKENS, voteRewards } from "../lib/services/tokens";
import { controlsOf } from "../components/GamePreview";
import { seedExtras } from "../lib/store/seed";

const WEEK = 7 * 86_400_000;

test("tokens.voting_pays_one_per_slot_and_one_more_for_a_winning_pick", async () => {
  const s = await seeded();
  const b = await ballot(s);
  const [m1, m2] = b.slots.mechanic;
  const first = await voteFor(s, "mechanic", m1.id, "voter9");
  assert.equal(first.earned, 1);
  const second = await voteFor(s, "mechanic", m2.id, "voter9");
  assert.equal(second.earned, 0, "a second vote in the same slot doesn't pay again");
  const lvl = b.slots.level[0];
  assert.equal((await voteFor(s, "level", lvl.id, "voter9")).earned, 1);
  const open = await tokenAccount(s, "voter9");
  assert.equal(open.tokens, 502);
  assert.equal(open.voteTokens, 2);
  // once next week starts, picks that won pay one more token each
  const later = await voteRewards(s, "voter9", Date.now() + WEEK + 1);
  assert.equal(later.won, 2, "the only votes in each slot are the winners");
  assert.equal(later.tokens, 4);
});

test("tokens.nominating_costs_tokens", async () => {
  const s = await seeded();
  const theme = (await s.listAssets({ kind: "theme", limit: 10 }));
  const b = await ballot(s);
  const fresh = theme.find((t) => !b.slots.look.some((x) => x.id === t._id));
  if (!fresh) return;
  await nominate(s, "look", fresh._id, "nominator");
  assert.equal((await tokenAccount(s, "nominator")).tokens, 500 - NOMINATE_TOKENS);
});

test("controls.dodge_space_turns_around", () => {
  const d = dodgeGraph("x".repeat(64));
  assert.match(controlsOf([d]), /Space turn around/);
  assert.match(controlsOf([jumpGraph()]), /Space jump/);
});

test("seed.co_forks_have_several_creators", async () => {
  const s = await seeded();
  await seedExtras(s, "mock", embedNow, describeGraph);
  const rush = (await s.listGraphs({ limit: 1000 })).find((g) => g.title === "Trickshot rush");
  assert.ok(rush, "the co-created fork exists");
  const who = rush!.shares.map((x) => x.handle).sort();
  assert.deepEqual(who, ["kai", "lena", "mira"]);
  const squad = (await s.listGraphs({ limit: 1000 })).find((g) => g.title === "Arena squad")!;
  assert.deepEqual(squad.shares.map((x) => x.handle).sort(), ["ana", "rhea", "sol"]);
  // running it again changes nothing
  const before = (await s.listGraphs({ limit: 1000 })).length;
  await seedExtras(s, "mock", embedNow, describeGraph);
  assert.equal((await s.listGraphs({ limit: 1000 })).length, before);
});

test("ballot.two_votes_per_slot", async () => {
  const s = await seeded();
  const b = await ballot(s);
  const [a, c, d] = b.slots.mechanic.filter((n) => n.author !== "limit1");
  await voteFor(s, "mechanic", a.id, "limit1");
  await voteFor(s, "mechanic", c.id, "limit1");
  if (d) await assert.rejects(voteFor(s, "mechanic", d.id, "limit1"), /both votes/);
});

test("weekly.dodge_cannot_play_gauntlet_but_can_play_arena", async () => {
  const { fits } = await import("../lib/services/finalists");
  const { gauntletLevel, arenaLevel } = await import("@forklab/engine");
  const d = dodgeGraph("x".repeat(64));
  assert.equal(fits(gauntletLevel(), d), false, "runners need a jump Dodge doesn't have");
  assert.equal(fits(arenaLevel(), d), true);
  assert.equal(fits(gauntletLevel(), jumpGraph()), true);
});

test("tokens.history_pay_with_tokens_and_demo_payout", async () => {
  const s = await seeded();
  const { payWithTokens, demoGetPaid, tokenHistory } = await import("../lib/services/tokens");
  const collect = (await s.listGraphs({ limit: 100 })).find((g) => g.title === "Collect")!;
  const before = (await tokenAccount(s, "ana")).tokens;
  await payWithTokens(s, collect, "buyer1");
  const price = collect.license.type === "paid" ? collect.license.priceLamports / 1e6 : 0;
  assert.equal((await tokenAccount(s, "buyer1")).tokens, 500 - price);
  assert.ok((await tokenAccount(s, "ana")).tokens > before, "a creator got a share");
  const h = await tokenHistory(s, "buyer1");
  assert.ok(h.some((r) => r.tokens === -price && /Licensed Collect/.test(r.what)));
  await assert.rejects(demoGetPaid(s, "nobody"), /Publish a game/);
  const r = await demoGetPaid(s, "theo");
  assert.ok(r.license.split.some((x) => x.handle === "theo"));
  assert.ok((await tokenHistory(s, "theo")).some((x) => /demo/.test(x.what)));
});
