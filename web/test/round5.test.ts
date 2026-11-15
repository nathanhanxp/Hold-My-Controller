import { test } from "node:test";
import assert from "node:assert/strict";
import { aimAt, compile, isqrt, Sim, GRAPH_SCHEMA, type Graph } from "@forklab/engine";
import { honourIntent } from "../lib/ai/service";
import { splitColors } from "../lib/colors";

const n = (id: string, type: Graph["nodes"][number]["type"], params: Record<string, unknown>) => ({ id, type, params, authorId: "t", originFork: "", pos: { x: 0, y: 0 } }) as Graph["nodes"][number];
const ex = (a: string, b: string, port = "out") => ({ from: { node: a, port }, to: { node: b, port: "in" }, kind: "exec" as const });
const dx = (a: string, b: string, port: string) => ({ from: { node: a, port: "out" }, to: { node: b, port }, kind: "data" as const });

test("engine.isqrt_and_aim_at_the_player", () => {
  assert.equal(isqrt(0), 0); assert.equal(isqrt(15), 3); assert.equal(isqrt(16), 4); assert.equal(isqrt(512_000_000), 22627);
  const me = { id: 2, tag: "raider", x: 0, z: 0, w: 600, d: 600 };
  const [vx, vy, vz] = aimAt(me, [me, { id: 1, tag: "player", x: 3000, z: 4000, w: 600, d: 600 }], 100);
  assert.deepEqual([vx, vy, vz], [60, 0, 80]);
});

test("engine.hearts_count_down_and_lose_at_zero", () => {
  const g: Graph = {
    schema: GRAPH_SCHEMA, parent: null, root: "", kind: "mechanic", sources: [], title: "Hearts", tags: [], license: { type: "free" },
    nodes: [
      n("a", "OnStart", {}), n("b", "SetVar", { name: "hp", value: 3 }), n("p", "Spawn", { prefab: "player", x: 8000, y: 0 }),
      n("t", "OnTick", { everyN: 30 }), n("s", "SetVar", { name: "hp", value: 0 }), n("c", "Compare", { op: "sub", a: 0, b: 1 }), n("g", "GetVar", { name: "hp" }),
      n("t2", "OnTick", { everyN: 1 }), n("br", "Branch", {}), n("le", "Compare", { op: "le", a: 0, b: 0 }), n("g2", "GetVar", { name: "hp" }), n("l", "Lose", {}),
    ],
    edges: [ex("a", "b"), ex("b", "p"), ex("t", "s"), dx("c", "s", "value"), dx("g", "c", "a"), ex("t2", "br"), dx("le", "br", "cond"), dx("g2", "le", "a"), ex("br", "l", "true")],
  };
  const sim = new Sim([compile(g)], 1);
  let t = 0;
  while (sim.status === "running" && t < 400) { sim.step(0); t += 1; }
  assert.equal(sim.status, "lose");
  assert.ok(t >= 59 && t <= 62, `lost after three hits, at tick ${t}`);
});

test("ai.intent_shoot_at_me_and_hearts_on_screen", () => {
  const g = { nodes: [n("s", "Shoot", { prefab: "fireball", from: "raider", direction: "forward", speed: 200 }), n("h", "SetVar", { name: "hp", value: 5 }), n("p", "Shoot", { prefab: "bolt", from: "player", direction: "facing", speed: 300 })], edges: [], scene: {} } as unknown as Graph;
  honourIntent("add mobs shooting u and 5 heart system", g);
  assert.equal(g.nodes[0].params.direction, "at_player");
  assert.equal(g.nodes[2].params.direction, "facing", "the player's own shots are untouched");
  assert.equal(g.scene?.hud?.hearts, "hp");
  assert.equal(g.scene?.hud?.heartsMax, 5);
});

test("colors.no_two_people_in_a_split_share_a_colour", () => {
  const c = splitColors(["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.equal(new Set(c.values()).size, 8);
});

test("tokens.one_token_is_a_millionth_of_a_sol_on_chain", async () => {
  const { chainLamports, unitsFromChain } = await import("../lib/solana");
  assert.equal(chainLamports(1_000_000), 1_000, "1 token -> 1,000 lamports = 0.000001 SOL");
  assert.equal(chainLamports(200_000_000), 200_000, "the 200-token weekly pool -> 0.0002 SOL");
  assert.equal(unitsFromChain(1_000), 1_000_000);
});
