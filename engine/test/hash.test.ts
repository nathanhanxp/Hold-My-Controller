import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, graphHash, jumpGraph } from "../src/index";

test("hash.canonical_stable", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: true, c: "x" }] }), '{"a":[2,{"c":"x","d":true}],"b":1}');
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.throws(() => canonical({ a: 1.5 }));
});

test("hash.graph_changes_with_author", () => {
  const g = jumpGraph();
  const h1 = graphHash(g);
  const g2 = structuredClone(g);
  g2.nodes[0].authorId = "someone";
  assert.notEqual(graphHash(g2), h1);
  const g3 = structuredClone(g);
  g3.title = "Another title";
  g3.nodes[0].pos = { x: 999, y: 1 };
  assert.equal(graphHash(g3), h1, "title and positions are not part of the hash");
});
