import { countedNodes } from "./attribution";
import { NODE_TYPES, param, type Graph } from "./schema";

export const STRUCTURE_DIM = NODE_TYPES.length + 10;

/** 28-entry, L2-normalised feature vector over counted nodes. Works without any AI. */
export function structureVector(g: Graph): number[] {
  const counted = countedNodes(g);
  const nodes = g.nodes.filter((n) => counted.has(n.id));
  const edges = g.edges.filter((e) => counted.has(e.from.node) && counted.has(e.to.node));
  const v: number[] = NODE_TYPES.map((t) => nodes.filter((n) => n.type === t).length);
  const exec = edges.filter((e) => e.kind === "exec");
  // longest exec chain (graph is acyclic)
  const memo = new Map<string, number>();
  const longest = (id: string, depth = 0): number => {
    if (depth > 256) return 0;
    if (memo.has(id)) return memo.get(id)!;
    const next = exec.filter((e) => e.from.node === id).map((e) => longest(e.to.node, depth + 1));
    const r = 1 + (next.length ? Math.max(...next) : 0);
    memo.set(id, r);
    return r;
  };
  const events = nodes.filter((n) => ["OnStart", "OnKey", "OnTick", "OnCollide"].includes(n.type));
  const has = (t: string) => (nodes.some((n) => n.type === t) ? 1 : 0);
  const tags = new Set<string>();
  for (const n of nodes) {
    if (n.type === "OnCollide") { tags.add(String(param(n, "tagA"))); tags.add(String(param(n, "tagB"))); }
    if (["SetVelocity", "AddVelocity", "Destroy", "EntityField"].includes(n.type)) {
      const e = String(param(n, "entity"));
      if (e !== "a" && e !== "b") tags.add(e);
    }
    if (n.type === "Spawn") tags.add(String(param(n, "prefab")));
  }
  v.push(
    exec.length,
    edges.length - exec.length,
    events.length ? Math.max(...events.map((e) => longest(e.id))) : 0,
    new Set(nodes.filter((n) => n.type === "OnKey").map((n) => String(param(n, "key")))).size,
    has("Random"), has("Spawn"), has("Win"), has("Lose"),
    events.length,
    tags.size,
  );
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v.map(() => 0) : v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
