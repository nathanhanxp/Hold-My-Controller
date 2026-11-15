import { test } from "node:test";
import assert from "node:assert/strict";
import { graphHash, parseGraph, runGraph, seedLibrary, shooterGraph, groveGraph, hurdleGraph, KEYS } from "@forklab/engine";
import { addBlock, deleteFrom, graphToScripts, moveBlocks, plug, scriptsToGraph } from "../components/blocks/model";

const lib = seedLibrary();
const all = [lib.jump.graph, lib.dodge.graph, lib.collect.graph, shooterGraph(), groveGraph(), hurdleGraph()];
const SPACE = 1 << KEYS.indexOf("Space");

test("blocks.roundtrip_keeps_hash_and_behaviour", () => {
  for (const g of all) {
    const back = scriptsToGraph(g, graphToScripts(g));
    assert.ok(parseGraph(back).ok, g.title);
    assert.equal(graphHash(back), graphHash(g), `${g.title}: blocks view is lossless`);
    const inputs: Array<[number, number]> = [[10, SPACE], [11, 0], [80, SPACE], [81, 0]];
    assert.equal(JSON.stringify(runGraph(back, 4, inputs, 600)), JSON.stringify(runGraph(g, 4, inputs, 600)));
  }
});

test("blocks.add_move_delete_plug", () => {
  let g = lib.jump.graph;
  const hat = g.nodes.find((n) => n.type === "OnStart")!.id;
  const a = addBlock(g, "AddScore", "ana", { kind: "top", hatId: hat });
  g = a.graph;
  assert.ok(g.edges.some((e) => e.from.node === hat && e.to.node === a.id), "inserted right under the hat");
  assert.ok(parseGraph(g).ok);
  const r = addBlock(g, "Random", "ana", { kind: "loose", x: 10, y: 10 });
  g = plug(r.graph, r.id, a.id, "n");
  assert.ok(g.edges.some((e) => e.kind === "data" && e.from.node === r.id && e.to.node === a.id && e.to.port === "n"));
  const loose = moveBlocks(g, a.id, { kind: "loose", x: 300, y: 300 });
  assert.ok(!loose.edges.some((e) => e.kind === "exec" && e.to.node === a.id), "dragged out of the stack");
  const gone = deleteFrom(loose, a.id);
  assert.ok(!gone.nodes.some((n) => n.id === a.id || n.id === r.id), "block and its reporter removed");
  assert.ok(parseGraph(gone).ok);
});

test("blocks.if_continues_after_branches", () => {
  let g = lib.jump.graph;
  const hat = g.nodes.find((n) => n.type === "OnStart")!.id;
  const iff = addBlock(g, "Branch", "ana", { kind: "top", hatId: hat });
  g = iff.graph;
  const after = addBlock(g, "AddScore", "ana", { kind: "after", blockId: iff.id });
  g = after.graph;
  assert.ok(g.edges.some((e) => e.from.node === iff.id && e.from.port === "out" && e.to.node === after.id));
});
