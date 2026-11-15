import { attachHash } from "./lineage";
import { GRAPH_SCHEMA, type Edge, type Graph, type GraphNode, type NodeType } from "./schema";

type N = [id: string, type: NodeType, params: GraphNode["params"], author: string, x: number, y: number];

function nodes(list: N[], origin = ""): GraphNode[] {
  return list.map(([id, type, params, authorId, x, y]) => ({ id, type, params, authorId, originFork: origin, pos: { x, y } }));
}
export const ex = (from: string, to: string, fromPort = "out"): Edge => ({ from: { node: from, port: fromPort }, to: { node: to, port: "in" }, kind: "exec" });
export const dx = (from: string, to: string, toPort: string): Edge => ({ from: { node: from, port: "out" }, to: { node: to, port: toPort }, kind: "data" });

function base(title: string, kind: "mechanic" | "level", tags: string[], license: Graph["license"], ns: GraphNode[], es: Edge[], theme?: Graph["theme"]): Graph {
  return { schema: GRAPH_SCHEMA, parent: null, root: "", kind, sources: [], title, tags, license, theme, nodes: ns, edges: es };
}

/** Jump, by @mira: a one-key runner. Enemies run in from the right; jump over them. */
export function jumpGraph(): Graph {
  const ns = nodes([
    ["n01", "OnStart", {}, "mira", 0, 0],
    ["n02", "Spawn", { prefab: "player", x: 2000, y: 0 }, "mira", 240, 0],
    ["n04", "OnKey", { key: "Space", when: "press" }, "mira", 0, 160],
    ["n05", "Branch", {}, "mira", 240, 160],
    ["n06", "EntityField", { entity: "player", field: "grounded" }, "mira", 0, 280],
    ["n07", "AddVelocity", { entity: "player", vx: 0, vy: 270 }, "mira", 480, 160],
    ["n08", "OnTick", { everyN: 1 }, "mira", 0, 400],
    ["n09", "AddVelocity", { entity: "player", vx: 0, vy: -12 }, "mira", 240, 400],
    ["n10", "OnTick", { everyN: 110 }, "mira", 0, 520],
    ["n11", "Spawn", { prefab: "enemy", x: 15500, y: 0 }, "mira", 240, 520],
    ["n13", "OnCollide", { tagA: "player", tagB: "enemy" }, "mira", 0, 640],
    ["n14", "Lose", {}, "mira", 240, 640],
    ["n15", "OnTick", { everyN: 60 }, "mira", 0, 760],
    ["n16", "AddScore", { n: 1 }, "mira", 240, 760],
  ]);
  const es = [ex("n01", "n02"), ex("n04", "n05"), dx("n06", "n05", "cond"), ex("n05", "n07", "true"), ex("n08", "n09"), ex("n10", "n11"), ex("n13", "n14"), ex("n15", "n16")];
  return base("Jump", "mechanic", ["runner", "one-key", "jump"], { type: "free" }, ns, es, { sky: "#07101A", ground: "#D27A45", accent: "#5FC3E4" });
}

/** Dodge, by @theo, forked from Jump: one key flips direction, rocks fall from random columns. */
export function dodgeGraph(jumpHash: string): Graph {
  const j = jumpGraph();
  const keep = new Set(["n01", "n02", "n08", "n09", "n10", "n11", "n13", "n14", "n15", "n16"]);
  const kept = j.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n, params: { ...n.params }, originFork: jumpHash }));
  const get = (id: string) => kept.find((n) => n.id === id)!;
  get("n02").params.x = 8000; // parameter tweak: still @mira's node
  get("n10").params.everyN = 40; // parameter tweak
  get("n13").params.tagB = "rock"; // parameter tweak
  const n11 = get("n11");
  n11.params = { prefab: "rock", x: 8000, y: 9000 };
  n11.authorId = "theo"; // rewired below (new incoming data edge), so it becomes @theo's
  n11.originFork = "";
  const added = nodes([
    ["n12", "Random", { min: 0, max: 15500, stream: "rocks" }, "theo", 0, 600],
    ["n20", "OnKey", { key: "Space", when: "press" }, "theo", 0, 160],
    ["n21", "Branch", {}, "theo", 240, 160],
    ["n22", "Compare", { op: "gt", b: 0 }, "theo", 0, 260],
    ["n23", "EntityField", { entity: "player", field: "vx" }, "theo", -240, 260],
    ["n24", "SetVelocity", { entity: "player", vx: -160, vy: 0 }, "theo", 480, 120],
    ["n25", "SetVelocity", { entity: "player", vx: 160, vy: 0 }, "theo", 480, 220],
  ]);
  const es = [
    ex("n01", "n02"), ex("n08", "n09"), ex("n10", "n11"), dx("n12", "n11", "x"), ex("n13", "n14"), ex("n15", "n16"),
    ex("n20", "n21"), dx("n22", "n21", "cond"), dx("n23", "n22", "a"), ex("n21", "n24", "true"), ex("n21", "n25", "false"),
  ];
  return {
    ...base("Dodge", "mechanic", ["dodge", "one-key", "falling"], { type: "free" }, [...kept, ...added], es, { sky: "#0B0D14", ground: "#8E98A6", accent: "#EC7448" }),
    parent: jumpHash,
    root: jumpHash,
  };
}

