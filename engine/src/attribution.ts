import { incomingEdges, canonical } from "./hash";
import { EVENT_TYPES, type Graph, type GraphNode } from "./schema";

export const MAX_AUTHORS = 8;
export const TOTAL_BPS = 10_000;

/**
 * Counted nodes: every event node, every node reached from an event along exec edges,
 * and every value node that feeds (directly or through other value nodes) a reached node.
 * Everything else is dead and does not count for attribution, rules, or structure.
 */
export function countedNodes(g: Pick<Graph, "nodes" | "edges">): Set<string> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const reached = new Set<string>();
  const stack = g.nodes.filter((n) => EVENT_TYPES.has(n.type)).map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reached.has(id) || !byId.has(id)) continue;
    reached.add(id);
    for (const e of g.edges) if (e.kind === "exec" && e.from.node === id) stack.push(e.to.node);
  }
  const counted = new Set(reached);
  const dataStack = [...reached];
  while (dataStack.length) {
    const id = dataStack.pop()!;
    for (const e of g.edges) {
      if (e.kind === "data" && e.to.node === id && !counted.has(e.from.node) && byId.has(e.from.node)) {
        counted.add(e.from.node);
        dataStack.push(e.from.node);
      }
    }
  }
  return counted;
}

/** Actions that only steer the player: on their own they make a control scheme, not a game. */
const CONTROL_ACTIONS = new Set(["Move", "Stop", "SetVelocity", "AddVelocity"]);
/** Read-only helpers a control may use (jump only when grounded, turn around by the sign of vx). */
const CONTROL_VALUES = new Set(["Const", "EntityField", "Compare"]);

/**
 * Blocks that earn a share of the payout. A block earns when it runs (see countedNodes) and is not a control or
 * setup block. Controls are chains started by a key, or by every tick, that only move, stop or change the speed of
 * the player (WASD, arrows, jump, gravity): every game has them, so copying them earns nothing. Setup is the block
 * that creates the player. Everything else earns: enemies and spawns, collisions, shooting, scoring, variables,
 * timers, win and lose. If a graph has nothing but controls and setup, those count, so someone is still credited.
 * Deterministic and public: anyone can recompute the split from the graph.
 */
export function earningNodes(g: Pick<Graph, "nodes" | "edges"> & { prefabs?: Graph["prefabs"] }): Set<string> {
  const counted = countedNodes(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const isPlayerTarget = (n: GraphNode) => String(n.params.entity ?? "player") === "player";
  const spawnsPlayer = (n: GraphNode) => n.type === "Spawn" && (n.params.prefab === "player" || g.prefabs?.[String(n.params.prefab)]?.tag === "player");
  const feeders = (ids: Set<string>) => {
    const out = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of g.edges) if (e.kind === "data" && e.to.node === id && !out.has(e.from.node) && byId.has(e.from.node)) { out.add(e.from.node); stack.push(e.from.node); }
    }
    return out;
  };
  const earning = new Set<string>();
  for (const ev of g.nodes) {
    if (!EVENT_TYPES.has(ev.type) || !counted.has(ev.id)) continue;
    const chain = new Set<string>();
    const stack = [ev.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of g.edges) if (e.kind === "exec" && e.from.node === id && !chain.has(e.to.node) && byId.has(e.to.node)) { chain.add(e.to.node); stack.push(e.to.node); }
    }
    const values = feeders(new Set([...chain, ev.id]));
    const steering = ev.type === "OnKey" || (ev.type === "OnTick" && Number(ev.params.everyN) === 1);
    const control = steering && chain.size > 0
      && [...chain].every((id) => { const n = byId.get(id)!; return n.type === "Branch" || (CONTROL_ACTIONS.has(n.type) && isPlayerTarget(n)); })
      && [...values].every((id) => { const n = byId.get(id)!; return CONTROL_VALUES.has(n.type) && (n.type !== "EntityField" || isPlayerTarget(n)); });
    if (control) continue;
    const actions = [...chain].filter((id) => !spawnsPlayer(byId.get(id)!));
    if (!actions.length) continue; // only creates the player: setup
    earning.add(ev.id);
    for (const id of actions) earning.add(id);
    for (const id of feeders(new Set(actions))) earning.add(id);
  }
  return earning.size ? earning : counted;
}

const sig = (g: Pick<Graph, "nodes" | "edges">, n: GraphNode) => canonical({ type: n.type, incoming: incomingEdges(g, n.id) });

/**
 * Applies the authorship rule to a draft derived from `parent` (fork or edit).
 * A node keeps its author and origin only if a node with the same id exists in the parent with the same
 * type and the same incoming edges. Parameter-only changes keep the original author. Anything else is the editor's.
 * Grafted nodes (origin in `allowedGrafts`) keep their stated author when it matches the source.
 * New nodes get originFork "" which means "the graph this node is in".
 */
