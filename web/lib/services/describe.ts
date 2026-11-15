import { CATALOG, countedNodes, type Graph } from "@forklab/engine";

/** Text used for semantic embedding: title, tags, changelog and a node-type summary. Free text is capped. */
export function describeGraph(g: Graph, changelog?: string): string {
  const counted = countedNodes(g);
  const types = new Map<string, number>();
  for (const n of g.nodes) if (counted.has(n.id)) types.set(CATALOG[n.type].label, (types.get(CATALOG[n.type].label) ?? 0) + 1);
  const keys = [...new Set(g.nodes.filter((n) => n.type === "OnKey" && counted.has(n.id)).map((n) => String(n.params.key ?? "Space")))];
  const prefabs = [...new Set(g.nodes.filter((n) => n.type === "Spawn" && counted.has(n.id)).map((n) => String(n.params.prefab ?? "")))];
  return [
    g.title.slice(0, 80),
    g.tags.join(" "),
    (changelog ?? "").slice(0, 280),
    `${g.kind} with ${[...types.entries()].map(([t, c]) => `${c} ${t}`).join(", ")}`,
    keys.length ? `uses ${keys.length} key: ${keys.join(" ")}` : "no keys",
    prefabs.length ? `spawns ${prefabs.join(" ")}` : "",
  ].join(". ");
}
