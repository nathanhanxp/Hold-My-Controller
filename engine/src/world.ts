import { clampState } from "./fixed";

/**
 * Arena in milli-units: 16 units wide (x), 9 tall (y, up), 16 deep (z). (0,0,0) is the left, floor, far corner;
 * the camera looks from large z toward small z, so "forward" is -z and W moves the player away from the camera.
 */
export const WORLD_W = 16_000;
export const WORLD_H = 9_000;
export const WORLD_D = 16_000;
/** Default depth for entities spawned without a z: the middle lane. */
export const DEFAULT_Z = 7_700;
/** Non-body entities further than this outside the arena are removed at the end of the tick. */
export const OFFSCREEN_MARGIN = 3_000;
export const MAX_ENTITIES = 256;

export type PrefabDef = { tag: string; w: number; h: number; d?: number; vx: number; vy: number; vz?: number; body?: boolean; solid?: boolean; color: string };

/** Built-in prefabs. Colors are render-only and never part of the simulation state. */
export const BUILTIN_PREFABS: Record<string, PrefabDef> = {
  player: { tag: "player", w: 600, h: 600, vx: 0, vy: 0, body: true, color: "#ECE6D8" },
  rock: { tag: "rock", w: 500, h: 500, vx: 0, vy: -90, color: "#9AA4B2" },
  coin: { tag: "coin", w: 400, h: 400, vx: 0, vy: 0, color: "#E2B75A" },
  enemy: { tag: "enemy", w: 600, h: 600, vx: -70, vy: 0, color: "#EC7448" },
  raider: { tag: "enemy", w: 700, h: 700, vx: 0, vy: 0, vz: 70, color: "#EC7448" },
  hurdle: { tag: "hurdle", w: 2600, h: 500, d: 500, vx: 0, vy: 0, vz: 150, color: "#A8957A" },
  sacred: { tag: "sacred", w: 700, h: 700, vx: 0, vy: 0, color: "#D27A45" },
  goal: { tag: "goal", w: 600, h: 1200, vx: 0, vy: 0, color: "#9CC27A" },
  platform: { tag: "platform", w: 3000, h: 300, d: 3000, vx: 0, vy: 0, solid: true, color: "#A8957A" },
  wall: { tag: "wall", w: 400, h: 3000, vx: 0, vy: 0, solid: true, color: "#A8957A" },
  pillar: { tag: "wall", w: 900, h: 4000, d: 900, vx: 0, vy: 0, solid: true, color: "#D8CCB6" },
  pipe: { tag: "pipe", w: 900, h: 3000, vx: -80, vy: 0, color: "#9CC27A" },
  bolt: { tag: "bolt", w: 250, h: 250, vx: 180, vy: 0, color: "#5FC3E4" },
};

export type Entity = {
  id: number;
  tag: string;
  prefab: string;
  x: number; y: number; z: number; w: number; h: number; d: number;
  vx: number; vy: number; vz: number;
  /** Facing direction on the ground plane, each -1, 0 or 1; set by the last horizontal movement. */
  fx: number; fz: number;
  body: boolean; solid: boolean; grounded: boolean;
  alive: boolean;
  /** Tag of the entity that fired this one (Shoot). A shot never collides with things of its shooter's tag. */
  owner?: string;
};

export function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h && a.z < b.z + b.d && b.z < a.z + a.d;
}

export function makeEntity(id: number, prefabName: string, def: PrefabDef, x: number, y: number, z: number = DEFAULT_Z): Entity {
  return {
    id, tag: def.tag, prefab: prefabName,
    x: clampState(x), y: clampState(y), z: clampState(z), w: def.w, h: def.h, d: def.d ?? def.w,
    vx: def.vx, vy: def.vy, vz: def.vz ?? 0, fx: 1, fz: 0,
    body: !!def.body, solid: !!def.solid, grounded: false, alive: true,
  };
}

const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * Integrate one tick. Entities move in id order. Bodies move x, then z, then y; each axis is pushed out of solids.
 * Bodies stand on the floor (y = 0), stop at the ceiling and stay inside the arena walls.
 * Returns ids of non-body entities that left the arena (removed with the deferred destroys).
 */
export function integrate(entities: Entity[]): number[] {
  const solids = entities.filter((e) => e.alive && e.solid);
  const gone: number[] = [];
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.vx !== 0 || e.vz !== 0) { e.fx = sign(e.vx); e.fz = sign(e.vz); }
    if (!e.body) {
      e.x = clampState(e.x + e.vx);
      e.y = clampState(e.y + e.vy);
      e.z = clampState(e.z + e.vz);
      if (e.x + e.w < -OFFSCREEN_MARGIN || e.x > WORLD_W + OFFSCREEN_MARGIN || e.y + e.h < -OFFSCREEN_MARGIN || e.y > WORLD_H + OFFSCREEN_MARGIN || e.z + e.d < -OFFSCREEN_MARGIN || e.z > WORLD_D + OFFSCREEN_MARGIN) gone.push(e.id);
      continue;
    }
    e.x = clampState(e.x + e.vx);
    for (const s of solids) {
      if (s.id !== e.id && overlaps(e, s)) {
        if (e.vx > 0) e.x = s.x - e.w;
        else if (e.vx < 0) e.x = s.x + s.w;
        e.vx = 0;
      }
    }
    // the world's edges stop the body but keep its speed and direction, so "which way am I going" still reads true
    // against a wall (a turn-around key works at either edge). Solids still stop it dead.
    if (e.x < 0) e.x = 0;
    if (e.x > WORLD_W - e.w) e.x = WORLD_W - e.w;
    e.z = clampState(e.z + e.vz);
    for (const s of solids) {
      if (s.id !== e.id && overlaps(e, s)) {
        if (e.vz > 0) e.z = s.z - e.d;
        else if (e.vz < 0) e.z = s.z + s.d;
        e.vz = 0;
      }
    }
    if (e.z < 0) e.z = 0;
    if (e.z > WORLD_D - e.d) e.z = WORLD_D - e.d;
    e.y = clampState(e.y + e.vy);
    e.grounded = false;
    for (const s of solids) {
      if (s.id !== e.id && overlaps(e, s)) {
        if (e.vy <= 0) { e.y = s.y + s.h; e.grounded = true; }
        else e.y = s.y - e.h;
        e.vy = 0;
      }
    }
    if (e.y <= 0) { e.y = 0; if (e.vy < 0) e.vy = 0; e.grounded = true; }
    if (e.y > WORLD_H - e.h) { e.y = WORLD_H - e.h; if (e.vy > 0) e.vy = 0; }
  }
  return gone;
}

/** Overlapping pairs (a tagged tagA, b tagged tagB), a and b in ascending id order. */
export function collidingPairs(entities: Entity[], tagA: string, tagB: string): Array<[Entity, Entity]> {
  const as = entities.filter((e) => e.alive && e.tag === tagA);
  const bs = entities.filter((e) => e.alive && e.tag === tagB);
  const out: Array<[Entity, Entity]> = [];
  for (const a of as) for (const b of bs) if (a.id !== b.id && a.owner !== b.tag && b.owner !== a.tag && overlaps(a, b)) out.push([a, b]);
  return out;
}
