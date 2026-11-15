import { CATALOG, EVENT_TYPES, type Edge, type Graph, type GraphNode, type NodeType } from "@forklab/engine";

/*
 * Scratch-style view of a ForkLab graph. The graph stays the source of truth:
 *   scripts  = a hat (event) followed by a stack of blocks; "If" blocks hold then/else stacks.
 *   reporters = value nodes plugged into number slots through data edges.
 * Exec edges are regenerated from the stacks after every edit; data edges are kept per slot.
 */

export type Block = { id: string; then?: Block[]; else?: Block[] };
export type Script = { hatId: string | null; x: number; y: number; body: Block[] };

export const VALUE_TYPES: ReadonlySet<NodeType> = new Set(["Const", "GetVar", "Random", "EntityField", "Compare", "Score"]);
export const CAP_TYPES: ReadonlySet<NodeType> = new Set(["Win", "Lose"]);
export const isEvent = (t: NodeType) => EVENT_TYPES.has(t);
export const isValue = (t: NodeType) => VALUE_TYPES.has(t);

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function outTargets(g: Graph, node: string, port: string): string[] {
  return g.edges.filter((e) => e.kind === "exec" && e.from.node === node && e.from.port === port).map((e) => e.to.node).sort(byId);
}

/** Follow an exec port into a flat stack. When one port fans out, later targets run after the first one's whole chain, as in the engine. */
function chain(g: Graph, from: string, port: string, seen: Set<string>): Block[] {
  const out: Block[] = [];
  for (const t of outTargets(g, from, port)) out.push(...walk(g, t, seen));
  return out;
}
function walk(g: Graph, start: string, seen: Set<string>): Block[] {
  const out: Block[] = [];
  const later: string[] = [];
  let cur: string | null = start;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = g.nodes.find((x) => x.id === cur);
    if (!n || isEvent(n.type) || isValue(n.type)) break;
    if (n.type === "Branch") {
      out.push({ id: n.id, then: chain(g, n.id, "true", seen), else: chain(g, n.id, "false", seen) });
      out.push(...chain(g, n.id, "out", seen));
      break;
    }
    out.push({ id: n.id });
    const next = outTargets(g, n.id, "out");
    cur = next[0] ?? null;
    later.push(...next.slice(1).reverse());
  }
  while (later.length) out.push(...walk(g, later.pop()!, seen));
  return out;
}
const chainFrom = (g: Graph, start: string, seen: Set<string>) => walk(g, start, seen);

export function graphToScripts(g: Graph): Script[] {
  const seen = new Set<string>();
  const scripts: Script[] = [];
  const events = g.nodes.filter((n) => isEvent(n.type)).sort((a, b) => byId(a.id, b.id));
  events.forEach((ev, i) => {
    seen.add(ev.id);
    scripts.push({ hatId: ev.id, x: ev.pos?.x ?? 40 + (i % 3) * 380, y: ev.pos?.y ?? 40 + Math.floor(i / 3) * 260, body: chain(g, ev.id, "out", seen) });
  });
  // loose stacks: action blocks nothing runs into
  const incoming = new Set(g.edges.filter((e) => e.kind === "exec").map((e) => e.to.node));
  for (const n of [...g.nodes].sort((a, b) => byId(a.id, b.id))) {
    if (seen.has(n.id) || isEvent(n.type) || isValue(n.type) || incoming.has(n.id)) continue;
    const body = chainFrom(g, n.id, seen);
    if (body.length) scripts.push({ hatId: null, x: n.pos?.x ?? 60, y: n.pos?.y ?? 60, body });
  }
  for (const n of g.nodes) {
    if (seen.has(n.id) || isEvent(n.type) || isValue(n.type)) continue;
    seen.add(n.id);
    scripts.push({ hatId: null, x: n.pos?.x ?? 60, y: n.pos?.y ?? 60, body: [{ id: n.id }] });
  }
  return scripts;
}

/** Exec edges for a set of scripts. */
export function compileScripts(scripts: Script[]): Edge[] {
  const edges: Edge[] = [];
  const link = (from: string, port: string, to: string) => edges.push({ from: { node: from, port }, to: { node: to, port: "in" }, kind: "exec" });
  const stack = (blocks: Block[], from: string | null, port: string) => {
    let prev = from, prevPort = port;
    for (const b of blocks) {
      if (prev) link(prev, prevPort, b.id);
      if (b.then || b.else) {
        stack(b.then ?? [], b.id, "true");
        stack(b.else ?? [], b.id, "false");
      }
      prev = b.id;
      prevPort = "out";
    }
  };
  for (const s of scripts) stack(s.body, s.hatId, "out");
  return edges;
}

