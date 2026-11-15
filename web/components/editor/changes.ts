import { countedNodes, EVENT_TYPES, type Edge, type Graph, type GraphNode } from "@forklab/engine";
import { nodeWords } from "./words";

/** What an edit does to the wiring, in plain words, so the user can accept or deny it. */
export type Change = { kind: "connect" | "disconnect" | "rewire"; title: string; lines: string[]; starts: string[]; stops: string[]; what: string };

const key = (e: Edge) => `${e.from.node}.${e.from.port}>${e.to.node}.${e.to.port}`;

/** The event that starts the chain a node is in (walking exec edges backwards), if any. */
function eventOf(g: Graph, id: string, seen = new Set<string>()): GraphNode | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const n = g.nodes.find((x) => x.id === id);
  if (!n) return null;
  if (EVENT_TYPES.has(n.type)) return n;
  for (const e of g.edges) if (e.kind === "exec" && e.to.node === id) { const ev = eventOf(g, e.from.node, seen); if (ev) return ev; }
  return null;
}

function trigger(ev: GraphNode | null): string {
  if (!ev) return "nothing starts it";
  const p = ev.params;
  switch (ev.type) {
    case "OnStart": return "when the game starts";
    case "OnKey": return `when ${String(p.key).replace(/^Key/, "")} is ${p.when === "held" ? "held" : p.when === "released" ? "released" : "pressed"}`;
    case "OnTick": return `every ${p.everyN} ticks`;
    case "OnCollide": return `when ${p.tagA} touches ${p.tagB}`;
    default: return "on its event";
  }
}

/** Compare two versions of a graph. Returns null when the wiring between existing blocks did not change. */
export function describeChange(before: Graph, after: Graph): Change | null {
  const b = new Map(before.edges.map((e) => [key(e), e]));
  const a = new Map(after.edges.map((e) => [key(e), e]));
  const stillThere = (id: string) => after.nodes.some((n) => n.id === id);
  const removed = [...b.values()].filter((e) => !a.has(key(e)) && stillThere(e.from.node) && stillThere(e.to.node));
  const added = [...a.values()].filter((e) => !b.has(key(e)));
  if (!removed.length && !added.length) return null;
  const node = (g: Graph, id: string) => g.nodes.find((n) => n.id === id);
  const lines: string[] = [];
  for (const e of added) {
    const from = node(after, e.from.node), to = node(after, e.to.node);
    if (e.kind === "exec") lines.push(`${nodeWords(to)} will run ${trigger(eventOf(after, e.from.node))}${from && !EVENT_TYPES.has(from.type) ? `, after ${nodeWords(from)}` : ""}.`);
    else lines.push(`${nodeWords(from)} will set the ${e.to.port} of ${nodeWords(to)}.`);
  }
  for (const e of removed) {
    const from = node(after, e.from.node), to = node(after, e.to.node);
    if (e.kind === "exec") lines.push(`${nodeWords(to)} will no longer run after ${nodeWords(from)}.`);
    else lines.push(`${nodeWords(to)} goes back to its own ${e.to.port} instead of ${nodeWords(from)}.`);
  }
  const cb = countedNodes(before), ca = countedNodes(after);
  const starts = after.nodes.filter((n) => !cb.has(n.id) && ca.has(n.id) && before.nodes.some((x) => x.id === n.id)).map(nodeWords);
  const stops = after.nodes.filter((n) => cb.has(n.id) && !ca.has(n.id)).map(nodeWords);
  const kind = added.length && removed.length ? "rewire" : added.length ? "connect" : "disconnect";
  const title = kind === "connect" ? "Connect these blocks?" : kind === "disconnect" ? "Disconnect these blocks?" : "Move these blocks?";
  return { kind, title, lines: lines.slice(0, 6), starts, stops, what: lines.join(" ") };
}
