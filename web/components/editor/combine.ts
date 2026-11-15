import { viewOf, type Edge, type Graph, type GraphNode, type PrefabDef, type Theme } from "@forklab/engine";

/*
 * Combining: put blocks from other free games, things (prefabs) and looks (themes) into the game you're editing.
 * Borrowed blocks keep their author and point at the game they came from (the graph lists it in `sources`), so
 * when you publish, every borrowed creator is credited and paid for the blocks of theirs that run.
 */

export type SourceGame = { hash: string; title: string; graph: Graph };
export type PrefabPick = { title: string; prefab: PrefabDef };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "thing";

export function combine(current: Graph, games: SourceGame[], prefabs: PrefabPick[], theme: Theme | null, editor: string): { graph: Graph; lines: string[] } {
  const g: Graph = structuredClone(current);
  g.prefabs = { ...(g.prefabs ?? {}) };
  const lines: string[] = [];
  const taken = new Set(g.nodes.map((n) => n.id));
  const right = () => Math.max(0, ...g.nodes.map((n) => (n.pos?.x ?? 0) + 280)) + 120;
  const spawnsPlayer = (x: Graph) => x.nodes.some((n) => n.type === "Spawn" && (n.params.prefab === "player" || x.prefabs?.[String(n.params.prefab)]?.tag === "player"));

  games.forEach((src, k) => {
    const s = src.graph;
    // prefabs: same name and same shape is shared; a clash gets a new name, and the borrowed blocks follow it
    const rename = new Map<string, string>();
    for (const [name, def] of Object.entries(s.prefabs ?? {})) {
      const mine = g.prefabs![name];
      if (!mine) g.prefabs![name] = def;
      else if (JSON.stringify(mine) !== JSON.stringify(def)) {
        let n = `${name}_${k + 2}`;
        while (g.prefabs![n]) n += "x";
        g.prefabs![n] = def;
        rename.set(name, n);
      }
    }
    // a second player would be odd: when this game already spawns one, the borrowed player spawn is left out
    const skip = new Set(spawnsPlayer(g) ? s.nodes.filter((n) => n.type === "Spawn" && (n.params.prefab === "player" || s.prefabs?.[String(n.params.prefab)]?.tag === "player")).map((n) => n.id) : []);
    const ids = new Map<string, string>();
    const x0 = right();
    const minX = Math.min(...s.nodes.map((n) => n.pos?.x ?? 0));
    for (const n of s.nodes) {
      if (skip.has(n.id)) continue;
      let id = `${n.id}_${k + 1}`;
      while (taken.has(id)) id += "b";
      taken.add(id);
      ids.set(n.id, id);
      const params = { ...n.params };
      if (typeof params.prefab === "string" && rename.has(params.prefab)) params.prefab = rename.get(params.prefab)!;
      const node: GraphNode = { ...n, id, params, originFork: src.hash, pos: { x: x0 + ((n.pos?.x ?? 0) - minX), y: n.pos?.y ?? 0 } };
      g.nodes.push(node);
    }
    const edges: Edge[] = [];
    for (const e of s.edges) {
      const a = ids.get(e.from.node), b = ids.get(e.to.node);
      if (a && b) edges.push({ ...e, from: { ...e.from, node: a }, to: { ...e.to, node: b } });
    }
    // keep a chain whole around a left-out player spawn: whatever came before it now leads to what came after
    for (const sp of skip) {
      const ins = s.edges.filter((e) => e.kind === "exec" && e.to.node === sp);
      const outs = s.edges.filter((e) => e.kind === "exec" && e.from.node === sp);
      for (const i of ins) for (const o of outs) {
        const a = ids.get(i.from.node), b = ids.get(o.to.node);
        if (a && b) edges.push({ from: { node: a, port: i.from.port }, to: { node: b, port: o.to.port }, kind: "exec" });
      }
    }
    g.edges.push(...edges);
    g.sources = [...new Set([...(g.sources ?? []), src.hash])].sort();
    // presentation: borrowed things keep their looks unless this game already dresses them
    if (s.scene?.looks) g.scene = { ...(g.scene ?? {}), looks: { ...s.scene.looks, ...(g.scene?.looks ?? {}) } };
    if (!g.scene?.preset && s.scene?.preset) g.scene = { ...(g.scene ?? {}), preset: s.scene.preset };
    lines.push(`${ids.size} blocks from ${src.title}${skip.size ? " (its player spawn left out: this game already has one)" : ""}`);
  });

  // things arrive in the game, not just in the list: one "when the game starts" block creates each of them,
  // spread across the play area (falling things start high so they drop in)
  if (prefabs.length) {
    const is3d = viewOf(g) === "3d";
    let sid = "lib_start";
    while (taken.has(sid)) sid += "b";
    taken.add(sid);
    const x0 = right();
    g.nodes.push({ id: sid, type: "OnStart", params: {}, authorId: editor, originFork: "", pos: { x: x0, y: 0 } });
    let prev = sid;
    prefabs.forEach((p, i) => {
      let name = slug(p.title);
      while (g.prefabs![name] && JSON.stringify(g.prefabs![name]) !== JSON.stringify(p.prefab)) name += "_2";
      g.prefabs![name] = p.prefab;
      let id = `lib_${name}`;
      while (taken.has(id)) id += "b";
      taken.add(id);
      const x = Math.round(((i + 1) * 16000) / (prefabs.length + 1) - p.prefab.w / 2);
      const y = p.prefab.vy < 0 ? 7000 : 0;
      const params: GraphNode["params"] = is3d ? { prefab: name, x, y, z: 6000 } : { prefab: name, x, y };
      g.nodes.push({ id, type: "Spawn", params, authorId: editor, originFork: "", pos: { x: x0, y: 140 * (i + 1) } });
      g.edges.push({ from: { node: prev, port: "out" }, to: { node: id, port: "in" }, kind: "exec" });
      prev = id;
      lines.push(`${p.title}, created when the game starts`);
    });
  }

  if (theme) { g.theme = theme; lines.push("its colours"); }
  return { graph: g, lines };
}
