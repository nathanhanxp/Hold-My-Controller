import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonical, compile, overlaps, makeEntity, BUILTIN_PREFABS, runGraph, SeededRng, Sim, seedLibrary, ex, type Graph } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));

test("rng.streams_independent_of_order", () => {
  const a = new SeededRng(42);
  const x1 = [a.stream("x").nextUint32(), a.stream("x").nextUint32()];
  const y1 = a.stream("y").nextUint32();
  const b = new SeededRng(42);
  const y2 = b.stream("y").nextUint32();
  const x2 = [b.stream("x").nextUint32(), b.stream("x").nextUint32()];
  assert.deepEqual(x1, x2);
  assert.equal(y1, y2);
  const r = new SeededRng(7).stream("r");
  for (let i = 0; i < 200; i += 1) {
    const v = r.nextInt(3, 9);
    assert.ok(v >= 3 && v < 9 && Number.isInteger(v));
  }
});

test("world.aabb_collision", () => {
  const p = makeEntity(1, "player", BUILTIN_PREFABS.player, 0, 0);
  const touching = makeEntity(2, "rock", BUILTIN_PREFABS.rock, 600, 0);
  const inside = makeEntity(3, "rock", BUILTIN_PREFABS.rock, 599, 599);
  assert.equal(overlaps(p, touching), false, "edges touching do not overlap");
  assert.equal(overlaps(p, inside), true);
});

test("interpret.event_order", () => {
  // OnStart sets var then OnKey then OnTick; collisions after integrate; spawns applied at end of tick.
  const g: Graph = {
    schema: "forklab.graph.v1", parent: null, root: "", kind: "mechanic", sources: [], title: "order", tags: [], license: { type: "free" },
    nodes: [
      { id: "a1", type: "OnStart", params: {}, authorId: "t", originFork: "" },
      { id: "a2", type: "Spawn", params: { prefab: "player", x: 0, y: 0 }, authorId: "t", originFork: "" },
      { id: "a3", type: "AddScore", params: { n: 1 }, authorId: "t", originFork: "" },
      { id: "b1", type: "OnTick", params: { everyN: 1 }, authorId: "t", originFork: "" },
      { id: "b2", type: "AddScore", params: { n: 10 }, authorId: "t", originFork: "" },
      { id: "c1", type: "OnKey", params: { key: "Space", when: "press" }, authorId: "t", originFork: "" },
      { id: "c2", type: "AddScore", params: { n: 100 }, authorId: "t", originFork: "" },
    ],
    edges: [ex("a1", "a2"), ex("a2", "a3"), ex("b1", "b2"), ex("c1", "c2")],
  };
  const sim = new Sim([compile(g)], 1);
  sim.step(1);
  assert.equal(sim.score, 111);
  assert.equal(sim.entities.length, 1, "spawn applied at end of tick 0");
  sim.step(1); // held, not a new press
  assert.equal(sim.score, 121);
  sim.step(0);
  sim.step(1);
  assert.equal(sim.score, 241);
});

function golden(name: string, graph: Graph) {
  const input = JSON.parse(readFileSync(join(here, "..", "golden", `${name}.input.json`), "utf8"));
  const file = join(here, "..", "golden", `${name}.snapshots.json`);
  assert.ok(existsSync(file), `missing golden ${file}; run npm run golden -w engine`);
  const expected = JSON.parse(readFileSync(file, "utf8"));
  const actual = runGraph(graph, input.seed, input.inputs, input.ticks, 60);
  assert.equal(canonical(actual), canonical(expected));
  // determinism: a second run is byte-identical
  assert.equal(canonical(runGraph(graph, input.seed, input.inputs, input.ticks, 60)), canonical(actual));
}

const lib = seedLibrary();
test("golden.jump", () => golden("jump", lib.jump.graph));
test("golden.dodge", () => golden("dodge", lib.dodge.graph));
test("golden.collect", () => golden("collect", lib.collect.graph));

test("fixed.no_floats_in_state", () => {
  const snaps = runGraph(lib.collect.graph, 99, [[0, 1], [30, 0], [60, 1], [61, 0]], 900, 30);
  for (const s of snaps) for (const e of s.entities) for (const v of [e.x, e.y, e.vx, e.vy]) assert.ok(Number.isInteger(v) && Math.abs(v) <= 2 ** 31 - 1);
});
