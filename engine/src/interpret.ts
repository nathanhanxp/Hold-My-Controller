import { add32, clampState, toInt } from "./fixed";
import { hashOf } from "./hash";
import { SeededRng } from "./rng";
import { keyBit, param, type Graph, type GraphNode } from "./schema";
import { BUILTIN_PREFABS, DEFAULT_Z, MAX_ENTITIES, collidingPairs, integrate, makeEntity, type Entity, type PrefabDef } from "./world";

/*
 * Interpreter order per tick (the C# exporter uses the same order):
 *   1. read inputs (key mask for this tick; "pressed" = down now and not last tick; "released" = the reverse)
 *   2. for each program in order (level first, then mechanic, when composed):
 *        OnStart (tick 0 only), then OnKey handlers, then OnTick handlers
 *   3. integrate movement (entities in id order, bodies resolved against solids and the arena)
 *   4. collisions: for each program in order, each OnCollide handler (node id order),
 *        each overlapping pair (ids ascending) runs the handler with a = tagA entity, b = tagB entity
 *   5. apply deferred spawns (in the order requested), then deferred destroys
 * Handlers run in node id order. Multiple exec edges from one output run in target id order.
 * A run ends at the end of the tick in which Win or Lose fires (first one wins), or at maxTicks.
 */

export const MAX_STEPS_PER_TICK = 4096;

export type Program = {
  ns: string;
  graph: Graph;
  byId: Map<string, GraphNode>;
  execNext: Map<string, string[]>; // "node\0port" -> target ids
  dataIn: Map<string, { node: string; port: string }>; // "node\0port" -> source
  onStart: GraphNode[];
  onKey: GraphNode[];
  onTick: GraphNode[];
  onCollide: GraphNode[];
  suppressStartSpawns: boolean;
};

const k = (node: string, port: string) => `${node}\u0000${port}`;
const byIdOrder = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function compile(graph: Graph, ns = "mech", opts: { suppressStartSpawns?: boolean } = {}): Program {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const execNext = new Map<string, string[]>();
  const dataIn = new Map<string, { node: string; port: string }>();
  for (const e of graph.edges) {
    if (!byId.has(e.from.node) || !byId.has(e.to.node)) continue;
    if (e.kind === "exec") {
      const list = execNext.get(k(e.from.node, e.from.port)) ?? [];
      list.push(e.to.node);
      execNext.set(k(e.from.node, e.from.port), list);
    } else {
      dataIn.set(k(e.to.node, e.to.port), { node: e.from.node, port: e.from.port });
    }
  }
  for (const list of execNext.values()) list.sort();
  const sorted = [...graph.nodes].sort(byIdOrder);
  return {
    ns, graph, byId, execNext, dataIn,
    onStart: sorted.filter((n) => n.type === "OnStart"),
    onKey: sorted.filter((n) => n.type === "OnKey"),
    onTick: sorted.filter((n) => n.type === "OnTick"),
    onCollide: sorted.filter((n) => n.type === "OnCollide"),
    suppressStartSpawns: !!opts.suppressStartSpawns,
  };
}

export type SimStatus = "running" | "win" | "lose";
export type Snapshot = {
  tick: number;
  score: number;
  status: SimStatus;
  vars: Record<string, number>;
  entities: Array<{ id: number; tag: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; alive: boolean }>;
};

type Ctx = { a?: Entity; b?: Entity; inStart: boolean };

/** Integer square root, exact for the ranges the world uses (same in the C# export). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r -= 1;
  while ((r + 1) * (r + 1) <= n) r += 1;
  return r;
}

/** Velocity of length `sp` along the ground from `e` toward the nearest player (lowest id wins a tie). */
export function aimAt(e: { id: number; x: number; z: number; w: number; d: number }, all: Array<{ id: number; tag: string; x: number; z: number; w: number; d: number }>, sp: number): [number, number, number] {
  const cx = e.x + Math.trunc(e.w / 2), cz = e.z + Math.trunc(e.d / 2);
  let best: { dx: number; dz: number; d2: number } | null = null;
  for (const o of all) {
    if (o.tag !== "player" || o.id === e.id) continue;
    const dx = o.x + Math.trunc(o.w / 2) - cx, dz = o.z + Math.trunc(o.d / 2) - cz;
    const d2 = dx * dx + dz * dz;
    if (!best || d2 < best.d2) best = { dx, dz, d2 };
  }
  if (!best || best.d2 === 0) return [0, 0, sp];
  const len = isqrt(best.d2);
  return [Math.trunc((best.dx * sp) / len), 0, Math.trunc((best.dz * sp) / len)];
}