/** Collect, by @ana, forked from Dodge: coins appear on the ground and are worth 5 points. */
export function collectGraph(dodge: Graph, dodgeHash: string): Graph {
  const kept = dodge.nodes.map((n) => ({ ...n, params: { ...n.params }, originFork: n.originFork === "" ? dodgeHash : n.originFork }));
  kept.find((n) => n.id === "n10")!.params.everyN = 55;
  const added = nodes([
    ["n30", "OnTick", { everyN: 75 }, "ana", 0, 880],
    ["n31", "Spawn", { prefab: "coin", x: 8000, y: 0 }, "ana", 240, 880],
    ["n32", "Random", { min: 500, max: 15000, stream: "coins" }, "ana", 0, 980],
    ["n33", "OnCollide", { tagA: "player", tagB: "coin" }, "ana", 0, 1080],
    ["n34", "AddScore", { n: 5 }, "ana", 240, 1080],
    ["n35", "Destroy", { entity: "b" }, "ana", 480, 1080],
  ]);
  const es = [...dodge.edges, ex("n30", "n31"), dx("n32", "n31", "x"), ex("n33", "n34"), ex("n34", "n35")];
  return {
    ...base("Collect", "mechanic", ["collect", "one-key", "coins"], { type: "paid", priceLamports: 100_000_000 }, [...kept, ...added], es, { sky: "#0A120E", ground: "#E2B75A", accent: "#9CC27A" }),
    parent: dodgeHash,
    root: dodge.root || dodgeHash,
  };
}

function level(title: string, tags: string[], list: N[], es: Edge[]): Graph {
  return base(title, "level", tags, { type: "free" }, nodes(list), es);
}

export function arenaLevel(): Graph {
  return level("Arena", ["arena", "falling"], [
    ["l01", "OnStart", {}, "kai", 0, 0],
    ["l02", "Spawn", { prefab: "player", x: 8000, y: 0 }, "kai", 240, 0],
    ["l03", "OnTick", { everyN: 35 }, "kai", 0, 140],
    ["l04", "Spawn", { prefab: "rock", x: 8000, y: 9000 }, "kai", 240, 140],
    ["l05", "Random", { min: 0, max: 15500, stream: "rocks" }, "kai", 0, 240],
    ["l06", "OnCollide", { tagA: "player", tagB: "rock" }, "kai", 0, 360],
    ["l07", "Lose", {}, "kai", 240, 360],
    ["l08", "OnTick", { everyN: 60 }, "kai", 0, 480],
    ["l09", "AddScore", { n: 1 }, "kai", 240, 480],
  ], [ex("l01", "l02"), ex("l03", "l04"), dx("l05", "l04", "x"), ex("l06", "l07"), ex("l08", "l09")]);
}

export function gauntletLevel(): Graph {
  return level("Gauntlet", ["gauntlet", "runner"], [
    ["l01", "OnStart", {}, "kai", 0, 0],
    ["l02", "Spawn", { prefab: "player", x: 3000, y: 0 }, "kai", 240, 0],
    ["l03", "OnTick", { everyN: 95 }, "kai", 0, 140],
    ["l04", "Spawn", { prefab: "enemy", x: 15500, y: 0 }, "kai", 240, 140],
    ["l06", "OnCollide", { tagA: "player", tagB: "enemy" }, "kai", 0, 360],
    ["l07", "Lose", {}, "kai", 240, 360],
    ["l08", "OnTick", { everyN: 60 }, "kai", 0, 480],
    ["l09", "AddScore", { n: 1 }, "kai", 240, 480],
  ], [ex("l01", "l02"), ex("l03", "l04"), ex("l06", "l07"), ex("l08", "l09")]);
}

export function orchardLevel(): Graph {
  return level("Orchard", ["orchard", "coins"], [
    ["l01", "OnStart", {}, "kai", 0, 0],
    ["l02", "Spawn", { prefab: "player", x: 8000, y: 0 }, "kai", 240, 0],
    ["l03", "OnTick", { everyN: 50 }, "kai", 0, 140],
    ["l04", "Spawn", { prefab: "coin", x: 8000, y: 0 }, "kai", 240, 140],
    ["l05", "Random", { min: 500, max: 15000, stream: "coins" }, "kai", 0, 240],
    ["l06", "OnCollide", { tagA: "player", tagB: "coin" }, "kai", 0, 360],
    ["l07", "AddScore", { n: 3 }, "kai", 240, 360],
    ["l08", "Destroy", { entity: "b" }, "kai", 480, 360],
    ["l10", "OnTick", { everyN: 45 }, "kai", 0, 480],
    ["l11", "Spawn", { prefab: "rock", x: 8000, y: 9000 }, "kai", 240, 480],
    ["l12", "Random", { min: 0, max: 15500, stream: "rocks" }, "kai", 0, 580],
    ["l13", "OnCollide", { tagA: "player", tagB: "rock" }, "kai", 0, 680],
    ["l14", "Lose", {}, "kai", 240, 680],
  ], [ex("l01", "l02"), ex("l03", "l04"), dx("l05", "l04", "x"), ex("l06", "l07"), ex("l07", "l08"), ex("l10", "l11"), dx("l12", "l11", "x"), ex("l13", "l14")]);
}

