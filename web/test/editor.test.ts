import { test } from "node:test";
import assert from "node:assert/strict";
import { dodgeGraph, graphHash, jumpGraph, platformerGraph, shooterGraph } from "@forklab/engine";
import { controlsOf } from "../components/GamePreview";
import { proposalToGraph } from "../lib/ai/proposal";
import { layoutGraph } from "../components/editor/layout";

test("controls.hint_comes_from_the_graph", () => {
  assert.equal(controlsOf([shooterGraph()]), "WASD move · Space fire");
  assert.match(controlsOf([dodgeGraph(graphHash(jumpGraph()))]), /^Space /);
  assert.ok(!/WASD/.test(controlsOf([jumpGraph()])), "one-key games do not claim WASD");
  assert.equal(controlsOf([jumpGraph()]), "Space jump", "looks through the grounded check to the jump");
  assert.match(controlsOf([platformerGraph()]), /Arrows move/);
});

test("proposal.theme_and_view_apply", () => {
  const cur = shooterGraph();
  const p = { title: cur.title, tags: [], explanation: "", theme: { sky: "#110022", ground: "#334455", accent: "#ff00aa" }, view: "2d" as const, nodes: cur.nodes.map((n) => ({ id: n.id, type: n.type, params: n.params })), edges: cur.edges };
  const { graph } = proposalToGraph(p, "ana", cur, []);
  assert.deepEqual(graph.theme, p.theme, "a proposal's theme replaces the current one");
  assert.equal(graph.view, "2d");
  const { graph: kept } = proposalToGraph({ ...p, theme: undefined, view: undefined }, "ana", cur, []);
  assert.deepEqual(kept.theme, cur.theme, "no theme in the proposal keeps the current theme");
});

test("layout.packs_chains_into_columns", () => {
  const g = layoutGraph(platformerGraph());
  const xs = new Set(g.nodes.map((n) => n.pos!.x));
  const ys = g.nodes.map((n) => n.pos!.y);
  assert.ok(Math.max(...ys) < 3000, "not one tall column");
  assert.ok(xs.size > 4);
  const seen = new Set(g.nodes.map((n) => `${n.pos!.x},${n.pos!.y}`));
  assert.equal(seen.size, g.nodes.length, "no two nodes share a spot");
});

test("blocks.links_connect_spawns_to_their_collisions", async () => {
  const { scriptLinks } = await import("../components/blocks/Blocks");
  const g = shooterGraph();
  const links = scriptLinks(g);
  const spawnRaider = g.nodes.find((n) => n.type === "Spawn" && n.params.prefab === "raider")!;
  const hitEnemy = g.nodes.filter((n) => n.type === "OnCollide" && (n.params.tagA === "enemy" || n.params.tagB === "enemy")).map((n) => n.id);
  assert.ok(links.some((l) => l.from === spawnRaider.id && hitEnemy.includes(l.to)), "raider spawner links to the enemy collision");
  assert.ok(!links.some((l) => l.label.startsWith("player")), "no lines for the player");
});

test("ai.explain_falls_back_to_plain_words", async () => {
  const { explainEdit } = await import("../lib/ai/service");
  const offline = { generate: async (r: { local: () => unknown }) => ({ value: r.local(), provider: "local", attempts: [] }) };
  const r = await explainEdit(offline as never, { action: "disconnect", what: "x", affected: ["Move (player, left)"] });
  assert.match(r.text, /Move \(player, left\) no longer runs/);
});

test("proposal.custom_prefabs_and_scene_pass_through", () => {
  const cur = shooterGraph();
  const p = {
    title: cur.title, tags: [], explanation: "",
    prefabs: { "Fire Ball": { tag: "Hazard", w: 400, h: 400, vx: 0, vy: 0, color: "nope" } },
    scene: { preset: "forest" as const, props: [{ model: "tree" as const, x: -2000, z: 3000 }], hud: { score: "top-right" as const } },
    nodes: cur.nodes.map((n) => ({ id: n.id, type: n.type, params: n.params })), edges: cur.edges,
  };
  const { graph } = proposalToGraph(p, "ana", cur, []);
  assert.deepEqual(Object.keys(graph.prefabs!), ["fire-ball"], "names are cleaned to valid ids");
  assert.equal(graph.prefabs!["fire-ball"].tag, "hazard");
  assert.equal(graph.prefabs!["fire-ball"].color, "#9aa4b2", "a bad colour falls back");
  assert.equal(graph.scene!.preset, "forest");
  assert.equal(graph.scene!.props![0].model, "tree");
  const { graph: kept } = proposalToGraph({ ...p, prefabs: undefined, scene: undefined }, "ana", { ...cur, scene: { preset: "city" } }, []);
  assert.equal(kept.scene!.preset, "city", "no scene in the answer keeps the current scene");
});