export class Sim {
  tick = 0;
  score = 0;
  status: SimStatus = "running";
  entities: Entity[] = [];
  vars = new Map<string, number>();
  readonly rng: SeededRng;
  private nextId = 1;
  private prevMask = 0;
  private mask = 0;
  private spawns: Array<{ prefab: string; x: number; y: number; z: number; v?: [number, number, number]; owner?: string }> = [];
  private destroys = new Set<number>();
  private steps = 0;

  /** Built-ins, then each program's own prefabs (in program order), then any passed in. */
  readonly prefabs: Record<string, PrefabDef>;

  constructor(readonly programs: Program[], readonly seed: number, prefabs: Record<string, PrefabDef> = {}) {
    this.rng = new SeededRng(seed);
    this.prefabs = Object.assign({}, ...programs.map((p) => p.graph.prefabs ?? {}), prefabs);
  }

  /** Advance one tick with the given key mask. No-op once the run has ended. */
  step(mask: number): void {
    if (this.status !== "running") return;
    this.mask = mask >>> 0;
    const pressed = this.mask & ~this.prevMask;
    const released = this.prevMask & ~this.mask;
    for (const p of this.programs) {
      this.steps = 0;
      if (this.tick === 0) for (const n of p.onStart) this.runExec(p, n.id, "out", { inStart: true });
      for (const n of p.onKey) {
        const bit = keyBit(String(param(n, "key")));
        const when = String(param(n, "when"));
        const fire = when === "held" ? (this.mask & bit) !== 0 : when === "released" ? (released & bit) !== 0 : (pressed & bit) !== 0;
        if (bit && fire) this.runExec(p, n.id, "out", { inStart: false });
      }
      for (const n of p.onTick) {
        const every = Math.max(1, toInt(param(n, "everyN")));
        if (this.tick % every === 0) this.runExec(p, n.id, "out", { inStart: false });
      }
    }
    const gone = integrate(this.entities);
    for (const id of gone) this.destroys.add(id);
    for (const p of this.programs) {
      this.steps = 0;
      for (const n of p.onCollide) {
        const pairs = collidingPairs(this.entities, String(param(n, "tagA")), String(param(n, "tagB")));
        for (const [a, b] of pairs) this.runExec(p, n.id, "out", { a, b, inStart: false });
      }
    }
    for (const s of this.spawns) this.spawnNow(s.prefab, s.x, s.y, s.z, s.v, s.owner);
    this.spawns = [];
    if (this.destroys.size) {
      this.entities = this.entities.filter((e) => !this.destroys.has(e.id));
      this.destroys.clear();
    }
    this.prevMask = this.mask;
    this.tick += 1;
  }

  spawnNow(prefab: string, x: number, y: number, z: number = DEFAULT_Z, v?: [number, number, number], owner?: string): void {
    const def = this.prefabs[prefab] ?? BUILTIN_PREFABS[prefab];
    if (!def || this.entities.length >= MAX_ENTITIES) return;
    const e = makeEntity(this.nextId++, prefab, def, x, y, z);
    if (owner !== undefined) e.owner = owner;
    if (v) { e.vx = clampState(v[0]); e.vy = clampState(v[1]); e.vz = clampState(v[2]); }
    this.entities.push(e);
  }

  snapshot(): Snapshot {
    const vars: Record<string, number> = {};
    for (const key of [...this.vars.keys()].sort()) vars[key] = this.vars.get(key)!;
    return {
      tick: this.tick,
      score: this.score,
      status: this.status,
      vars,
      entities: this.entities.map((e) => ({ id: e.id, tag: e.tag, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, alive: e.alive })),
    };
  }

  private runExec(p: Program, nodeId: string, port: string, ctx: Ctx): void {
    const targets = p.execNext.get(k(nodeId, port));
    if (!targets) return;
    for (const t of targets) this.execNode(p, t, ctx);
  }