/** The seeded lineage: Jump (root) -> Dodge -> Collect, plus three levels. Hashes are computed, not hard-coded. */
export function seedLibrary() {
  const jump = attachHash(jumpGraph());
  const dodge = attachHash(dodgeGraph(jump.hash));
  const collect = attachHash(collectGraph(dodge.graph, dodge.hash));
  const levels = [arenaLevel(), gauntletLevel(), orchardLevel()].map(attachHash);
  return { jump, dodge, collect, levels };
}

/* ---------- 3D mechanics: WASD on the ground plane, Space to act ---------- */

/** WASD movement as "while held move, when released stop" stacks, Scratch style. */
function wasd(prefix: string, author: string, speed = 170): { ns: N[]; es: Edge[] } {
  const keys: Array<[string, string, string]> = [["KeyA", "left", "x"], ["KeyD", "right", "x"], ["KeyW", "forward", "z"], ["KeyS", "back", "z"]];
  const ns: N[] = [];
  const es: Edge[] = [];
  keys.forEach(([key, dir, axis], i) => {
    const a = `${prefix}${i * 4 + 1}`, b = `${prefix}${i * 4 + 2}`, c = `${prefix}${i * 4 + 3}`, d = `${prefix}${i * 4 + 4}`;
    ns.push(
      [a, "OnKey", { key, when: "held" }, author, 0, 0],
      [b, "Move", { entity: "player", direction: dir, speed }, author, 0, 0],
      [c, "OnKey", { key, when: "released" }, author, 0, 0],
      [d, "Stop", { entity: "player", axis }, author, 0, 0],
    );
    es.push(ex(a, b), ex(c, d));
  });
  return { ns, es };
}

function graph3d(title: string, tags: string[], author: string, list: N[], es: Edge[], theme: Graph["theme"]): Graph {
  return base(title, "mechanic", tags, { type: "free" }, nodes(list), es, theme);
}

/** Arena shooter, by @rhea: move with WASD, Space fires a bolt the way you face; raiders advance from the far side. */
export function shooterGraph(): Graph {
  const m = wasd("m", "rhea");
  const list: N[] = [
    ["s01", "OnStart", {}, "rhea", 0, 0],
    ["s02", "Spawn", { prefab: "player", x: 7700, y: 0, z: 12500 }, "rhea", 0, 0],
    ["s03", "Spawn", { prefab: "pillar", x: 3500, y: 0, z: 7000 }, "rhea", 0, 0],
    ["s04", "Spawn", { prefab: "pillar", x: 11600, y: 0, z: 7000 }, "rhea", 0, 0],
    ...m.ns,
    ["s10", "OnKey", { key: "Space", when: "press" }, "rhea", 0, 0],
    ["s11", "Shoot", { prefab: "bolt", from: "player", direction: "facing", speed: 280 }, "rhea", 0, 0],
    ["s20", "OnTick", { everyN: 70 }, "rhea", 0, 0],
    ["s21", "Spawn", { prefab: "raider", x: 8000, y: 0, z: 300 }, "rhea", 0, 0],
    ["s22", "Random", { min: 300, max: 15000, stream: "raiders" }, "rhea", 0, 0],
    ["s30", "OnCollide", { tagA: "bolt", tagB: "enemy" }, "rhea", 0, 0],
    ["s31", "Destroy", { entity: "a" }, "rhea", 0, 0],
    ["s32", "Destroy", { entity: "b" }, "rhea", 0, 0],
    ["s33", "AddScore", { n: 1 }, "rhea", 0, 0],
    ["s34", "Branch", {}, "rhea", 0, 0],
    ["s35", "Compare", { op: "ge", b: 20 }, "rhea", 0, 0],
    ["s36", "Score", {}, "rhea", 0, 0],
    ["s37", "Win", {}, "rhea", 0, 0],
    ["s40", "OnCollide", { tagA: "player", tagB: "enemy" }, "rhea", 0, 0],
    ["s41", "Lose", {}, "rhea", 0, 0],
  ];
  const es: Edge[] = [
    ex("s01", "s02"), ex("s02", "s03"), ex("s03", "s04"), ...m.es,
    ex("s10", "s11"),
    ex("s20", "s21"), dx("s22", "s21", "x"),
    ex("s30", "s31"), ex("s31", "s32"), ex("s32", "s33"), ex("s33", "s34"), dx("s35", "s34", "cond"), dx("s36", "s35", "a"), ex("s34", "s37", "true"),
    ex("s40", "s41"),
  ];
  return { ...graph3d("Arena shooter", ["shooter", "3d", "wasd"], "rhea", list, es, { sky: "#0a0812", ground: "#cbbfa6", accent: "#e2b75a" }), scene: { preset: "temple", hud: { score: "top-left", scoreLabel: "Raiders" } } };
}

