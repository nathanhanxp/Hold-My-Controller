import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, Sim, shooterGraph, type Graph } from "@forklab/engine";
import { demoIntent, demoProposal, isArenaSquad } from "../lib/ai/demo";
import { proposeGraph } from "../lib/ai/service";
import { AiRouter } from "../lib/ai/router";
import { MemoryStore } from "../lib/store/memory";

const squad = (): Graph => ({ ...shooterGraph(), title: "Arena squad (fork)" });

test("demo.reads_the_demo_requests", () => {
  assert.deepEqual(demoIntent("add mobs shooting at me at lower speed and a 5 heart system"), { hearts: 5, shooting: true, slow: true, industrial: false });
  assert.equal(demoIntent("make it industrial").industrial, true);
  assert.equal(demoIntent("make the player faster").hearts, null);
  assert.ok(isArenaSquad(squad()));
  assert.equal(demoProposal("add hearts", { ...shooterGraph(), title: "Dodge" }, "ana"), null, "only on Arena squad");
});

test("demo.hearts_and_slow_aimed_shots_play_correctly", () => {
  const r = demoProposal("enemies shooting at me at lower speed, 5 heart system", squad(), "ana")!;
  assert.ok(r);
  const g = r.graph;
  assert.equal(g.scene?.hud?.hearts, "hp");
  assert.equal(g.scene?.hud?.heartsMax, 5);
  const shot = g.nodes.find((n) => n.type === "Shoot" && n.params.from === "enemy")!;
  assert.equal(shot.params.direction, "at_player");
  assert.equal(shot.params.speed, 110);
  const sim = new Sim([compile(g)], 3, g.prefabs ?? {});
  let hp = -1, firstLoss = -1;
  for (let t = 0; t < 3600 && sim.status === "running"; t++) {
    sim.step(0);
    const v = [...sim.vars].find(([k]) => k.endsWith(".hp"))?.[1] ?? -1;
    if (hp > v && firstLoss < 0) firstLoss = t;
    hp = v;
  }
  assert.equal(sim.status, "lose", "standing still eventually loses");
  assert.equal(hp, 0);
  assert.ok(firstLoss > 60, `the first heart goes after a while, not instantly (${firstLoss})`);
});

test("demo.industrial_theme_and_instant_proposal", async () => {
  const r = await proposeGraph(new MemoryStore(), new AiRouter({ providers: [] }), { prompt: "change the theme to industrial", editor: "ana", current: squad() });
  assert.equal(r.provider, "cache");
  assert.equal(r.graph.scene?.preset, "city");
  assert.equal(r.graph.theme?.ground, "#7d8288");
  assert.equal(r.graph.nodes.length, squad().nodes.length, "a look change touches no blocks");
});

test("demo.get_paid_repeats_and_paying_twice_keeps_your_tokens", async () => {
  const { seeded } = await import("./helpers");
  const { demoGetPaid, payWithTokens, tokenAccount } = await import("../lib/services/tokens");
  const s = await seeded();
  const a = await demoGetPaid(s, "theo");
  const b = await demoGetPaid(s, "theo");
  const c = await demoGetPaid(s, "theo");
  assert.ok(a.license && b.license && c.license, "three demo sales in a row");
  const collect = (await s.listGraphs({ limit: 100 })).find((g) => g.title === "Collect")!;
  await payWithTokens(s, collect, "twice");
  const after = (await tokenAccount(s, "twice")).tokens;
  await assert.rejects(payWithTokens(s, collect, "twice"), /already licensed/);
  assert.equal((await tokenAccount(s, "twice")).tokens, after, "the refused second payment took nothing");
});

test("sky.plays_holds_altitude_and_shoots_drones", async () => {
  const { skyGraph, parseGraph, KEYS } = await import("@forklab/engine");
  const g = skyGraph();
  assert.ok(parseGraph(g).ok);
  const SP = 1 << KEYS.indexOf("Space"), A = 1 << KEYS.indexOf("KeyA"), D = 1 << KEYS.indexOf("KeyD");
  const sim = new Sim([compile(g)], 4, g.prefabs ?? {});
  let maxDrones = 0;
  for (let t = 0; t < 1200 && sim.status === "running"; t++) {
    // a simple pilot: line up with the nearest drone ahead and fire every third of a second
    const me = sim.entities.find((e) => e.tag === "player");
    const target = me ? sim.entities.filter((e) => e.tag === "enemy" && e.z < me.z).sort((a, b) => b.z - a.z)[0] : undefined;
    let mask = t % 20 === 0 ? SP : 0;
    if (me && target) { const dxm = target.x + target.w / 2 - (me.x + me.w / 2); if (dxm > 200) mask |= D; else if (dxm < -200) mask |= A; }
    sim.step(mask);
    maxDrones = Math.max(maxDrones, sim.entities.filter((e) => e.tag === "enemy").length);
    const p = sim.entities.find((e) => e.tag === "player");
    if (p) assert.equal(p.y, 2500, "no gravity: the plane holds its altitude");
  }
  assert.ok(maxDrones >= 1, "drones come");
  assert.ok(sim.score > 0, `shooting ahead scores (${sim.score})`);
});

test("sky.demo_answers_work_on_sky_patrol", () => {
  const { skyGraph } = require("@forklab/engine") as typeof import("@forklab/engine");
  const fork = { ...skyGraph(), title: "Sky patrol (fork)" };
  const r = demoProposal("add mobs shooting at me at lower speed and a 5 heart system, industrial theme", fork, "ana")!;
  assert.ok(r, "prepared answer");
  assert.match(r.explanation, /drones shoot slow fireballs/i);
  assert.equal(r.graph.scene?.hud?.hearts, "hp");
  assert.equal(r.graph.scene?.preset, "city");
  const sim = new Sim([compile(r.graph)], 3, r.graph.prefabs ?? {});
  let hp = -1;
  for (let t = 0; t < 3600 && sim.status === "running"; t++) { sim.step(0); hp = [...sim.vars].find(([k]) => k.endsWith(".hp"))?.[1] ?? hp; }
  assert.equal(sim.status, "lose");
  assert.equal(hp, 0, "hearts ran out before the end");
});

test("sky.is_three_forks_by_three_creators", async () => {
  const { seeded, embedNow } = await import("./helpers");
  const { seedExtras } = await import("../lib/store/seed");
  const { describeGraph } = await import("../lib/services/describe");
  const s = await seeded();
  await seedExtras(s, "mock", embedNow, describeGraph);
  const all = await s.listGraphs({ limit: 1000 });
  const patrol = all.find((g) => g.title === "Sky patrol")!;
  assert.ok(patrol, "Sky patrol is published");
  assert.deepEqual(patrol.shares.map((x) => x.handle).sort(), ["kai", "lena", "mira"]);
  const gunner = all.find((g) => g.title === "Sky gunner")!;
  const glider = all.find((g) => g.title === "Sky glider")!;
  assert.equal(patrol.parentId, gunner._id);
  assert.equal(gunner.parentId, glider._id);
});

test("tokens.demo_payout_for_a_chosen_game", async () => {
  const { seeded } = await import("./helpers");
  const { paidGames, demoGetPaid } = await import("../lib/services/tokens");
  const s = await seeded();
  const list = await paidGames(s, "mira");
  assert.ok(list.length >= 2, "mira has blocks in several games");
  const pick = list[list.length - 1];
  const r = await demoGetPaid(s, "mira", pick.id);
  assert.equal(r.hash, pick.id);
  await assert.rejects(demoGetPaid(s, "mira", "f".repeat(64)), /None of your blocks/);
});
