import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, Sim, compile, graphHash, graphSchema, parseGraph, platformerGraph, starterGraph } from "../src/index";

const bit = (k: string) => 1 << KEYS.indexOf(k as (typeof KEYS)[number]);

test("two_d.platformer_runs_jumps_and_lands", () => {
  const g = platformerGraph();
  assert.equal(g.view, "2d");
  assert.ok(parseGraph(g).ok);
  const sim = new Sim([compile(g)], 1, {});
  const start = sim.entities.length ? sim.entities[0].x : 0;
  let maxY = 0;
  for (let t = 0; t < 40; t += 1) {
    sim.step(bit("KeyD") | (t === 2 ? bit("Space") : 0));
    const p = sim.entities.find((e) => e.tag === "player");
    if (p) maxY = Math.max(maxY, p.y);
  }
  const p = sim.entities.find((e) => e.tag === "player")!;
  assert.ok(p.x > start + 2000, "D runs right");
  assert.ok(maxY > 1500, "Space jumps");
  assert.equal(p.z, 7700, "2D keeps everything on one depth");
});

test("two_d.view_is_presentation_only", () => {
  const g = platformerGraph();
  assert.equal(graphHash(g), graphHash({ ...g, view: "3d" }), "view does not change the content hash");
  assert.equal(graphSchema.parse(g).view, "2d", "the schema keeps view");
});

test("two_d.starter_graphs_are_valid", () => {
  for (const v of ["2d", "3d"] as const) {
    const g = starterGraph(v, "ana");
    assert.ok(parseGraph(g).ok, v);
    assert.equal(g.view, v);
    assert.ok(g.nodes.every((n) => n.authorId === "ana"));
  }
});