/** Olive grove, by @sol: roam with WASD, jump with Space, collect 15 drachmas while rocks fall. */
export function groveGraph(): Graph {
  const m = wasd("m", "sol", 150);
  const list: N[] = [
    ["g01", "OnStart", {}, "sol", 0, 0],
    ["g02", "Spawn", { prefab: "player", x: 7700, y: 0, z: 7700 }, "sol", 0, 0],
    ...m.ns,
    ["g10", "OnKey", { key: "Space", when: "press" }, "sol", 0, 0],
    ["g11", "Branch", {}, "sol", 0, 0],
    ["g12", "EntityField", { entity: "player", field: "grounded" }, "sol", 0, 0],
    ["g13", "Move", { entity: "player", direction: "up", speed: 260 }, "sol", 0, 0],
    ["g14", "OnTick", { everyN: 1 }, "sol", 0, 0],
    ["g15", "AddVelocity", { entity: "player", vx: 0, vy: -12, vz: 0 }, "sol", 0, 0],
    ["g20", "OnTick", { everyN: 40 }, "sol", 0, 0],
    ["g21", "Spawn", { prefab: "coin", x: 8000, y: 0, z: 8000 }, "sol", 0, 0],
    ["g22", "Random", { min: 500, max: 15000, stream: "coin-x" }, "sol", 0, 0],
    ["g23", "Random", { min: 500, max: 15000, stream: "coin-z" }, "sol", 0, 0],
    ["g30", "OnCollide", { tagA: "player", tagB: "coin" }, "sol", 0, 0],
    ["g31", "AddScore", { n: 1 }, "sol", 0, 0],
    ["g32", "Destroy", { entity: "b" }, "sol", 0, 0],
    ["g33", "Branch", {}, "sol", 0, 0],
    ["g34", "Compare", { op: "ge", b: 15 }, "sol", 0, 0],
    ["g35", "Score", {}, "sol", 0, 0],
    ["g36", "Win", {}, "sol", 0, 0],
    ["g40", "OnTick", { everyN: 45 }, "sol", 0, 0],
    ["g41", "Spawn", { prefab: "rock", x: 8000, y: 9000, z: 8000 }, "sol", 0, 0],
    ["g42", "Random", { min: 0, max: 15500, stream: "rock-x" }, "sol", 0, 0],
    ["g43", "Random", { min: 0, max: 15500, stream: "rock-z" }, "sol", 0, 0],
    ["g44", "OnCollide", { tagA: "player", tagB: "rock" }, "sol", 0, 0],
    ["g45", "Lose", {}, "sol", 0, 0],
  ];
  const es: Edge[] = [
    ex("g01", "g02"), ...m.es,
    ex("g10", "g11"), dx("g12", "g11", "cond"), ex("g11", "g13", "true"), ex("g14", "g15"),
    ex("g20", "g21"), dx("g22", "g21", "x"), dx("g23", "g21", "z"),
    ex("g30", "g31"), ex("g31", "g32"), ex("g32", "g33"), dx("g34", "g33", "cond"), dx("g35", "g34", "a"), ex("g33", "g36", "true"),
    ex("g40", "g41"), dx("g42", "g41", "x"), dx("g43", "g41", "z"), ex("g44", "g45"),
  ];
  return { ...graph3d("Olive grove", ["collect", "3d", "wasd", "jump"], "sol", list, es, { sky: "#08100c", ground: "#b8a77f", accent: "#9cc27a" }), scene: { preset: "meadow", hud: { score: "top-left", scoreLabel: "Olives" } } };
}