export function scriptsToGraph(g: Graph, scripts: Script[]): Graph {
  const exec = compileScripts(scripts);
  const keep = new Set<string>();
  const visit = (bs: Block[]) => bs.forEach((b) => { keep.add(b.id); visit(b.then ?? []); visit(b.else ?? []); });
  scripts.forEach((s) => { if (s.hatId) keep.add(s.hatId); visit(s.body); });
  const nodes = g.nodes.map((n) => {
    const s = scripts.find((x) => x.hatId === n.id || (!x.hatId && x.body[0]?.id === n.id));
    return s ? { ...n, pos: { x: Math.round(s.x), y: Math.round(s.y) } } : n;
  });
  // data edges survive only when both ends still exist
  const ids = new Set(nodes.map((n) => n.id));
  const data = g.edges.filter((e) => e.kind === "data" && ids.has(e.from.node) && ids.has(e.to.node));
  return { ...g, nodes, edges: [...exec, ...data] };
}

/* ---------- edit operations (pure: graph in, graph out) ---------- */

export type Target =
  | { kind: "after"; blockId: string }
  | { kind: "top"; hatId: string }
  | { kind: "mouth"; branchId: string; arm: "then" | "else" }
  | { kind: "loose"; x: number; y: number };

function findList(scripts: Script[], blockId: string): { list: Block[]; index: number } | null {
  const search = (list: Block[]): { list: Block[]; index: number } | null => {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === blockId) return { list, index: i };
      const a = search(list[i].then ?? []) ?? search(list[i].else ?? []);
      if (a) return a;
    }
    return null;
  };
  for (const s of scripts) { const r = search(s.body); if (r) return r; }
  return null;
}
function findBlock(scripts: Script[], id: string): Block | null {
  const r = findList(scripts, id);
  return r ? r.list[r.index] : null;
}

/** Take a block and everything below it out of its stack (Scratch drag behaviour). */
function detach(scripts: Script[], blockId: string): Block[] {
  const r = findList(scripts, blockId);
  if (!r) return [];
  return r.list.splice(r.index);
}

function insert(scripts: Script[], chunk: Block[], target: Target): Script[] {
  if (target.kind === "loose") { scripts.push({ hatId: null, x: target.x, y: target.y, body: chunk }); return scripts; }
  if (target.kind === "top") {
    const s = scripts.find((x) => x.hatId === target.hatId);
    if (s) s.body.unshift(...chunk);
    return scripts;
  }
  if (target.kind === "mouth") {
    const b = findBlock(scripts, target.branchId);
    if (b) { const arm = (b[target.arm] ??= []); arm.unshift(...chunk); }
    return scripts;
  }
  const r = findList(scripts, target.blockId);
  if (r) r.list.splice(r.index + 1, 0, ...chunk);
  return scripts;
}

const clean = (scripts: Script[]) => scripts.filter((s) => s.hatId || s.body.length);

let counter = 0;
export function newId(g: Graph): string {
  const ids = new Set(g.nodes.map((n) => n.id));
  let id = "";
  do { counter += 1; id = `b${Date.now().toString(36).slice(-4)}${counter}`; } while (ids.has(id));
  return id;
}

export function defaultParams(type: NodeType): GraphNode["params"] {
  const p: GraphNode["params"] = {};
  for (const d of CATALOG[type].params) p[d.name] = d.default;
  return p;
}

/** Add a new block from the palette at a target. Events always start a new script. Values become loose reporters. */
export function addBlock(g: Graph, type: NodeType, author: string, target: Target, params?: GraphNode["params"]): { graph: Graph; id: string } {
  const id = newId(g);
  const pos = target.kind === "loose" ? { x: Math.round(target.x), y: Math.round(target.y) } : undefined;
  const node: GraphNode = { id, type, params: params ?? defaultParams(type), authorId: author, originFork: "", pos };
  const g2: Graph = { ...g, nodes: [...g.nodes, node] };
  if (isEvent(type) || isValue(type)) return { graph: g2, id };
  const scripts = graphToScripts(g2).filter((s) => !(s.hatId === null && s.body.length === 1 && s.body[0].id === id));
  const block: Block = type === "Branch" ? { id, then: [], else: [] } : { id };
  return { graph: scriptsToGraph(g2, clean(insert(scripts, [block], target))), id };
}

/** Move a block (and the ones below it) to a target. Win and Lose end a stack, so nothing can follow them. */
export function moveBlocks(g: Graph, blockId: string, target: Target): Graph {
  const scripts = graphToScripts(g);
  if (target.kind === "after" && (target.blockId === blockId || isInside(scripts, blockId, target.blockId))) return g;
  if (target.kind === "mouth" && (target.branchId === blockId || isInside(scripts, blockId, target.branchId))) return g;
  const chunk = detach(scripts, blockId);
  if (!chunk.length) return g;
  return scriptsToGraph(g, clean(insert(scripts, chunk, target)));
}

