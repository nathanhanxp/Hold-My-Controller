import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyGraph, parseGraph, compile, Sim } from "@forklab/engine";
import { combine } from "../components/editor/combine";
import { seeded, deps } from "./helpers";
import { seedExtras } from "../lib/store/seed";
import { publishGraph } from "../lib/services/publish";
import { describeGraph } from "../lib/services/describe";
import { embedNow } from "./helpers";

test("combine.two_games_a_thing_and_a_look_credit_everyone", async () => {
  const s = await seeded();
  await seedExtras(s, "mock", embedNow, describeGraph);
  const all = await s.listGraphs({ limit: 1000 });
  const sky = all.find((g) => g.title === "Sky patrol")!;
  const arena = all.find((g) => g.title === "Arena shooter")!;
  const start = { ...emptyGraph("newbie"), title: "Mash-up" };
  const { graph, lines } = combine(start, [{ hash: sky._id, title: sky.title, graph: sky.graph }, { hash: arena._id, title: arena.title, graph: arena.graph }],
    [{ title: "Gold drachma", prefab: { tag: "coin", w: 300, h: 300, d: 300, vx: 0, vy: 0, color: "#B3862A" } }], { sky: "#101820", ground: "#556070", accent: "#f2a33a" }, "newbie");
  assert.ok(parseGraph(graph).ok, "the combined game is valid");
  assert.equal(lines.length, 4);
  assert.match(lines[1], /player spawn left out/, "only one player");
  assert.equal(graph.nodes.filter((n) => n.type === "Spawn" && (n.params.prefab === "player" || n.params.prefab === "plane")).length, 1);
  assert.deepEqual(graph.sources, [sky._id, arena._id].sort());
  assert.equal(graph.theme?.ground, "#556070");
  assert.ok(graph.prefabs?.gold_drachma);
  // it runs
  const sim = new Sim([compile(graph)], 2, graph.prefabs ?? {});
  sim.step(0);
  assert.ok(sim.entities.some((e) => e.tag === "coin"), "the added thing is in the game from the first moment");
  for (let t = 0; t < 300 && sim.status === "running"; t++) sim.step(0);
  // publishing credits the borrowed creators
  const doc = await publishGraph(deps(s), { draft: graph, author: "newbie" });
  const who = doc.shares.map((x) => x.handle).sort();
  for (const h of ["kai", "lena", "mira", "rhea"]) assert.ok(who.includes(h), `${h} is credited (${who.join(", ")})`);
});

test("combine.things_alone_appear_in_an_empty_new_game", () => {
  const start = { ...emptyGraph("newbie"), title: "Blank" };
  const { graph } = combine(start, [], [{ title: "Boulder", prefab: { tag: "rock", w: 1000, h: 1000, d: 1000, vx: 0, vy: -60, color: "#3B3530" } }, { title: "Gold drachma", prefab: { tag: "coin", w: 300, h: 300, d: 300, vx: 0, vy: 0, color: "#B3862A" } }], null, "newbie");
  assert.ok(parseGraph(graph).ok);
  const sim = new Sim([compile(graph)], 1, graph.prefabs ?? {});
  sim.step(0);
  assert.deepEqual(sim.entities.map((e) => e.tag).sort(), ["coin", "rock"]);
  assert.ok(sim.entities.find((e) => e.tag === "rock")!.y > 5000, "a falling thing starts high");
});