/** Hurdle run, by @lena: hurdles charge down the arena; A and D change lanes, Space jumps. */
export function hurdleGraph(): Graph {
  const list: N[] = [
    ["h01", "OnStart", {}, "lena", 0, 0],
    ["h02", "Spawn", { prefab: "player", x: 7700, y: 0, z: 13000 }, "lena", 0, 0],
    ["h03", "OnKey", { key: "KeyA", when: "held" }, "lena", 0, 0],
    ["h04", "Move", { entity: "player", direction: "left", speed: 190 }, "lena", 0, 0],
    ["h05", "OnKey", { key: "KeyD", when: "held" }, "lena", 0, 0],
    ["h06", "Move", { entity: "player", direction: "right", speed: 190 }, "lena", 0, 0],
    ["h07", "OnKey", { key: "KeyA", when: "released" }, "lena", 0, 0],
    ["h08", "Stop", { entity: "player", axis: "x" }, "lena", 0, 0],
    ["h09", "OnKey", { key: "KeyD", when: "released" }, "lena", 0, 0],
    ["h10", "Stop", { entity: "player", axis: "x" }, "lena", 0, 0],
    ["h11", "OnKey", { key: "Space", when: "press" }, "lena", 0, 0],
    ["h12", "Branch", {}, "lena", 0, 0],
    ["h13", "EntityField", { entity: "player", field: "grounded" }, "lena", 0, 0],
    ["h14", "Move", { entity: "player", direction: "up", speed: 280 }, "lena", 0, 0],
    ["h15", "OnTick", { everyN: 1 }, "lena", 0, 0],
    ["h16", "AddVelocity", { entity: "player", vx: 0, vy: -13, vz: 0 }, "lena", 0, 0],
    ["h20", "OnTick", { everyN: 55 }, "lena", 0, 0],
    ["h21", "Spawn", { prefab: "hurdle", x: 6700, y: 0, z: 0 }, "lena", 0, 0],
    ["h22", "Random", { min: 0, max: 13400, stream: "lanes" }, "lena", 0, 0],
    ["h30", "OnCollide", { tagA: "player", tagB: "hurdle" }, "lena", 0, 0],
    ["h31", "Lose", {}, "lena", 0, 0],
    ["h40", "OnTick", { everyN: 60 }, "lena", 0, 0],
    ["h41", "AddScore", { n: 1 }, "lena", 0, 0],
  ];
  const es: Edge[] = [
    ex("h01", "h02"), ex("h03", "h04"), ex("h05", "h06"), ex("h07", "h08"), ex("h09", "h10"),
    ex("h11", "h12"), dx("h13", "h12", "cond"), ex("h12", "h14", "true"), ex("h15", "h16"),
    ex("h20", "h21"), dx("h22", "h21", "x"), ex("h30", "h31"), ex("h40", "h41"),
  ];
  return { ...graph3d("Hurdle run", ["runner", "3d", "jump"], "lena", list, es, { sky: "#0c0710", ground: "#c76a3c", accent: "#f2d28a" }), scene: { preset: "arena", hud: { score: "top-left", timer: "top-right" } } };
}

/** Ledges, by @mira: a side-on 2D platformer. A/D or the arrows run, Space jumps, coins float, enemies run in from the right. */
export function platformerGraph(): Graph {
  const a = "mira";
  const list: N[] = [
    ["p01", "OnStart", {}, a, 0, 0],
    ["p02", "Spawn", { prefab: "player", x: 1500, y: 0, z: 7700 }, a, 0, 0],
    ["p03", "Spawn", { prefab: "platform", x: 3600, y: 1500, z: 6200 }, a, 0, 0],
    ["p04", "Spawn", { prefab: "platform", x: 7800, y: 2900, z: 6200 }, a, 0, 0],
    ["p05", "Spawn", { prefab: "platform", x: 11600, y: 1700, z: 6200 }, a, 0, 0],
    ["p10", "OnKey", { key: "KeyA", when: "held" }, a, 0, 0],
    ["p11", "Move", { entity: "player", direction: "left", speed: 130 }, a, 0, 0],
    ["p12", "OnKey", { key: "KeyD", when: "held" }, a, 0, 0],
    ["p13", "Move", { entity: "player", direction: "right", speed: 130 }, a, 0, 0],
    ["p14", "OnKey", { key: "ArrowLeft", when: "held" }, a, 0, 0],
    ["p15", "Move", { entity: "player", direction: "left", speed: 130 }, a, 0, 0],
    ["p16", "OnKey", { key: "ArrowRight", when: "held" }, a, 0, 0],
    ["p17", "Move", { entity: "player", direction: "right", speed: 130 }, a, 0, 0],
    ["p18", "OnKey", { key: "KeyA", when: "released" }, a, 0, 0],
    ["p19", "Stop", { entity: "player", axis: "x" }, a, 0, 0],
    ["p20", "OnKey", { key: "KeyD", when: "released" }, a, 0, 0],
    ["p21", "Stop", { entity: "player", axis: "x" }, a, 0, 0],
    ["p22", "OnKey", { key: "ArrowLeft", when: "released" }, a, 0, 0],
    ["p23", "Stop", { entity: "player", axis: "x" }, a, 0, 0],
    ["p24", "OnKey", { key: "ArrowRight", when: "released" }, a, 0, 0],
    ["p25", "Stop", { entity: "player", axis: "x" }, a, 0, 0],
    ["p30", "OnKey", { key: "Space", when: "press" }, a, 0, 0],
    ["p31", "Branch", {}, a, 0, 0],
    ["p32", "EntityField", { entity: "player", field: "grounded" }, a, 0, 0],
    ["p33", "Move", { entity: "player", direction: "up", speed: 300 }, a, 0, 0],
    ["p34", "OnTick", { everyN: 1 }, a, 0, 0],
    ["p35", "AddVelocity", { entity: "player", vx: 0, vy: -13, vz: 0 }, a, 0, 0],
    ["p40", "OnTick", { everyN: 150 }, a, 0, 0],
    ["p41", "Spawn", { prefab: "coin", x: 8000, y: 3600, z: 7800 }, a, 0, 0],
    ["p42", "Random", { min: 600, max: 15000, stream: "coins" }, a, 0, 0],
    ["p43", "Random", { min: 500, max: 4200, stream: "coins" }, a, 0, 0],
    ["p50", "OnTick", { everyN: 140 }, a, 0, 0],
    ["p51", "Spawn", { prefab: "enemy", x: 15300, y: 0, z: 7700 }, a, 0, 0],
    ["p60", "OnCollide", { tagA: "player", tagB: "coin" }, a, 0, 0],
    ["p61", "Destroy", { entity: "b" }, a, 0, 0],
    ["p62", "AddScore", { n: 5 }, a, 0, 0],
    ["p70", "OnCollide", { tagA: "player", tagB: "enemy" }, a, 0, 0],
    ["p71", "Lose", {}, a, 0, 0],
  ];
  const es: Edge[] = [
    ex("p01", "p02"), ex("p02", "p03"), ex("p03", "p04"), ex("p04", "p05"),
    ex("p10", "p11"), ex("p12", "p13"), ex("p14", "p15"), ex("p16", "p17"),
    ex("p18", "p19"), ex("p20", "p21"), ex("p22", "p23"), ex("p24", "p25"),
    ex("p30", "p31"), dx("p32", "p31", "cond"), ex("p31", "p33", "true"), ex("p34", "p35"),
    ex("p40", "p41"), dx("p42", "p41", "x"), dx("p43", "p41", "y"),
    ex("p50", "p51"), ex("p60", "p61"), ex("p61", "p62"), ex("p70", "p71"),
  ];
  return { ...graph3d("Ledges", ["platformer", "2d", "jump", "coins"], a, list, es, { sky: "#0d0a16", ground: "#b8784a", accent: "#f2d28a" }), view: "2d", scene: { preset: "forest", hud: { score: "top-left", scoreLabel: "Coins" } } };
}