  private execNode(p: Program, id: string, ctx: Ctx): void {
    if (++this.steps > MAX_STEPS_PER_TICK) return;
    const n = p.byId.get(id);
    if (!n) return;
    switch (n.type) {
      case "SetVelocity":
      case "AddVelocity": {
        const vx = this.input(p, n, "vx", ctx);
        const vy = this.input(p, n, "vy", ctx);
        const vz = this.input(p, n, "vz", ctx);
        for (const e of this.select(String(param(n, "entity")), ctx)) {
          if (n.type === "SetVelocity") { e.vx = clampState(vx); e.vy = clampState(vy); e.vz = clampState(vz); }
          else { e.vx = clampState(e.vx + vx); e.vy = clampState(e.vy + vy); e.vz = clampState(e.vz + vz); }
        }
        break;
      }
      case "Move": {
        const sp = this.input(p, n, "speed", ctx);
        const dir = String(param(n, "direction"));
        for (const e of this.select(String(param(n, "entity")), ctx)) {
          if (dir === "left") e.vx = clampState(-sp);
          else if (dir === "right") e.vx = clampState(sp);
          else if (dir === "forward") e.vz = clampState(-sp);
          else if (dir === "back") e.vz = clampState(sp);
          else if (dir === "up") e.vy = clampState(sp);
          else if (dir === "down") e.vy = clampState(-sp);
        }
        break;
      }
      case "Stop": {
        const axis = String(param(n, "axis"));
        for (const e of this.select(String(param(n, "entity")), ctx)) {
          if (axis === "x" || axis === "ground" || axis === "all") e.vx = 0;
          if (axis === "z" || axis === "ground" || axis === "all") e.vz = 0;
          if (axis === "y" || axis === "all") e.vy = 0;
        }
        break;
      }
      case "Shoot": {
        const name = String(param(n, "prefab"));
        const def = this.prefabs[name] ?? BUILTIN_PREFABS[name];
        const dir = String(param(n, "direction"));
        if (def) {
          const sp = this.input(p, n, "speed", ctx);
          const pd = def.d ?? def.w;
          for (const e of this.select(String(param(n, "from")), ctx)) {
            let dx = 0, dy = 0, dz = 0;
            if (dir === "facing") { dx = e.fx; dz = e.fz; if (dx === 0 && dz === 0) dz = -1; }
            else if (dir === "forward") dz = -1;
            else if (dir === "back") dz = 1;
            else if (dir === "left") dx = -1;
            else if (dir === "right") dx = 1;
            else if (dir === "up") dy = 1;
            // arc: a lob the way you face, as much up as forward (pair with gravity on the shot)
            else if (dir === "arc") { dx = e.fx; dz = e.fz; if (dx === 0 && dz === 0) dz = -1; dy = 1; }
            let v: [number, number, number] = [dx * sp, dy * sp, dz * sp];
            if (dir === "at_player") v = aimAt(e, this.entities, sp);
            this.spawns.push({
              prefab: name,
              x: e.x + Math.trunc(e.w / 2) - Math.trunc(def.w / 2),
              y: e.y + Math.trunc(e.h / 2) - Math.trunc(def.h / 2),
              z: e.z + Math.trunc(e.d / 2) - Math.trunc(pd / 2),
              v,
              owner: e.tag,
            });
          }
        }
        break;
      }
      case "Spawn": {
        if (!(ctx.inStart && p.suppressStartSpawns)) {
          this.spawns.push({ prefab: String(param(n, "prefab")), x: this.input(p, n, "x", ctx), y: this.input(p, n, "y", ctx), z: this.input(p, n, "z", ctx) });
        }
        break;
      }
      case "Destroy":
        for (const e of this.select(String(param(n, "entity")), ctx)) this.destroys.add(e.id);
        break;
      case "AddScore":
        this.score = add32(this.score, this.input(p, n, "n", ctx));
        break;
      case "SetVar":
        this.vars.set(`${p.ns}.${String(param(n, "name"))}`, this.input(p, n, "value", ctx));
        break;
      case "Win":
      case "Lose":
        if (this.status === "running") this.status = n.type === "Win" ? "win" : "lose";
        return;
      case "Branch": {
        const c = this.input(p, n, "cond", ctx);
        this.runExec(p, n.id, c !== 0 ? "true" : "false", ctx);
        break; // then continue with "out", like the block after an if/else
      }
      default:
        return; // events and value nodes do nothing when reached by exec
    }
    this.runExec(p, n.id, "out", ctx);
  }

