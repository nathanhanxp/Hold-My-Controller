import { parseGraph, type Edge, type Graph, type GraphNode } from "@forklab/engine";

/*
 * Prepared answers for the live demo: on a fork of Arena squad, the requests the demo makes (hearts, enemies that
 * shoot at you more slowly, an industrial look) are answered at once from blocks written here, instead of waiting
 * 10 to 40 seconds for a model. They come back as an ordinary proposal to Apply or Discard, labelled as cached.
 */

export type DemoIntent = { hearts: number | null; shooting: boolean; slow: boolean; industrial: boolean };

/** Which demo requests the words make. All false means: not a demo request, ask the model. */
export function demoIntent(prompt: string): DemoIntent {
  const p = prompt.toLowerCase();
  const heartWords = /\b(hearts?|lives|life|health|hp)\b/.test(p);
  const n = /\b(\d{1,2})\s*-?\s*(hearts?|lives|hp)\b/.exec(p);
  return {
    hearts: heartWords ? Math.max(1, Math.min(10, Number(n?.[1] ?? 5))) : null,
    shooting: /\bshoot|\bfire(ball)?s?\b|\bshots?\b|\bbullets?\b/.test(p),
    slow: /\b(slow|slower|lower speed|less speed|lower|weaker|easier)\b/.test(p),
    industrial: /\b(industrial|factory|steel|metal|warehouse|machin)/.test(p),
  };
}

/** A fork of Arena squad: the title says so, or it has the raiders, pillars and bolt the game is built from. */
export function isArenaSquad(g: Graph | null): g is Graph {
  if (!g) return false;
  if (/^arena squad\b/i.test(g.title)) return true;
  const has = (pred: (n: GraphNode) => boolean) => g.nodes.some(pred);
  return /^arena\b/i.test(g.title) && has((n) => n.type === "Spawn" && n.params.prefab === "raider") && has((n) => n.type === "Shoot" && n.params.prefab === "bolt");
}

/** A fork of Sky patrol: the title says so, or it flies the plane and spawns the drones it is built from. */
export function isSkyPatrol(g: Graph | null): g is Graph {
  if (!g) return false;
  if (/^sky patrol\b/i.test(g.title)) return true;
  return g.nodes.some((n) => n.type === "Spawn" && n.params.prefab === "plane") && g.nodes.some((n) => n.type === "Spawn" && n.params.prefab === "drone");
}

/** The games the demo's prepared answers know: Arena squad and Sky patrol, and forks of them. */
export const isDemoGame = (g: Graph | null): g is Graph => isArenaSquad(g) || isSkyPatrol(g);

const INDUSTRIAL_THEME = { sky: "#15191e", ground: "#7d8288", accent: "#f2a33a" };

