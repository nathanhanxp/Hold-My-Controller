import { z } from "zod";

export const GRAPH_SCHEMA = "forklab.graph.v1" as const;
export const MAX_NODES = 200;
export const MAX_EDGES = 400;

/** Keys the runtime understands. Bit index = position in this list. */
export const KEYS = ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"] as const;
export type KeyName = (typeof KEYS)[number];
export const KEY_ALL_MASK = (1 << KEYS.length) - 1;
export function keyBit(key: string): number {
  const i = (KEYS as readonly string[]).indexOf(key);
  return i < 0 ? 0 : 1 << i;
}

export const NODE_TYPES = [
  "OnStart", "OnKey", "OnTick", "OnCollide",
  "SetVelocity", "AddVelocity", "Spawn", "Destroy", "AddScore", "SetVar", "Win", "Lose",
  "Branch", "Compare",
  "Const", "GetVar", "Random", "EntityField",
  "Move", "Stop", "Shoot", "Score",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type PortKind = "exec" | "number";
export type PortDef = { name: string; kind: PortKind };
export type ParamDef = { name: string; kind: "int" | "string" | "enum" | "key" | "tag"; default: number | string; options?: readonly string[]; label?: string };
export type NodeDef = {
  type: NodeType;
  group: "Events" | "Actions" | "Logic" | "Values";
  label: string;
  help: string;
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
};

const execIn: PortDef = { name: "in", kind: "exec" };
const execOut: PortDef = { name: "out", kind: "exec" };
const num = (name: string): PortDef => ({ name, kind: "number" });

/** Comparisons return 1 or 0; "add" and "sub" return a + b and a - b, so a variable can count down (hearts, ammo). */
export const COMPARE_OPS = ["lt", "le", "gt", "ge", "eq", "ne", "add", "sub"] as const;
export const ENTITY_FIELDS = ["x", "y", "z", "vx", "vy", "vz", "grounded", "count"] as const;
export const DIRECTIONS = ["left", "right", "forward", "back", "up", "down"] as const;
/** "at_player" aims along the ground at the nearest player (enemies shooting at you). */
export const SHOOT_DIRECTIONS = ["facing", "forward", "back", "left", "right", "up", "arc", "at_player"] as const;

/**
 * Node catalog. Velocities are milli-units per tick (60 ticks per second), positions milli-units.
 * Entity selectors: a tag such as "player", or "a" / "b" for the two entities of an OnCollide event.
 */
export const CATALOG: Record<NodeType, NodeDef> = {
  OnStart: { type: "OnStart", group: "Events", label: "On start", help: "Runs once on the first tick.", inputs: [], outputs: [execOut], params: [] },
  OnKey: {
    type: "OnKey", group: "Events", label: "On key", help: "Runs when a key is pressed, or every tick while it is held.", inputs: [], outputs: [execOut],
    params: [
      { name: "key", kind: "key", default: "Space", options: KEYS },
      { name: "when", kind: "enum", default: "press", options: ["press", "held", "released"] },
    ],
  },
  OnTick: { type: "OnTick", group: "Events", label: "Every N ticks", help: "Runs every N ticks (60 ticks per second).", inputs: [], outputs: [execOut], params: [{ name: "everyN", kind: "int", default: 1 }] },
  OnCollide: {
    type: "OnCollide", group: "Events", label: "On collide", help: "Runs while an entity tagged A overlaps one tagged B. Use \"a\" and \"b\" as entity names after it.", inputs: [], outputs: [execOut],
    params: [{ name: "tagA", kind: "tag", default: "player" }, { name: "tagB", kind: "tag", default: "rock" }],
  },
  SetVelocity: {
    type: "SetVelocity", group: "Actions", label: "Set velocity", help: "Sets velocity in milli-units per tick (z is depth: negative moves away from the camera).", inputs: [execIn, num("vx"), num("vy"), num("vz")], outputs: [execOut],
    params: [{ name: "entity", kind: "tag", default: "player" }, { name: "vx", kind: "int", default: 0 }, { name: "vy", kind: "int", default: 0 }, { name: "vz", kind: "int", default: 0 }],
  },
  AddVelocity: {
    type: "AddVelocity", group: "Actions", label: "Add velocity", help: "Adds to velocity in milli-units per tick.", inputs: [execIn, num("vx"), num("vy"), num("vz")], outputs: [execOut],
    params: [{ name: "entity", kind: "tag", default: "player" }, { name: "vx", kind: "int", default: 0 }, { name: "vy", kind: "int", default: 0 }, { name: "vz", kind: "int", default: 0 }],
  },
  Spawn: {
    type: "Spawn", group: "Actions", label: "Spawn", help: "Spawns a prefab at x, y, z (milli-units). Applied at the end of the tick.", inputs: [execIn, num("x"), num("y"), num("z")], outputs: [execOut],
    params: [{ name: "prefab", kind: "string", default: "rock" }, { name: "x", kind: "int", default: 8000 }, { name: "y", kind: "int", default: 8000 }, { name: "z", kind: "int", default: 7700 }],
  },
  Destroy: { type: "Destroy", group: "Actions", label: "Destroy", help: "Removes the entity at the end of the tick.", inputs: [execIn], outputs: [execOut], params: [{ name: "entity", kind: "tag", default: "b" }] },
  AddScore: { type: "AddScore", group: "Actions", label: "Add score", help: "Adds to the score.", inputs: [execIn, num("n")], outputs: [execOut], params: [{ name: "n", kind: "int", default: 1 }] },
  SetVar: { type: "SetVar", group: "Actions", label: "Set variable", help: "Stores a number in a variable.", inputs: [execIn, num("value")], outputs: [execOut], params: [{ name: "name", kind: "string", default: "v" }, { name: "value", kind: "int", default: 0 }] },
  Win: { type: "Win", group: "Actions", label: "Win", help: "Ends the run as a win.", inputs: [execIn], outputs: [], params: [] },
  Lose: { type: "Lose", group: "Actions", label: "Lose", help: "Ends the run as a loss.", inputs: [execIn], outputs: [], params: [] },
  Branch: { type: "Branch", group: "Logic", label: "If", help: "Runs the true blocks when the condition is not zero, otherwise the false blocks, then continues with out.", inputs: [execIn, num("cond")], outputs: [{ name: "true", kind: "exec" }, { name: "false", kind: "exec" }, { name: "out", kind: "exec" }], params: [] },
  Compare: {
    type: "Compare", group: "Logic", label: "Compare", help: "Outputs 1 when the comparison holds, otherwise 0.", inputs: [num("a"), num("b")], outputs: [num("out")],
    params: [{ name: "op", kind: "enum", default: "lt", options: COMPARE_OPS }, { name: "a", kind: "int", default: 0 }, { name: "b", kind: "int", default: 0 }],
  },
  Const: { type: "Const", group: "Values", label: "Number", help: "A fixed number.", inputs: [], outputs: [num("out")], params: [{ name: "value", kind: "int", default: 0 }] },
  GetVar: { type: "GetVar", group: "Values", label: "Get variable", help: "Reads a variable (0 if unset).", inputs: [], outputs: [num("out")], params: [{ name: "name", kind: "string", default: "v" }] },
  Random: {
    type: "Random", group: "Values", label: "Random", help: "A seeded random integer between min and max, inclusive.", inputs: [], outputs: [num("out")],
    params: [{ name: "min", kind: "int", default: 0 }, { name: "max", kind: "int", default: 100 }, { name: "stream", kind: "string", default: "main" }],
  },
  EntityField: {
    type: "EntityField", group: "Values", label: "Entity field", help: "Reads x, y, vx, vy, grounded (0 or 1) or count of an entity.", inputs: [], outputs: [num("out")],
    params: [{ name: "entity", kind: "tag", default: "player" }, { name: "field", kind: "enum", default: "x", options: ENTITY_FIELDS }],
  },
  Move: {
    type: "Move", group: "Actions", label: "Move", help: "Sets the speed along one direction and leaves the other axes alone.", inputs: [execIn, num("speed")], outputs: [execOut],
    params: [{ name: "entity", kind: "tag", default: "player" }, { name: "direction", kind: "enum", default: "right", options: DIRECTIONS }, { name: "speed", kind: "int", default: 160 }],
  },
  Stop: {
    type: "Stop", group: "Actions", label: "Stop", help: "Sets the velocity on one axis (or all) to zero.", inputs: [execIn], outputs: [execOut],
    params: [{ name: "entity", kind: "tag", default: "player" }, { name: "axis", kind: "enum", default: "x", options: ["x", "z", "y", "ground", "all"] }],
  },
  Shoot: {
    type: "Shoot", group: "Actions", label: "Shoot", help: "Fires a prefab from the centre of an entity in a direction. Applied at the end of the tick.", inputs: [execIn, num("speed")], outputs: [execOut],
    params: [{ name: "prefab", kind: "string", default: "bolt" }, { name: "from", kind: "tag", default: "player" }, { name: "direction", kind: "enum", default: "facing", options: SHOOT_DIRECTIONS }, { name: "speed", kind: "int", default: 240 }],
  },
  Score: { type: "Score", group: "Values", label: "Score", help: "The current score.", inputs: [], outputs: [num("out")], params: [] },
};

export const EVENT_TYPES: ReadonlySet<NodeType> = new Set(["OnStart", "OnKey", "OnTick", "OnCollide"]);

const paramValue = z.union([z.number().int().min(-2_000_000_000).max(2_000_000_000), z.string().max(80), z.boolean()]);

export const nodeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  type: z.enum(NODE_TYPES),
  params: z.record(z.string().max(32), paramValue),
  authorId: z.string().regex(/^[a-z0-9_]{1,24}$/),
  originFork: z.string().max(64),
  pos: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const edgeSchema = z.object({
  from: z.object({ node: z.string().max(32), port: z.string().max(16) }),
  to: z.object({ node: z.string().max(32), port: z.string().max(16) }),
  kind: z.enum(["exec", "data"]),
});

const hex = /^#[0-9a-fA-F]{6}$/;
export const themeSchema = z.object({ sky: z.string().regex(hex), ground: z.string().regex(hex), accent: z.string().regex(hex) });

export const licenseSchema = z.union([
  z.object({ type: z.literal("free") }),
  z.object({ type: z.literal("paid"), priceLamports: z.number().int().positive().max(100_000_000_000) }),
]);

const tagRe = /^[a-z][a-z0-9_-]{0,23}$/;

/** Models a scene can use for looks and props (CC0 Kenney models, plus a few built shapes). */
export const MODEL_IDS = [
  "hero", "soldier", "drone", "tree", "trees", "bush", "grass", "cloud", "coin", "flag", "crate", "platform",
  "column", "column-broken", "statue", "trophy", "banner", "wall", "wall-low", "gate", "spear", "sword",
  "house", "shop", "fountain", "truck", "motorbike", "tents", "forest", "blaster", "ball", "hoop", "rock", "orb", "box", "pillar", "plane",
] as const;
export const SCENE_PRESETS = ["temple", "forest", "meadow", "city", "arena", "beach", "night", "space", "court", "volcano", "plain"] as const;
const HUD_SPOTS = ["top-left", "top-right", "top-center", "bottom-left", "bottom-right", "hidden"] as const;
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** A built-in model, or a free Poly Haven model found online ("ph:<id>"). */
export const modelRef = z.union([z.enum(MODEL_IDS), z.string().regex(/^ph:[A-Za-z0-9_]{1,80}$/)]);

/** Presentation only, never hashed: scene preset, how things look, decorative props, on-screen HUD. */
export const sceneSchema = z.object({
  preset: z.enum(SCENE_PRESETS).optional(),
  looks: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,23}$/), z.object({ model: modelRef.optional(), color: hexColor.optional(), scale: z.number().min(0.2).max(5).optional() })).optional(),
  props: z.array(z.object({ model: modelRef, x: z.number().int().min(-8000).max(24000), z: z.number().int().min(-8000).max(24000).optional(), y: z.number().int().min(0).max(18000).optional(), scale: z.number().min(0.2).max(8).optional(), rotate: z.number().min(-360).max(360).optional(), color: hexColor.optional() })).max(60).optional(),
  hud: z.object({ score: z.enum(HUD_SPOTS).optional(), timer: z.enum(HUD_SPOTS).optional(), scoreLabel: z.string().max(16).optional(), title: z.string().max(40).optional(), message: z.string().max(80).optional(),
    /** Show a variable as hearts (lives): its name, and how many hearts a full bar has. */
    hearts: z.string().max(24).optional(), heartsMax: z.number().int().min(1).max(10).optional() }).optional(),
});
export type Scene = z.infer<typeof sceneSchema>;
const size = z.number().int().min(50).max(16_000);
const speed = z.number().int().min(-2_000).max(2_000);
export const prefabDefSchema = z.object({
  tag: z.string().regex(tagRe), w: size, h: size, d: size.optional(),
  vx: speed, vy: speed, vz: speed.optional(), body: z.boolean().optional(), solid: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const graphSchema = z.object({
  schema: z.literal(GRAPH_SCHEMA),
  parent: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  root: z.string().max(64),
  kind: z.enum(["mechanic", "level"]),
  sources: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(8),
  title: z.string().min(1).max(80),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,24}$/)).max(8),
  license: licenseSchema,
  theme: themeSchema.optional(),
  /** Things this game defines for itself, by name. Gameplay, so part of the hash when present. */
  prefabs: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,23}$/), prefabDefSchema).refine((r) => Object.keys(r).length <= 24, "At most 24 custom prefabs.").optional(),
  /** Presentation only (not hashed): preset, looks, props and HUD. */
  scene: z.preprocess((v) => (v == null ? undefined : v), sceneSchema.optional()),
  /** Presentation only (not hashed): a side-on 2D camera or the third-person 3D camera. */
  view: z.preprocess((v) => (v == null || v === "" ? undefined : String(v).toLowerCase()), z.enum(["2d", "3d"]).optional()),
  nodes: z.array(nodeSchema).max(MAX_NODES),
  edges: z.array(edgeSchema).max(MAX_EDGES),
});

