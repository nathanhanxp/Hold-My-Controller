import { test } from "node:test";
import assert from "node:assert/strict";
import { cosine, structureVector, seedLibrary, STRUCTURE_DIM } from "../src/index";

const lib = seedLibrary();

test("structure.stable_length", () => {
  for (const g of [lib.jump.graph, lib.dodge.graph, lib.collect.graph, ...lib.levels.map((l) => l.graph)]) {
    const v = structureVector(g);
    assert.equal(v.length, STRUCTURE_DIM);
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  }
});

test("structure.ignores_dead_nodes", () => {
  const g = structuredClone(lib.jump.graph);
  g.nodes.push({ id: "dead", type: "Random", params: {}, authorId: "x", originFork: "" });
  assert.deepEqual(structureVector(g), structureVector(lib.jump.graph));
});

test("structure.similar_graphs_closer", () => {
  const d = structureVector(lib.dodge.graph);
  const c = structureVector(lib.collect.graph);
  const gauntlet = structureVector(lib.levels[1].graph);
  assert.ok(cosine(d, c) > cosine(d, gauntlet));
});