export function demoProposal(prompt: string, current: Graph | null, editor: string): { graph: Graph; explanation: string } | null {
  if (!isDemoGame(current)) return null;
  const sky = isSkyPatrol(current);
  const foes = sky ? "drones" : "raiders";
  const want = demoIntent(prompt);
  if (want.hearts === null && !want.shooting && !want.industrial) return null;
  const g: Graph = structuredClone(current);
  const taken = new Set(g.nodes.map((n) => n.id));
  const id = (base: string) => { let k = base, i = 1; while (taken.has(k)) k = `${base}${i++}`; taken.add(k); return k; };
  const bottom = Math.max(0, ...g.nodes.map((n) => n.pos?.y ?? 0));
  let row = bottom + 160;
  const add = (type: GraphNode["type"], params: GraphNode["params"], col: number): string => {
    const nid = id(`d${type.slice(0, 2).toLowerCase()}`);
    g.nodes.push({ id: nid, type, params, authorId: editor, originFork: "", pos: { x: 30 + col * 300, y: row } });
    return nid;
  };
  const ex = (a: string, b: string, port = "out"): Edge => ({ from: { node: a, port }, to: { node: b, port: "in" }, kind: "exec" });
  const dx = (a: string, b: string, port: string): Edge => ({ from: { node: a, port: "out" }, to: { node: b, port }, kind: "data" });
  const said: string[] = [];

  if (want.shooting) {
    const speed = want.slow ? 110 : 170;
    g.prefabs = { ...(g.prefabs ?? {}), fireball: { tag: "hazard", w: 420, h: 420, d: 420, vx: 0, vy: 0, vz: 0, color: "#ff7a3a" } };
    const t = add("OnTick", { everyN: want.slow ? 120 : 90 }, 0);
    const s = add("Shoot", { prefab: "fireball", from: "enemy", direction: "at_player", speed }, 1);
    g.edges.push(ex(t, s));
    row += 140;
    // a fireball that reaches the player is gone; it costs a heart below, or ends the run without hearts
    if (want.hearts === null) {
      const c = add("OnCollide", { tagA: "player", tagB: "hazard" }, 0);
      const l = add("Lose", {}, 1);
      g.edges.push(ex(c, l));
      row += 140;
    }
    said.push(`${foes} shoot ${want.slow ? "slow " : ""}fireballs at you every ${want.slow ? 2 : 1.5} seconds`);
  }

  if (want.hearts !== null) {
    const n = want.hearts;
    const st = add("OnStart", {}, 0);
    const set = add("SetVar", { name: "hp", value: n }, 1);
    g.edges.push(ex(st, set));
    row += 140;
    // losing a heart: from a fireball (if there are any) and from a raider reaching you, which used to end the run
    const hit = (tagB: string) => {
      const c = add("OnCollide", { tagA: "player", tagB }, 0);
      const sv = add("SetVar", { name: "hp", value: 0 }, 1);
      const sub = add("Compare", { op: "sub", a: 0, b: 1 }, 2);
      const get = add("GetVar", { name: "hp" }, 3);
      const kill = add("Destroy", { entity: "b" }, 2);
      g.edges.push(ex(c, sv), dx(sub, sv, "value"), dx(get, sub, "a"), ex(sv, kill));
      row += 160;
    };
    if (want.shooting || g.prefabs?.fireball) hit("hazard");
    const instant = g.nodes.find((x) => x.type === "OnCollide" && x.params.tagA === "player" && x.params.tagB === "enemy");
    if (instant) {
      const lose = g.edges.filter((e) => e.from.node === instant.id && g.nodes.find((x) => x.id === e.to.node)?.type === "Lose").map((e) => e.to.node);
      g.edges = g.edges.filter((e) => e.from.node !== instant.id);
      g.nodes = g.nodes.filter((x) => x.id !== instant.id && !lose.includes(x.id));
    }
    hit("enemy");
    const tick = add("OnTick", { everyN: 1 }, 0);
    const br = add("Branch", {}, 1);
    const le = add("Compare", { op: "le", a: 0, b: 0 }, 2);
    const get = add("GetVar", { name: "hp" }, 3);
    const lose = add("Lose", {}, 2);
    g.edges.push(ex(tick, br), dx(le, br, "cond"), dx(get, le, "a"), ex(br, lose, "true"));
    g.scene = { ...(g.scene ?? {}), hud: { ...(g.scene?.hud ?? {}), hearts: "hp", heartsMax: n } };
    said.push(`you have ${n} hearts on screen; a fireball or a ${foes.slice(0, -1)} takes one, and the run ends at zero`);
  }

  if (want.industrial) {
    g.theme = INDUSTRIAL_THEME;
    if (sky) {
      // over a factory district: smokestacks of crates and walls below, grey sky, drones in steel
      g.scene = {
        ...(g.scene ?? {}),
        preset: "city",
        looks: { ...(g.scene?.looks ?? {}), drone: { model: "drone", color: "#c9ced4", scale: 1.2 }, enemy: { model: "drone", color: "#c9ced4" }, fireball: { model: "orb", color: "#ff7a3a" }, plane: { model: "plane", color: "#d6dbe0", scale: 1.3 } },
        props: [
          { model: "shop", x: 1500, z: -2500 }, { model: "house", x: 5000, z: -2600 }, { model: "shop", x: 11000, z: -2500 }, { model: "house", x: 14500, z: -2600 },
          { model: "truck", x: -1800, z: 4000, rotate: 90 }, { model: "truck", x: 17800, z: 9000, rotate: -90 },
          { model: "crate", x: -1500, z: 11000, scale: 1.4 }, { model: "box", x: 17500, z: 2500, scale: 1.4 },
          { model: "pillar", x: 3000, z: -4000, scale: 1.8, color: "#6b6f73" }, { model: "pillar", x: 13000, z: -4000, scale: 2, color: "#6b6f73" },
        ],
      };
      said.push("an industrial skyline: steel grey, factories and smokestacks below, steel drones");
    } else {
    g.scene = {
      ...(g.scene ?? {}),
      preset: "city",
      looks: { ...(g.scene?.looks ?? {}), pillar: { model: "crate", color: "#8a6a3a", scale: 1.4 }, enemy: { model: "drone", color: "#c9ced4" }, fireball: { model: "orb", color: "#ff7a3a" } },
      props: [
        { model: "truck", x: -1800, z: 3000, rotate: 90 }, { model: "truck", x: 17800, z: 9000, rotate: -90 },
        { model: "crate", x: 1200, z: -1400 }, { model: "crate", x: 2200, z: -1500, scale: 1.3 }, { model: "box", x: 14200, z: -1400 },
        { model: "wall", x: 6000, z: -2200 }, { model: "wall", x: 10000, z: -2200 }, { model: "pillar", x: -1500, z: 12000 }, { model: "pillar", x: 17500, z: 2000 },
      ],
    };
    said.push("an industrial yard: steel grey, crates for cover, drones for raiders");
    }
  }

  const ok = parseGraph(g);
  if (!ok.ok) return null;
  const text = said.join("; ");
  return { graph: g, explanation: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };
}