export function applyAuthorship(
  parent: { graph: Graph; hash: string } | null,
  draft: Graph,
  editor: string,
  allowedGrafts: Map<string, Graph> = new Map(),
): Graph {
  const parentNodes = new Map(parent?.graph.nodes.map((n) => [n.id, n]) ?? []);
  const nodes = draft.nodes.map((n) => {
    const p = parentNodes.get(n.id);
    if (parent && p && p.type === n.type && sig(parent.graph, p) === sig(draft, n)) {
      return { ...n, authorId: p.authorId, originFork: p.originFork === "" ? parent.hash : p.originFork };
    }
    const src = allowedGrafts.get(n.originFork);
    if (src) {
      const s = src.nodes.find((x) => x.type === n.type && x.authorId === n.authorId);
      if (s) return { ...n };
    }
    return { ...n, authorId: editor, originFork: "" };
  });
  const usedSources = [...new Set(nodes.map((n) => n.originFork).filter((h) => allowedGrafts.has(h)))].sort();
  return {
    ...draft,
    parent: parent ? parent.hash : null,
    root: parent ? parent.graph.root || parent.hash : "",
    sources: usedSources,
    nodes,
  };
}

/** Make a draft fork: same nodes, origins resolved to concrete hashes, parent set. Authorship is preserved. */
export function forkGraph(parent: Graph, parentHash: string): Graph {
  return {
    ...structuredClone(parent),
    parent: parentHash,
    root: parent.root || parentHash,
    title: parent.title.endsWith("(fork)") ? parent.title : `${parent.title} (fork)`.slice(0, 80),
    nodes: parent.nodes.map((n) => ({ ...n, params: { ...n.params }, originFork: n.originFork === "" ? parentHash : n.originFork })),
  };
}

export type Share = { handle: string; bps: number; nodeIds: string[]; wallet?: string; /** paid to the handle's devnet demo wallet: no wallet was linked */ demoWallet?: boolean };

/**
 * Shares in basis points over earning nodes (see earningNodes: running blocks that are not controls or setup). Authors are ordered by first appearance in the lineage:
 * `lineage` is ancestor hashes root first; then `sources` sorted; then nodes new in this graph.
 * bps_i = floor(10000 * count_i / total); leftover bps go to the first author.
 * At most 8 authors: the smallest shares are merged into the first author.
 */
export function computeShares(g: Graph, lineage: string[] = []): Share[] {
  // only blocks that earn (not controls or setup) decide the split
  const counted = earningNodes(g);
  const sources = [...g.sources].sort();
  const rank = (origin: string) => {
    if (origin === "") return lineage.length + sources.length + 1;
    const i = lineage.indexOf(origin);
    if (i >= 0) return i;
    const j = sources.indexOf(origin);
    if (j >= 0) return lineage.length + j;
    return lineage.length + sources.length; // unknown origin: after sources, before new nodes
  };
  const nodes = g.nodes.filter((n) => counted.has(n.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (nodes.length === 0) return [];
  const byAuthor = new Map<string, { nodeIds: string[]; firstRank: number; firstIndex: number }>();
  nodes.forEach((n, i) => {
    const a = byAuthor.get(n.authorId);
    const r = rank(n.originFork);
    if (!a) byAuthor.set(n.authorId, { nodeIds: [n.id], firstRank: r, firstIndex: i });
    else {
      a.nodeIds.push(n.id);
      if (r < a.firstRank) a.firstRank = r;
    }
  });
  const ordered = [...byAuthor.entries()].sort((x, y) => x[1].firstRank - y[1].firstRank || x[1].firstIndex - y[1].firstIndex);
  const total = nodes.length;
  let shares: Share[] = ordered.map(([handle, a]) => ({ handle, bps: Math.floor((TOTAL_BPS * a.nodeIds.length) / total), nodeIds: a.nodeIds }));
  if (shares.length > MAX_AUTHORS) {
    const head = shares[0];
    const rest = shares.slice(1).sort((a, b) => b.bps - a.bps);
    const keep = rest.slice(0, MAX_AUTHORS - 1);
    for (const s of rest.slice(MAX_AUTHORS - 1)) {
      head.bps += s.bps;
      head.nodeIds.push(...s.nodeIds);
    }
    const keepSet = new Set(keep.map((k) => k.handle));
    shares = [head, ...shares.slice(1).filter((s) => keepSet.has(s.handle))];
  }
  const sum = shares.reduce((s, x) => s + x.bps, 0);
  shares[0].bps += TOTAL_BPS - sum;
  return shares.filter((s) => s.bps > 0);
}

export function receiptText(title: string, shares: Share[]): string {
  const lines = shares.map((s) => `@${s.handle}: ${(s.bps / 100).toFixed(2)} percent (${s.nodeIds.length} node${s.nodeIds.length === 1 ? "" : "s"}: ${s.nodeIds.join(", ")})`);
  return [`Split for ${title}`, ...lines, "Counted nodes only. Computed by the published ForkLab attribution algorithm."].join("\n");
}