/** A blank game with only a player, in 2D or 3D. */
export function starterGraph(view: "2d" | "3d", author: string): Graph {
  const list: N[] = [
    ["s01", "OnStart", {}, author, 0, 0],
    ["s02", "Spawn", { prefab: "player", x: view === "2d" ? 2000 : 7700, y: 0, z: view === "2d" ? 7700 : 12000 }, author, 0, 0],
    ["s03", "OnTick", { everyN: 1 }, author, 0, 0],
    ["s04", "AddVelocity", { entity: "player", vx: 0, vy: -13, vz: 0 }, author, 0, 0],
  ];
  const g = base(view === "2d" ? "Untitled 2D game" : "Untitled 3D game", "mechanic", [view], { type: "free" }, nodes(list), [ex("s01", "s02"), ex("s03", "s04")]);
  return { ...g, view };
}

/** Siege, by @rhea: the arena shooter where raiders fire back. Uses a game-defined prefab (fireball). */
export function siegeGraph(): Graph {
  const base = shooterGraph();
  const add: N[] = [
    ["sg01", "OnTick", { everyN: 75 }, "rhea", 0, 0],
    ["sg02", "Shoot", { prefab: "fireball", from: "enemy", direction: "back", speed: 140 }, "rhea", 0, 0],
    ["sg03", "OnCollide", { tagA: "player", tagB: "hazard" }, "rhea", 0, 0],
    ["sg04", "Lose", {}, "rhea", 0, 0],
    ["sg05", "OnTick", { everyN: 140 }, "rhea", 0, 0],
    ["sg06", "Shoot", { prefab: "bolt", from: "enemy", direction: "back", speed: 200 }, "rhea", 0, 0],
  ];
  return {
    ...base,
    title: "Siege",
    tags: ["shooter", "3d", "wasd", "enemies-shoot"],
    nodes: [...base.nodes, ...nodes(add)],
    edges: [...base.edges, ex("sg01", "sg02"), ex("sg03", "sg04"), ex("sg05", "sg06")],
    prefabs: { fireball: { tag: "hazard", w: 420, h: 420, d: 420, vx: 0, vy: 0, vz: 0, color: "#ff7a3a" } },
    theme: { sky: "#120a0a", ground: "#b98a62", accent: "#f2d28a" },
  };
}