export type GraphNode = z.infer<typeof nodeSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type License = z.infer<typeof licenseSchema>;

export function param<T extends number | string>(node: GraphNode, name: string): T {
  const v = node.params[name];
  if (v !== undefined && typeof v !== "boolean") return v as T;
  const def = CATALOG[node.type].params.find((p) => p.name === name);
  return (def?.default ?? 0) as T;
}

export function portOf(type: NodeType, side: "in" | "out", port: string): PortDef | undefined {
  const def = CATALOG[type];
  return (side === "in" ? def.inputs : def.outputs).find((p) => p.name === port);
}

/** Explains why an edge between two ports is not allowed, or returns null if it is fine. */
export function connectionProblem(g: Pick<Graph, "nodes" | "edges">, e: Edge): string | null {
  const from = g.nodes.find((n) => n.id === e.from.node);
  const to = g.nodes.find((n) => n.id === e.to.node);
  if (!from || !to) return "Both ends must be existing nodes.";
  if (from.id === to.id) return "A node cannot connect to itself.";
  const out = portOf(from.type, "out", e.from.port);
  const inp = portOf(to.type, "in", e.to.port);
  if (!out) return `${CATALOG[from.type].label} has no output named ${e.from.port}.`;
  if (!inp) return `${CATALOG[to.type].label} has no input named ${e.to.port}.`;
  if (out.kind !== inp.kind) return out.kind === "exec" ? "A flow output can only connect to a flow input." : "A number output can only connect to a number input.";
  if ((out.kind === "exec") !== (e.kind === "exec")) return "Edge kind does not match the ports.";
  if (inp.kind === "number" && g.edges.some((x) => x.to.node === e.to.node && x.to.port === e.to.port && !(x.from.node === e.from.node && x.from.port === e.from.port))) {
    return "That number input already has a connection.";
  }
  if (createsCycle(g, e)) return "That connection would make a loop. Graphs must not loop.";
  return null;
}

