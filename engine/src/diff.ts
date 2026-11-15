import { canonical, incomingEdges } from "./hash";
import type { Graph } from "./schema";

export type NodeChange = { id: string; type: string; authorId: string; change: "params" | "structure"; before?: Record<string, unknown>; after?: Record<string, unknown> };
export type GraphDiff = {
  added: Array<{ id: string; type: string; authorId: string }>;
  removed: Array<{ id: string; type: string; authorId: string }>;
  changed: NodeChange[];
};

/** Node-level diff between two graphs, keyed by node id. */
export function diffGraphs(a: Graph, b: Graph): GraphDiff {
  const an = new Map(a.nodes.map((n) => [n.id, n]));
  const bn = new Map(b.nodes.map((n) => [n.id, n]));
  const out: GraphDiff = { added: [], removed: [], changed: [] };
  for (const [id, n] of bn) {
    const old = an.get(id);
    if (!old) {
      out.added.push({ id, type: n.type, authorId: n.authorId });
      continue;
    }
    const structural = old.type !== n.type || canonical(incomingEdges(a, id)) !== canonical(incomingEdges(b, id));
    if (structural) out.changed.push({ id, type: n.type, authorId: n.authorId, change: "structure" });
    else if (canonical(old.params) !== canonical(n.params)) out.changed.push({ id, type: n.type, authorId: n.authorId, change: "params", before: old.params, after: n.params });
  }
  for (const [id, n] of an) if (!bn.has(id)) out.removed.push({ id, type: n.type, authorId: n.authorId });
  const byId = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : 1);
  out.added.sort(byId);
  out.removed.sort(byId);
  out.changed.sort(byId);
  return out;
}

/** A deterministic plain-English changelog used when no AI is available. */
export function localChangelog(d: GraphDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`Added ${d.added.length} node${d.added.length === 1 ? "" : "s"} (${[...new Set(d.added.map((x) => x.type))].join(", ")}).`);
  if (d.removed.length) parts.push(`Removed ${d.removed.length} node${d.removed.length === 1 ? "" : "s"}.`);
  const params = d.changed.filter((c) => c.change === "params");
  if (params.length) {
    const first = params[0];
    const keys = Object.keys(first.after ?? {}).filter((k) => canonical(first.before?.[k] ?? null) !== canonical(first.after?.[k] ?? null));
    parts.push(`Tuned ${params.length} node${params.length === 1 ? "" : "s"}${keys.length ? `, for example ${first.type} ${keys.join(", ")}` : ""}.`);
  }
  const structural = d.changed.filter((c) => c.change === "structure");
  if (structural.length) parts.push(`Rewired ${structural.length} node${structural.length === 1 ? "" : "s"}.`);
  return parts.length ? parts.join(" ") : "No changes.";
}