function isInside(scripts: Script[], outer: string, inner: string): boolean {
  const r = findList(scripts, outer);
  if (!r) return false;
  const below = r.list.slice(r.index);
  const has = (bs: Block[]): boolean => bs.some((b) => b.id === inner || has(b.then ?? []) || has(b.else ?? []));
  return has(below);
}

export function moveScript(g: Graph, hatOrFirst: string, x: number, y: number): Graph {
  const scripts = graphToScripts(g);
  const s = scripts.find((v) => v.hatId === hatOrFirst || (!v.hatId && v.body[0]?.id === hatOrFirst));
  if (!s) return { ...g, nodes: g.nodes.map((n) => (n.id === hatOrFirst ? { ...n, pos: { x: Math.round(x), y: Math.round(y) } } : n)) };
  s.x = x; s.y = y;
  return scriptsToGraph(g, scripts);
}

/** Every value node feeding a node's slots, recursively. */
function reportersOf(g: Graph, id: string, acc = new Set<string>()): Set<string> {
  for (const e of g.edges) if (e.kind === "data" && e.to.node === id && !acc.has(e.from.node)) { acc.add(e.from.node); reportersOf(g, e.from.node, acc); }
  return acc;
}

/** Delete a hat with its whole script, or a block with everything below it, plus the reporters in their slots. */
export function deleteFrom(g: Graph, id: string): Graph {
  const scripts = graphToScripts(g);
  const doomed = new Set<string>();
  const collect = (bs: Block[]) => bs.forEach((b) => { doomed.add(b.id); collect(b.then ?? []); collect(b.else ?? []); });
  const s = scripts.find((v) => v.hatId === id);
  if (s) { doomed.add(id); collect(s.body); }
  else { const chunk = detach(scripts, id); collect(chunk); if (!chunk.length) doomed.add(id); }
  for (const d of [...doomed]) reportersOf(g, d).forEach((r) => doomed.add(r));
  const g2: Graph = { ...g, nodes: g.nodes.filter((n) => !doomed.has(n.id)), edges: g.edges.filter((e) => !doomed.has(e.from.node) && !doomed.has(e.to.node)) };
  return scriptsToGraph(g2, clean(graphToScripts(g2)));
}

/** Plug a reporter into a number slot (the previous occupant becomes a loose reporter). */
export function plug(g: Graph, reporterId: string, nodeId: string, port: string): Graph {
  if (reporterId === nodeId || reportersOf(g, reporterId).has(nodeId)) return g;
  const edges = g.edges.filter((e) => !(e.kind === "data" && ((e.to.node === nodeId && e.to.port === port) || e.from.node === reporterId)));
  edges.push({ from: { node: reporterId, port: "out" }, to: { node: nodeId, port }, kind: "data" });
  return { ...g, edges };
}

/** Pull a reporter out of its slot and leave it loose at a position. */
export function unplug(g: Graph, reporterId: string, x: number, y: number): Graph {
  return {
    ...g,
    edges: g.edges.filter((e) => !(e.kind === "data" && e.from.node === reporterId)),
    nodes: g.nodes.map((n) => (n.id === reporterId ? { ...n, pos: { x: Math.round(x), y: Math.round(y) } } : n)),
  };
}

export function setParam(g: Graph, id: string, key: string, value: number | string): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) };
}

/** Reporters that are not plugged into anything (shown floating on the workspace). */
export function looseReporters(g: Graph): GraphNode[] {
  const plugged = new Set(g.edges.filter((e) => e.kind === "data").map((e) => e.from.node));
  return g.nodes.filter((n) => isValue(n.type) && !plugged.has(n.id));
}

export function slotSource(g: Graph, nodeId: string, port: string): string | null {
  return g.edges.find((e) => e.kind === "data" && e.to.node === nodeId && e.to.port === port)?.from.node ?? null;
}

/** Pack scripts into columns (estimated block heights), events first in their original order. */
export function layoutScripts(g: Graph, columns = 3, colWidth = 520): Graph {
  const scripts = graphToScripts(g);
  const h = (bs: Block[]): number => bs.reduce((sum, b) => sum + (b.then || b.else ? 96 + h(b.then ?? []) + h(b.else ?? []) : 44), 0);
  const heights = new Array(columns).fill(30);
  for (const s of scripts) {
    const col = heights.indexOf(Math.min(...heights));
    s.x = 30 + col * colWidth;
    s.y = heights[col];
    heights[col] += (s.hatId ? 60 : 0) + h(s.body) + 36;
  }
  let next = scriptsToGraph(g, scripts);
  const loose = looseReporters(next);
  loose.forEach((r, i) => { next = { ...next, nodes: next.nodes.map((n) => (n.id === r.id ? { ...n, pos: { x: 30 + i * 140, y: Math.max(...heights) + 20 } } : n)) }; });
  return next;
}
