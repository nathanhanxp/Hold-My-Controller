import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAuthorship, computeShares, countedNodes, diffGraphs, forkGraph, jumpGraph, graphHash, seedLibrary, dx, ex, type Graph } from "../src/index";

const sum = (s: { bps: number }[]) => s.reduce((a, b) => a + b.bps, 0);

test("attribution.sums_to_10000", () => {
  const { jump, dodge, collect } = seedLibrary();
  for (const h of [jump, dodge, collect]) assert.equal(sum(computeShares(h.graph, [])), 10_000);
  // two forks that change different nodes
  const fa = forkGraph(jump.graph, jump.hash);
  fa.nodes.push({ id: "x1", type: "OnTick", params: { everyN: 3 }, authorId: "ana", originFork: "" }, { id: "x2", type: "AddScore", params: { n: 2 }, authorId: "ana", originFork: "" });
  fa.edges.push(ex("x1", "x2"));
  const fb = forkGraph(jump.graph, jump.hash);
  fb.edges = fb.edges.filter((e) => !(e.to.node === "n05" && e.kind === "data"));
  fb.nodes.push({ id: "y1", type: "Const", params: { value: 1 }, authorId: "theo", originFork: "" });
  fb.edges.push(dx("y1", "n05", "cond"));
  const a = applyAuthorship(jump, fa, "ana");
  const b = applyAuthorship(jump, fb, "theo");
  assert.equal(sum(computeShares(a, [jump.hash])), 10_000);
  assert.equal(sum(computeShares(b, [jump.hash])), 10_000);
  assert.equal(b.nodes.find((n) => n.id === "n05")!.authorId, "theo", "rewired node changes author");
});

test("attribution.param_tweak_keeps_author", () => {
  const { jump } = seedLibrary();
  const f = forkGraph(jump.graph, jump.hash);
  f.nodes.find((n) => n.id === "n07")!.params.vy = 400;
  const out = applyAuthorship(jump, f, "theo");
  const n = out.nodes.find((x) => x.id === "n07")!;
  assert.equal(n.authorId, "mira");
  assert.equal(n.originFork, jump.hash);
  assert.deepEqual(computeShares(out, [jump.hash]).map((s) => s.handle), ["mira"]);
});

test("attribution.dead_nodes_ignored", () => {
  const g = jumpGraph();
  const before = computeShares(g);
  const dead: Graph = structuredClone(g);
  for (let i = 0; i < 20; i += 1) dead.nodes.push({ id: `d${i}`, type: "AddScore", params: { n: 1 }, authorId: "spam", originFork: "" });
  assert.ok(!countedNodes(dead).has("d0"));
  assert.deepEqual(computeShares(dead), before);
});

test("attribution.remainder_to_first_author", () => {
  // 3 authors with one counted node each: floor(10000/3) = 3333 each, remainder 1 to the first.
  const g: Graph = {
    schema: "forklab.graph.v1", parent: null, root: "", kind: "mechanic", sources: [], title: "t", tags: [], license: { type: "free" },
    nodes: [
      { id: "a", type: "OnStart", params: {}, authorId: "first", originFork: "" },
      { id: "b", type: "AddScore", params: {}, authorId: "second", originFork: "" },
      { id: "c", type: "AddScore", params: {}, authorId: "third", originFork: "" },
    ],
    edges: [ex("a", "b"), ex("b", "c")],
  };
  const s = computeShares(g);
  assert.deepEqual(s.map((x) => x.bps), [3334, 3333, 3333]);
  assert.equal(s[0].handle, "first");
});

test("attribution.lineage_orders_root_author_first", () => {
  const { jump, dodge, collect } = seedLibrary();
  const s = computeShares(collect.graph, [jump.hash, dodge.hash]);
  assert.deepEqual(s.map((x) => x.handle), ["mira", "theo", "ana"]);
  assert.equal(graphHash(collect.graph), collect.hash);
});

test("diff.added_removed_changed", () => {
  const { jump, dodge } = seedLibrary();
  const d = diffGraphs(jump.graph, dodge.graph);
  assert.ok(d.added.some((x) => x.id === "n12"));
  assert.ok(d.removed.some((x) => x.id === "n04"));
  assert.ok(d.changed.some((x) => x.id === "n02" && x.change === "params"));
  assert.ok(d.changed.some((x) => x.id === "n11" && x.change === "structure"));
});

test("attribution.controls_and_setup_earn_nothing", async () => {
  const { earningNodes, countedNodes, computeShares, skyStages, shooterGraph } = await import("../src/index");
  const sky = skyStages()[2];
  const earn = earningNodes(sky);
  // lena's WASD stacks and the plane spawn run but don't earn; her drones and the crash rule do
  for (const id of ["k1", "k2", "k3", "k4", "k13", "k16", "p02"]) assert.ok(countedNodes(sky).has(id) && !earn.has(id), `${id} is a control or setup`);
  for (const id of ["p20", "p21", "p22", "p50", "p51", "p10", "p11", "p30", "p26", "p40"]) assert.ok(earn.has(id), `${id} earns`);
  const shares = Object.fromEntries(computeShares(sky).map((s) => [s.handle, s.bps]));
  assert.ok(shares.lena < shares.kai, "copying WASD doesn't outweigh real mechanics");
  // a game that is nothing but controls still credits its author
  const only = { ...shooterGraph(), nodes: shooterGraph().nodes.filter((n) => n.id.startsWith("m") || n.id === "s01" || n.id === "s02"), edges: shooterGraph().edges.filter((e) => [e.from.node, e.to.node].every((x) => x.startsWith("m") || x === "s01" || x === "s02")) };
  assert.deepEqual(computeShares(only).map((s) => s.handle), ["rhea"]);
});
