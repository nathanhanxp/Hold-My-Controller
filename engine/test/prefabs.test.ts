import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, Sim, compile, graphHash, parseGraph, shooterGraph, siegeGraph } from "../src/index";

test("prefabs.game_defined_prefab_spawns_and_hits", () => {
  const g = siegeGraph();
  assert.ok(parseGraph(g).ok, "siege is valid");
  const sim = new Sim([compile(g)], 9, {});
  let sawFireball = false;
  for (let t = 0; t < 900 && sim.status === "running"; t += 1) { sim.step(0); if (sim.entities.some((e) => e.prefab === "fireball" && e.tag === "hazard")) sawFireball = true; }
  assert.ok(sawFireball, "raiders throw fireballs");
});

test("prefabs.shots_ignore_their_shooter", () => {
  const g = siegeGraph();
  const sim = new Sim([compile(g)], 9, {});
  // tick 140: raiders fire bolts from inside themselves; without the owner rule "bolt touches enemy" would kill them
  let raidersBefore = 0, raidersAfter = 0;
  for (let t = 0; t < 145; t += 1) { if (t === 140) raidersBefore = sim.entities.filter((e) => e.tag === "enemy").length; sim.step(0); }
  raidersAfter = sim.entities.filter((e) => e.tag === "enemy").length;
  assert.ok(raidersBefore > 0);
  assert.ok(raidersAfter >= raidersBefore, "an enemy's own bolt does not destroy it");
  const player = 1 << KEYS.indexOf("Space");
  void player;
});

test("prefabs.hash_includes_custom_prefabs_only_when_present", () => {
  const s = shooterGraph();
  assert.equal(graphHash(s), graphHash({ ...s, prefabs: {} }), "empty prefabs keep the old hash");
  const g = siegeGraph();
  const changed = { ...g, prefabs: { fireball: { ...g.prefabs!.fireball, w: 900 } } };
  assert.notEqual(graphHash(g), graphHash(changed), "changing a prefab changes the hash");
});