  /** Value of a number input: the connected node's output, else the node's own param of the same name. */
  private input(p: Program, n: GraphNode, port: string, ctx: Ctx): number {
    const src = p.dataIn.get(k(n.id, port));
    if (src) return this.evalValue(p, src.node, ctx, 0);
    return toInt(n.params[port] ?? param(n, port));
  }

  private evalValue(p: Program, id: string, ctx: Ctx, depth: number): number {
    if (depth > 64 || ++this.steps > MAX_STEPS_PER_TICK) return 0;
    const n = p.byId.get(id);
    if (!n) return 0;
    const sub = (port: string) => {
      const src = p.dataIn.get(k(n.id, port));
      return src ? this.evalValue(p, src.node, ctx, depth + 1) : toInt(n.params[port] ?? param(n, port));
    };
    switch (n.type) {
      case "Const": return toInt(param(n, "value"));
      case "Score": return this.score;
      case "GetVar": return this.vars.get(`${p.ns}.${String(param(n, "name"))}`) ?? 0;
      case "Random": {
        const min = toInt(param(n, "min"));
        const max = toInt(param(n, "max"));
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        return this.rng.stream(`${p.ns}:${String(param(n, "stream")) || "main"}`).nextInt(lo, hi + 1);
      }
      case "Compare": {
        const a = sub("a");
        const b = sub("b");
        switch (String(param(n, "op"))) {
          case "lt": return a < b ? 1 : 0;
          case "le": return a <= b ? 1 : 0;
          case "gt": return a > b ? 1 : 0;
          case "ge": return a >= b ? 1 : 0;
          case "eq": return a === b ? 1 : 0;
          case "ne": return a !== b ? 1 : 0;
          case "add": return add32(a, b);
          case "sub": return add32(a, -b);
          default: return 0;
        }
      }
      case "EntityField": {
        const sel = this.select(String(param(n, "entity")), ctx);
        const field = String(param(n, "field"));
        if (field === "count") return sel.length;
        const e = sel[0];
        if (!e) return 0;
        switch (field) {
          case "x": return e.x;
          case "y": return e.y;
          case "z": return e.z;
          case "vz": return e.vz;
          case "vx": return e.vx;
          case "vy": return e.vy;
          case "grounded": return e.grounded ? 1 : 0;
          default: return 0;
        }
      }
      default: return 0;
    }
  }

  private select(name: string, ctx: Ctx): Entity[] {
    if (name === "a") return ctx.a && ctx.a.alive ? [ctx.a] : [];
    if (name === "b") return ctx.b && ctx.b.alive ? [ctx.b] : [];
    return this.entities.filter((e) => e.alive && e.tag === name);
  }
}

export function snapshotHash(s: Snapshot): string {
  return hashOf(s);
}

/** Expand a sparse input list ([[tick, mask], ...] where the mask changes) into a mask per tick. */
export function maskAt(inputs: Array<[number, number]>): (tick: number) => number {
  let i = 0;
  let cur = 0;
  return (tick: number) => {
    while (i < inputs.length && inputs[i][0] <= tick) cur = inputs[i++][1];
    return cur;
  };
}

/** Run a single graph headless and return a snapshot every `every` ticks plus the final one. */
export function runGraph(graph: Graph, seed: number, inputs: Array<[number, number]>, ticks: number, every = 60, prefabs: Record<string, PrefabDef> = {}): Snapshot[] {
  const sim = new Sim([compile(graph, "mech")], seed, prefabs);
  const mask = maskAt(inputs);
  const out: Snapshot[] = [];
  for (let t = 0; t < ticks && sim.status === "running"; t += 1) {
    sim.step(mask(t));
    if (sim.tick % every === 0) out.push(sim.snapshot());
  }
  if (out.length === 0 || out[out.length - 1].tick !== sim.tick) out.push(sim.snapshot());
  return out;
}
