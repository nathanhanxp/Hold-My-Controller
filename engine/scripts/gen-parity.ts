// Generates the C# sources for the parity harness from the three golden mechanics.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { KEYS, coreSource, graphHash, groveGraph, hurdleGraph, mechanicSource, platformerGraph, runGraph, seedLibrary, shooterGraph, siegeGraph, type Graph } from "../src/index";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "csharp-parity", "Generated");
mkdirSync(out, { recursive: true });
const lib = seedLibrary();
// the core carries every custom prefab used by the parity games
writeFileSync(join(out, "ForkLabCore.cs"), coreSource({ ...(siegeGraph().prefabs ?? {}), ...(gunnersGraph().prefabs ?? {}) }));
for (const [name, h] of [["Jump", lib.jump], ["Dodge", lib.dodge], ["Collect", lib.collect]] as const) {
  writeFileSync(join(out, `Mechanic_${name}.cs`), mechanicSource(h.graph, h.hash, `Mechanic_${name}`));
}
/** Arena shooter where raiders shoot fireballs at the player and the player has 5 hearts (aimed shots, Compare sub). */
function gunnersGraph(): Graph {
  const g = shooterGraph();
  const node = (id: string, type: Graph["nodes"][number]["type"], params: Record<string, unknown>) => ({ id, type, params, authorId: "rhea", originFork: "", pos: { x: 0, y: 0 } }) as Graph["nodes"][number];
  g.title = "Gunners";
  g.prefabs = { flare: { tag: "hazard", w: 400, h: 400, d: 400, vx: 0, vy: 0, vz: 0, color: "#ff7a3a" } };
  g.nodes.push(
    node("q1", "OnStart", {}), node("q2", "SetVar", { name: "hp", value: 5 }),
    node("q3", "OnTick", { everyN: 45 }), node("q4", "Shoot", { prefab: "flare", from: "raider", direction: "at_player", speed: 160 }),
    node("q5", "OnCollide", { tagA: "player", tagB: "hazard" }), node("q6", "SetVar", { name: "hp", value: 0 }), node("q7", "Compare", { op: "sub", a: 0, b: 1 }), node("q8", "GetVar", { name: "hp" }), node("q9", "Destroy", { entity: "b" }),
    node("r1", "OnTick", { everyN: 1 }), node("r2", "Branch", {}), node("r3", "Compare", { op: "le", a: 0, b: 0 }), node("r4", "GetVar", { name: "hp" }), node("r5", "Lose", {}),
  );
  const e = (a: string, b: string, port = "out") => ({ from: { node: a, port }, to: { node: b, port: "in" }, kind: "exec" as const });
  const d = (a: string, b: string, port: string) => ({ from: { node: a, port: "out" }, to: { node: b, port }, kind: "data" as const });
  g.edges.push(e("q1", "q2"), e("q3", "q4"), e("q5", "q6"), d("q7", "q6", "value"), d("q8", "q7", "a"), e("q6", "q9"), e("r1", "r2"), d("r3", "r2", "cond"), d("r4", "r3", "a"), e("r2", "r5", "true"));
  return g;
}

// 3D and 2D games: the TypeScript engine writes the expected snapshots here, C# must match them exactly
const k = (name: string) => 1 << KEYS.indexOf(name as (typeof KEYS)[number]);
const W = k("KeyW"), A = k("KeyA"), S = k("KeyS"), D = k("KeyD"), SP = k("Space"), L = k("ArrowLeft"), R = k("ArrowRight");
const extra = {
  shooter: { graph: shooterGraph(), seed: 4, ticks: 900, inputs: [[10, W], [60, W | SP], [62, W], [120, D], [180, D | SP], [182, 0], [240, A | S], [300, SP], [302, 0], [420, W | A], [480, SP], [481, 0]] },
  grove: { graph: groveGraph(), seed: 5, ticks: 900, inputs: [[5, D], [90, D | W], [180, A], [181, A | SP], [183, A], [260, S], [340, 0], [400, W | D], [520, 0]] },
  hurdle: { graph: hurdleGraph(), seed: 6, ticks: 900, inputs: [[20, A], [70, A | SP], [72, A], [130, D], [200, D | SP], [202, D], [300, 0], [360, SP], [362, 0]] },
  siege: { graph: siegeGraph(), seed: 8, ticks: 900, inputs: [[10, W], [60, W | SP], [62, W], [150, D | SP], [152, D], [260, A], [400, 0]] },
  gunners: { graph: gunnersGraph(), seed: 9, ticks: 900, inputs: [[10, A], [80, A | SP], [82, A], [160, D], [260, D | SP], [262, 0], [400, W], [520, 0]] },
  ledges: { graph: platformerGraph(), seed: 7, ticks: 900, inputs: [[5, D], [30, D | SP], [32, D], [90, R], [120, R | SP], [122, R], [200, L], [260, 0], [300, SP], [302, 0]] },
} as const;
for (const [name, c] of Object.entries(extra)) {
  const cls = `Mechanic_${name[0].toUpperCase()}${name.slice(1)}`;
  writeFileSync(join(out, `${cls}.cs`), mechanicSource(c.graph, graphHash(c.graph), cls));
  const inputs = c.inputs as unknown as Array<[number, number]>;
  writeFileSync(join(out, `${name}.input.json`), JSON.stringify({ seed: c.seed, ticks: c.ticks, inputs }));
  writeFileSync(join(out, `${name}.snapshots.json`), JSON.stringify(runGraph(c.graph, c.seed, inputs, c.ticks, 60)));
}
console.log(`wrote ${out}`);
