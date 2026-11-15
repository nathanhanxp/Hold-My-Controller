import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRule, seedLibrary, ex, dx, type Graph } from "../src/index";

const lib = seedLibrary();

test("rule.one_key_one_key", () => {
  assert.equal(checkRule("one_key", lib.dodge.graph).ok, true);
  const two = structuredClone(lib.dodge.graph);
  two.nodes.push({ id: "k2", type: "OnKey", params: { key: "ArrowLeft", when: "held" }, authorId: "ana", originFork: "" });
  const r = checkRule("one_key", two);
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /Found 2 keys: ArrowLeft, Space/);
});

function sacredGraph(withLose: boolean): Graph {
  const g = structuredClone(lib.dodge.graph);
  g.nodes.push({ id: "s1", type: "OnCollide", params: { tagA: "player", tagB: "sacred" }, authorId: "ana", originFork: "" });
  if (withLose) {
    g.nodes.push({ id: "s2", type: "Lose", params: {}, authorId: "ana", originFork: "" });
    g.edges.push(ex("s1", "s2"));
  }
  return g;
}

test("rule.sacred_requires_lose_path", () => {
  assert.equal(checkRule("sacred", sacredGraph(false)).ok, false);
  assert.equal(checkRule("sacred", sacredGraph(true)).ok, true);
});

test("rule.ignores_dead_nodes", () => {
  // a Lose node connected only from a dead (non-event) chain does not count
  const g = structuredClone(lib.dodge.graph);
  g.nodes.push(
    { id: "z1", type: "Branch", params: {}, authorId: "ana", originFork: "" },
    { id: "z2", type: "Lose", params: {}, authorId: "ana", originFork: "" },
    { id: "z3", type: "OnKey", params: { key: "KeyW" }, authorId: "ana", originFork: "" },
  );
  g.edges.push(ex("z1", "z2", "true"));
  assert.equal(checkRule("sacred", g).ok, false);
  // an OnKey is an event so it is counted even without edges: one_key now fails
  assert.equal(checkRule("one_key", g).ok, false);
  // but a dead OnCollide(player, sacred) path does count only through counted nodes
  const g2 = sacredGraph(false);
  g2.nodes.push({ id: "s9", type: "Lose", params: {}, authorId: "ana", originFork: "" }, { id: "s8", type: "Branch", params: {}, authorId: "ana", originFork: "" });
  g2.edges.push(ex("s8", "s9", "true"));
  assert.equal(checkRule("sacred", g2).ok, false);
});

test("rule.wind_needs_random_on_tick", () => {
  const g = structuredClone(lib.dodge.graph);
  assert.equal(checkRule("wind", g).ok, false);
  g.nodes.push(
    { id: "w1", type: "OnTick", params: { everyN: 30 }, authorId: "ana", originFork: "" },
    { id: "w2", type: "AddVelocity", params: { entity: "player", vx: 0, vy: 0 }, authorId: "ana", originFork: "" },
    { id: "w3", type: "Random", params: { min: -20, max: 20, stream: "wind" }, authorId: "ana", originFork: "" },
  );
  g.edges.push(ex("w1", "w2"), dx("w3", "w2", "vx"));
  assert.equal(checkRule("wind", g).ok, true);
});