/** Trickshot, by @kai: walk the court with WASD, Space lobs a ball; sink it in the hoop for 3 points. Game-defined ball and hoop. */
export function trickshotGraph(): Graph {
  const a = "kai";
  const move = wasd("tm", a, 150);
  const list: N[] = [
    ["t01", "OnStart", {}, a, 0, 0],
    ["t02", "Spawn", { prefab: "player", x: 7700, y: 0, z: 12500 }, a, 0, 0],
    ["t03", "Spawn", { prefab: "hoop", x: 7200, y: 3000, z: 2200 }, a, 0, 0],
    ["t10", "OnKey", { key: "Space", when: "press" }, a, 0, 0],
    ["t11", "Shoot", { prefab: "ball", from: "player", direction: "arc", speed: 150 }, a, 0, 0],
    ["t20", "OnTick", { everyN: 1 }, a, 0, 0],
    ["t21", "AddVelocity", { entity: "ball", vx: 0, vy: -4, vz: 0 }, a, 0, 0],
    ["t22", "AddVelocity", { entity: "player", vx: 0, vy: -13, vz: 0 }, a, 0, 0],
    // a basket: 3 points, the ball is used up
    ["t30", "OnCollide", { tagA: "ball", tagB: "hoop" }, a, 0, 0],
    ["t31", "AddScore", { n: 3 }, a, 0, 0],
    ["t32", "Destroy", { entity: "a" }, a, 0, 0],
    // loose balls on the court are cleared every five seconds
    ["t40", "OnTick", { everyN: 300 }, a, 0, 0],
    ["t41", "Destroy", { entity: "ball" }, a, 0, 0],
    // defenders walk toward you from under the hoop
    ["t50", "OnTick", { everyN: 140 }, a, 0, 0],
    ["t51", "Spawn", { prefab: "defender", x: 7700, y: 0, z: 3800 }, a, 0, 0],
    ["t52", "Random", { min: 1200, max: 14200, stream: "defenders" }, a, 0, 0],
    // hit one with a ball: +1 and it's out; let one reach you: the run is over
    ["t60", "OnCollide", { tagA: "ball", tagB: "defender" }, a, 0, 0],
    ["t61", "AddScore", { n: 1 }, a, 0, 0],
    ["t62", "Destroy", { entity: "b" }, a, 0, 0],
    ["t63", "Destroy", { entity: "a" }, a, 0, 0],
    ["t70", "OnCollide", { tagA: "player", tagB: "defender" }, a, 0, 0],
    ["t71", "Lose", {}, a, 0, 0],
    ...move.ns,
  ];
  const es: Edge[] = [
    ex("t01", "t02"), ex("t02", "t03"), ex("t10", "t11"), ex("t20", "t21"), ex("t21", "t22"), ex("t30", "t31"), ex("t31", "t32"),
    ex("t40", "t41"), ex("t50", "t51"), dx("t52", "t51", "x"), ex("t60", "t61"), ex("t61", "t62"), ex("t62", "t63"), ex("t70", "t71"), ...move.es,
  ];
  return {
    ...base("Trickshot", "mechanic", ["basketball", "3d", "throwing", "enemies"], { type: "free" }, nodes(list), es, { sky: "#141824", ground: "#c98b4e", accent: "#f2d28a" }),
    view: "3d",
    prefabs: {
      ball: { tag: "ball", w: 500, h: 500, d: 500, vx: 0, vy: 0, vz: 0, body: true, color: "#e2711d" },
      hoop: { tag: "hoop", w: 1200, h: 500, d: 1200, vx: 0, vy: 0, vz: 0, color: "#e2471d" },
      defender: { tag: "defender", w: 650, h: 650, d: 650, vx: 0, vy: 0, vz: 55, color: "#6b8bd6" },
    },
    scene: {
      preset: "court",
      // the scoring zone is an invisible box at rim height; the hoop model stands on the floor under it
      looks: { ball: { model: "ball" }, hoop: { model: "orb", color: "#e2471d", scale: 0.2 }, defender: { model: "soldier", color: "#6b8bd6", scale: 1.4 } },
      props: [{ model: "hoop", x: 7800, z: 2000, scale: 1.05 }, { model: "banner", x: 2500, z: -1500 }, { model: "banner", x: 13500, z: -1500 }, { model: "trophy", x: 8000, z: -1800, scale: 1.4 }, { model: "flag", x: -1500, z: 8000 }, { model: "flag", x: 17500, z: 8000 }],
      hud: { score: "top-left", scoreLabel: "Points", timer: "top-right", title: "Trickshot", message: "Space shoots. Baskets 3, defenders 1. Don't let them reach you." },
    },
  };
}

/**
 * Sky patrol, built in three forks: @lena's Sky glider (fly the plane, drones come at you), @kai's Sky gunner
 * (Space fires ahead; a drone is worth 1) and @mira's Sky patrol (gold rings worth 3). A and D steer, W and S
 * speed up and hold back. The plane is a body with no gravity, so it holds its altitude.
 */
