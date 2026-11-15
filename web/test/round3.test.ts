import { test } from "node:test";
import assert from "node:assert/strict";
import { shooterGraph, unityProjectFiles, graphHash, viewOf, parseGraph, dodgeGraph, jumpGraph } from "@forklab/engine";
import { describeChange } from "../components/editor/changes";
import { seeded } from "./helpers";
import { buyPlan, tokenAccount, PLANS } from "../lib/services/tokens";
import { finalistsFor, fits, FINALISTS } from "../lib/services/finalists";
import { words } from "../lib/services/modelsearch";

test("changes.disconnect_and_connect_are_described", () => {
  const g = shooterGraph();
  const e = g.edges.find((x) => x.kind === "exec")!;
  const cut = { ...g, edges: g.edges.filter((x) => x !== e) };
  const d = describeChange(g, cut)!;
  assert.equal(d.kind, "disconnect");
  assert.ok(d.stops.length >= 1, "says what stops running");
  const back = describeChange(cut, g)!;
  assert.equal(back.kind, "connect");
  assert.match(back.lines[0], /will run/);
  assert.equal(describeChange(g, { ...g, title: "renamed" }), null, "no wiring change, no question");
});

test("tokens.grant_spend_and_plan", async () => {
  const s = await seeded();
  const a = await tokenAccount(s, "newbie");
  assert.equal(a.tokens, 500);
  assert.equal(a.plan.tier, "standard");
  const b = await buyPlan(s, "newbie", "pro");
  assert.equal(b.tokens, 500 - PLANS.pro.tokens);
  assert.equal(b.plan.tier, "pro");
  await assert.rejects(buyPlan(s, "newbie", "max"), /need 400 tokens/);
});

test("finalists.five_that_fit_with_a_rising_pick", async () => {
  const s = await seeded();
  const f = await finalistsFor(s, "mechanic");
  assert.ok(f.length <= FINALISTS && f.length > 0);
  assert.ok(f.filter((x) => x.why === "rising").length <= 1);
  // every finalist runs on the reference level (this week's game, or the most played level)
  const { referenceLevel } = await import("../lib/services/finalists");
  const ref = await referenceLevel(s);
  if (ref) for (const m of f) assert.ok(fits(ref.graph, (m as unknown as { graph: import("@forklab/engine").Graph }).graph), `${(m as { title: string }).title} fits`);
});

test("view.null_or_capitals_are_tolerated", () => {
  const g = { ...dodgeGraph(graphHash(jumpGraph())), view: null as unknown as "2d" };
  assert.ok(parseGraph(g).ok, "a null view is treated as unset");
  assert.equal(viewOf({ ...g, view: undefined }), "2d", "one-key side games default to 2D");
});

test("modelsearch.words_drop_filler", () => {
  assert.deepEqual(words("make it a spooky forest with dead trees"), ["spooky", "forest", "dead", "tree"]);
});

test("unity.export_carries_the_scene_plan", () => {
  const g = shooterGraph();
  const files = unityProjectFiles(g, graphHash(g), {}, { plan: { looks: { player: { file: "hero", scale: 1.5, box: false } }, props: [{ file: "tree", x: 100, y: 0, z: -2000, height: 4.2, rotate: 30 }], hud: { score: "top-right" }, sea: false } });
  const game = Object.entries(files).find(([p]) => p.endsWith("ForkLabGame.cs"))![1];
  assert.match(game, /new Look\("hero"/);
  assert.match(game, /new PropSpec\("tree", 100, 0, -2000/);
  assert.match(game, /HudScore = "top-right"/);
  assert.match(game, /latched/, "quick taps are latched between ticks");
});
