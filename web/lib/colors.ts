/** Ten bright, well-separated hues that read on the dark background; always shown with the handle text. */
export const AUTHOR_COLORS = ["#4FB3E8", "#F2994A", "#8BD46B", "#E8C547", "#C38BF2", "#F26D8B", "#4FD1C1", "#7A8CF2", "#E05A47", "#D9D2C3"] as const;

/** A handle's own colour, the same everywhere it appears alone. */
export function authorColor(handle: string): string {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}

/**
 * Colours for everyone in one split: each keeps their own colour unless someone earlier in the list already has it,
 * in which case they take the next free one, so no two people in a split ever share a colour.
 */
export function splitColors(handles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const h of handles) {
    let i = AUTHOR_COLORS.indexOf(authorColor(h) as (typeof AUTHOR_COLORS)[number]);
    for (let k = 0; k < AUTHOR_COLORS.length && used.has(AUTHOR_COLORS[i]); k += 1) i = (i + 1) % AUTHOR_COLORS.length;
    out.set(h, AUTHOR_COLORS[i]);
    used.add(AUTHOR_COLORS[i]);
  }
  return out;
}

const byGraph = new WeakMap<object, Map<string, string>>();
/**
 * One colour per author for a whole game, no two alike: payout order first (the same order "Who gets paid"
 * lists them), then anyone whose blocks don't run yet. Blocks, nodes and the payout list all use this.
 */
export function graphColors(graph: { nodes: Array<{ authorId: string }> }, order: string[] = []): Map<string, string> {
  const hit = byGraph.get(graph);
  if (hit && order.every((h) => hit.has(h))) return hit;
  const handles = [...new Set([...order, ...graph.nodes.map((n) => n.authorId)])];
  const m = splitColors(handles);
  byGraph.set(graph, m);
  return m;
}