const SKY_PREFABS: NonNullable<Graph["prefabs"]> = {
  plane: { tag: "player", w: 900, h: 500, d: 900, vx: 0, vy: 0, vz: 0, body: true, color: "#e9edf2" },
  drone: { tag: "enemy", w: 800, h: 600, d: 800, vx: 0, vy: 0, vz: 95, color: "#c9ced4" },
  ring: { tag: "ring", w: 1000, h: 1000, d: 300, vx: 0, vy: 0, vz: 80, color: "#f2d28a" },
};
const SKY_SCENE: NonNullable<Graph["scene"]> = {
  preset: "plain",
  looks: { plane: { model: "plane", color: "#e9edf2", scale: 1.3 }, drone: { model: "drone", color: "#c9ced4", scale: 1.2 }, ring: { model: "orb", color: "#f2d28a", scale: 1.5 } },
  // clouds far ahead and high, so they read as sky and never sit between the camera and the plane
  props: [
    { model: "cloud", x: 1500, y: 6500, z: -3000, scale: 1.4 }, { model: "cloud", x: 13500, y: 7500, z: -4000, scale: 1.8 },
    { model: "cloud", x: 7000, y: 9000, z: -6000, scale: 2 }, { model: "cloud", x: -3000, y: 5000, z: 1000, scale: 1.2 },
    { model: "cloud", x: 19000, y: 5500, z: 2000, scale: 1.3 },
  ],
  hud: { score: "top-left", scoreLabel: "Score", message: "A D steer · W S speed · Space fires" },
};

/** The three stages, each a superset of the one before: [Sky glider by @lena, Sky gunner by @kai, Sky patrol by @mira]. */
export function skyStages(): [Graph, Graph, Graph] {
  const move = wasd("k", "lena", 180);
  const glider: N[] = [
    ["p01", "OnStart", {}, "lena", 0, 0],
    ["p02", "Spawn", { prefab: "plane", x: 7700, y: 2500, z: 11500 }, "lena", 0, 0],
    ...move.ns,
    ["p20", "OnTick", { everyN: 55 }, "lena", 0, 0],
    ["p21", "Spawn", { prefab: "drone", x: 8000, y: 2450, z: 300 }, "lena", 0, 0],
    ["p22", "Random", { min: 600, max: 15000, stream: "drones" }, "lena", 0, 0],
    ["p50", "OnCollide", { tagA: "player", tagB: "enemy" }, "lena", 0, 0],
    ["p51", "Lose", {}, "lena", 0, 0],
  ];
  const gliderEdges: Edge[] = [ex("p01", "p02"), ...move.es, ex("p20", "p21"), dx("p22", "p21", "x"), ex("p50", "p51")];
  const gunner: N[] = [
    ["p10", "OnKey", { key: "Space", when: "press" }, "kai", 0, 0],
    ["p11", "Shoot", { prefab: "bolt", from: "player", direction: "forward", speed: 320 }, "kai", 0, 0],
    ["p30", "OnCollide", { tagA: "bolt", tagB: "enemy" }, "kai", 0, 0],
    ["p31", "Destroy", { entity: "a" }, "kai", 0, 0],
    ["p32", "Destroy", { entity: "b" }, "kai", 0, 0],
    ["p33", "AddScore", { n: 1 }, "kai", 0, 0],
  ];
  const gunnerEdges: Edge[] = [ex("p10", "p11"), ex("p30", "p31"), ex("p31", "p32"), ex("p32", "p33")];
  const rings: N[] = [
    ["p25", "OnTick", { everyN: 140 }, "mira", 0, 0],
    ["p26", "Spawn", { prefab: "ring", x: 8000, y: 2350, z: 300 }, "mira", 0, 0],
    ["p27", "Random", { min: 900, max: 14500, stream: "rings" }, "mira", 0, 0],
    ["p40", "OnCollide", { tagA: "player", tagB: "ring" }, "mira", 0, 0],
    ["p41", "AddScore", { n: 3 }, "mira", 0, 0],
    ["p42", "Destroy", { entity: "b" }, "mira", 0, 0],
  ];
  const ringEdges: Edge[] = [ex("p25", "p26"), dx("p27", "p26", "x"), ex("p40", "p41"), ex("p41", "p42")];
  const theme = { sky: "#7fb8e6", ground: "#9cc27a", accent: "#f2d28a" };
  const make = (title: string, author: string, tags: string[], list: N[], es: Edge[]): Graph => ({ ...graph3d(title, tags, author, list, es, theme), prefabs: structuredClone(SKY_PREFABS), scene: structuredClone(SKY_SCENE) });
  return [
    make("Sky glider", "lena", ["flying", "3d", "plane", "dodge"], glider, gliderEdges),
    make("Sky gunner", "kai", ["flying", "3d", "plane", "shooter"], [...glider, ...gunner], [...gliderEdges, ...gunnerEdges]),
    make("Sky patrol", "mira", ["flying", "3d", "plane", "shooter", "rings"], [...glider, ...gunner, ...rings], [...gliderEdges, ...gunnerEdges, ...ringEdges]),
  ];
}

/** The finished game: Sky patrol, with every block credited to the person who added it. */
export function skyGraph(): Graph {
  return skyStages()[2];
}
