import { CATALOG, EVENT_TYPES, type Graph, type GraphNode } from "@forklab/engine";

export const nodeHeight = (n: GraphNode) => {
  const d = CATALOG[n.type];
  return 34 + Math.max(d.inputs.length, d.outputs.length) * 20 + (d.params.length ? 8 + d.params.length * 24 : 0);
};
const W = 220;
const GAP_X = 70;
const GAP_Y = 36;

/** True if any two nodes overlap with their estimated sizes (or positions are missing). */
export function needsLayout(g: Graph): boolean {
  if (g.nodes.some((n) => !n.pos)) return true;
  for (let i = 0; i < g.nodes.length; i += 1) {
    for (let j = i + 1; j < g.nodes.length; j += 1) {
      const a = g.nodes[i], b = g.nodes[j];
      if (a.pos!.x < b.pos!.x + W && b.pos!.x < a.pos!.x + W && a.pos!.y < b.pos!.y + nodeHeight(b) && b.pos!.y < a.pos!.y + nodeHeight(a)) return true;
    }
  }
  return false;
}

/**
 * Layered layout: each event chain is a horizontal band. Column 0 holds value nodes feeding the band,
 * column 1 the event, then one column per exec depth. Unconnected nodes go in a final band.
 */
export function layoutGraph(g: Graph): Graph {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, { col: number; band: number }>();
  const events = g.nodes.filter((n) => EVENT_TYPES.has(n.type)).sort((a, b) => (a.id < b.id ? -1 : 1));
  events.forEach((ev, band) => {
    const queue: Array<[string, number]> = [[ev.id, 1]];
    while (queue.length) {
      const [id, col] = queue.shift()!;
      if (placed.has(id)) continue;
      placed.set(id, { col, band });
      for (const e of g.edges) if (e.kind === "exec" && e.from.node === id) queue.push([e.to.node, col + 1]);
    }
    // value feeders of this band, recursively, go to column 0 (and further left if chained)
    const feed = (id: string, col: number) => {
      for (const e of g.edges) if (e.kind === "data" && e.to.node === id && !placed.has(e.from.node)) {
        placed.set(e.from.node, { col, band });
        feed(e.from.node, col - 1);
      }
    };
    for (const [id, p] of [...placed.entries()]) if (p.band === band) feed(id, 0);
  });
  const rest = g.nodes.filter((n) => !placed.has(n.id));
  rest.forEach((n, i) => placed.set(n.id, { col: i % 4, band: events.length }));
  const minCol = Math.min(0, ...[...placed.values()].map((p) => p.col));
  // stack nodes that share a cell, then size each band by its tallest cell
  const cells = new Map<string, GraphNode[]>();
  for (const n of g.nodes) {
    const p = placed.get(n.id)!;
    const k = `${p.band}:${p.col}`;
    cells.set(k, [...(cells.get(k) ?? []), n]);
  }
  const bandCount = events.length + (rest.length ? 1 : 0);
  const bandH = Array.from({ length: bandCount }, (_, b) => Math.max(80, ...[...cells.entries()].filter(([k]) => Number(k.split(":")[0]) === b).map(([, ns]) => ns.reduce((s, n) => s + nodeHeight(n) + GAP_Y, 0))));
  // pack the bands into columns (shortest column first) so the whole graph reads at a 16:9-ish shape
  const bandCols = Array.from({ length: bandCount }, (_, b) => {
    const cs = [...cells.keys()].filter((k) => Number(k.split(":")[0]) === b).map((k) => Number(k.split(":")[1]));
    return cs.length ? { min: Math.min(...cs), max: Math.max(...cs) } : { min: 0, max: 0 };
  });
  const bandW = bandCols.map((c) => (c.max - c.min + 1) * (W + GAP_X) + 90);
  const total = bandH.reduce((s, h) => s + h, 0);
  const widest = Math.max(...bandW, 1);
  const columns = Math.max(1, Math.min(4, Math.round(Math.sqrt((total * 1.6) / widest))));
  const colH = new Array(columns).fill(0);
  const colW = new Array(columns).fill(0);
  const where: Array<{ col: number; y: number }> = [];
  bandH.forEach((h, b) => {
    const c = colH.indexOf(Math.min(...colH));
    where[b] = { col: c, y: colH[c] };
    colH[c] += h + 50;
    colW[c] = Math.max(colW[c], bandW[b]);
  });
  const colX = colW.map((_, c) => colW.slice(0, c).reduce((s, w) => s + w, 0));
  const pos = new Map<string, { x: number; y: number }>();
  for (const [k, ns] of cells) {
    const [b, c] = k.split(":").map(Number);
    let y = where[b].y;
    for (const n of ns) {
      pos.set(n.id, { x: colX[where[b].col] + (c - bandCols[b].min) * (W + GAP_X), y });
      y += nodeHeight(n) + GAP_Y;
    }
  }
  void byId;
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, pos: pos.get(n.id) })) };
}
