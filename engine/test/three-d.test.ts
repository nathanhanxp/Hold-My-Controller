import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_PREFABS, KEYS, compile, makeEntity, overlaps, runGraph, Sim, shooterGraph, groveGraph, hurdleGraph, parseGraph, ex, type Graph } from "../src/index";

const bit = (k: string) => 1 << KEYS.indexOf(k as (typeof KEYS)[number]);
const G = (nodes: Graph["nodes"], edges: Graph["edges"]): Graph => ({ schema: "forklab.graph.v1", parent: null, root: "", kind: "mechanic", sources: [], title: "t", tags: [], license: { type: "free" }, nodes, edges });
const n = (id: string, type: Graph["nodes"][number]["type"], params: Graph["nodes"][number]["params"] = {}) => ({ id, type, params, authorId: "t", originFork: "" });

test("world.aabb_needs_depth_overlap", () => {
  const a = makeEntity(1, "player", BUILTIN_PREFABS.player, 0, 0, 0);
  const near = makeEntity(2, "rock", BUILTIN_PREFABS.rock, 0, 0, 599);
  const far = makeEntity(3, "rock", BUILTIN_PREFABS.rock, 0, 0, 600);
  assert.equal(overlaps(a, near), true);
  assert.equal(overlaps(a, far), false, "same x and y but a lane apart in depth do not touch");
});

test("interpret.move_stop_and_released", () => {
  const g = G([
    n("a", "OnStart"), n("b", "Spawn", { prefab: "player", x: 1000, y: 0, z: 8000 }),
    n("c", "OnKey", { key: "KeyW", when: "held" }), n("d", "Move", { entity: "player", direction: "forward", speed: 100 }),
    n("e", "OnKey", { key: "KeyW", when: "released" }), n("f", "Stop", { entity: "player", axis: "z" }),
  ], [ex("a", "b"), ex("c", "d"), ex("e", "f")]);
  const sim = new Sim([compile(g)], 1);
  sim.step(0);
  for (let i = 0; i < 10; i += 1) sim.step(bit("KeyW"));
  const p = sim.entities[0];
  assert.equal(p.z, 8000 - 1000);
  sim.step(0);
  assert.equal(p.vz, 0, "releasing W stops depth motion");
  assert.equal(p.z, 7000);
});

test("interpret.shoot_spawns_moving_projectile", () => {
  const g = G([
    n("a", "OnStart"), n("b", "Spawn", { prefab: "player", x: 1000, y: 0, z: 8000 }),
    n("c", "OnKey", { key: "Space", when: "press" }), n("d", "Shoot", { prefab: "bolt", from: "player", direction: "forward", speed: 300 }),
  ], [ex("a", "b"), ex("c", "d")]);
  const sim = new Sim([compile(g)], 1);
  sim.step(0);
  sim.step(bit("Space"));
  const bolt = sim.entities.find((e) => e.tag === "bolt")!;
  assert.ok(bolt);
  assert.deepEqual([bolt.vx, bolt.vy, bolt.vz], [0, 0, -300]);
  const z0 = bolt.z;
  sim.step(0);
  assert.equal(bolt.z, z0 - 300);
});

test("interpret.score_reporter_reads_score", () => {
  const g = G([n("a", "OnTick", { everyN: 1 }), n("b", "AddScore", { n: 1 }), n("c", "Branch"), n("d", "Compare", { op: "ge", b: 3 }), n("e", "Score"), n("f", "Win")],
    [ex("a", "b"), ex("b", "c"), { from: { node: "d", port: "out" }, to: { node: "c", port: "cond" }, kind: "data" }, { from: { node: "e", port: "out" }, to: { node: "d", port: "a" }, kind: "data" }, ex("c", "f", "true")]);
  const sim = new Sim([compile(g)], 1);
  for (let i = 0; i < 5 && sim.status === "running"; i += 1) sim.step(0);
  assert.equal(sim.status, "win");
  assert.equal(sim.score, 3);
});

test("templates.three_d_games_valid_and_deterministic", () => {
  for (const g of [shooterGraph(), groveGraph(), hurdleGraph()]) {
    assert.ok(parseGraph(g).ok, g.title);
    const inputs: Array<[number, number]> = [[5, bit("KeyW")], [30, 0], [40, bit("Space")], [41, 0]];
    assert.equal(JSON.stringify(runGraph(g, 9, inputs, 600)), JSON.stringify(runGraph(g, 9, inputs, 600)));
  }
});