function createsCycle(g: Pick<Graph, "edges">, e: Edge): boolean {
  const adj = new Map<string, string[]>();
  for (const x of [...g.edges, e]) {
    const list = adj.get(x.from.node) ?? [];
    list.push(x.to.node);
    adj.set(x.from.node, list);
  }
  const seen = new Set<string>();
  const stack = [e.to.node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === e.from.node) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(adj.get(n) ?? []));
  }
  return false;
}

/** Structural checks beyond zod: unique ids, valid ports, no cycles. Returns readable problems. */
export function validateGraph(g: Graph): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (ids.has(n.id)) problems.push(`Duplicate node id ${n.id}.`);
    ids.add(n.id);
  }
  const partial: Pick<Graph, "nodes" | "edges"> = { nodes: g.nodes, edges: [] };
  for (const e of g.edges) {
    const p = connectionProblem(partial, e);
    if (p) problems.push(`Edge ${e.from.node}.${e.from.port} to ${e.to.node}.${e.to.port}: ${p}`);
    else partial.edges.push(e);
  }
  return problems;
}

export function parseGraph(input: unknown): { ok: true; graph: Graph } | { ok: false; errors: string[] } {
  const r = graphSchema.safeParse(input);
  if (!r.success) return { ok: false, errors: r.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "graph"}: ${i.message}`) };
  const problems = validateGraph(r.data);
  if (problems.length) return { ok: false, errors: problems };
  return { ok: true, graph: r.data };
}

export function emptyGraph(authorId: string, kind: "mechanic" | "level" = "mechanic"): Graph {
  return { schema: GRAPH_SCHEMA, parent: null, root: "", kind, sources: [], title: "Untitled mechanic", tags: [], license: { type: "free" }, nodes: [], edges: [] };
}

/**
 * The camera a game should use when it does not say: 3D if anything uses depth (W/S keys, forward or back
 * movement, depth speeds or positions off the default plane), otherwise the classic side-on 2D view.
 */
export function viewOf(g: Pick<Graph, "nodes"> & { view?: "2d" | "3d" }): "2d" | "3d" {
  if (g.view) return g.view;
  for (const n of g.nodes) {
    if (n.type === "OnKey" && (n.params.key === "KeyW" || n.params.key === "KeyS")) return "3d";
    if (n.type === "Move" && (n.params.direction === "forward" || n.params.direction === "back")) return "3d";
    if ((n.type === "SetVelocity" || n.type === "AddVelocity") && Number(n.params.vz ?? 0) !== 0) return "3d";
    if (n.type === "Spawn" && n.params.z !== undefined && Number(n.params.z) !== 7700) return "3d";
  }
  return "2d";
}
