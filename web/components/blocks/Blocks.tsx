"use client";
import { Splitter } from "../editor/Splitter";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUILTIN_PREFABS, KEYS, type Graph, type GraphNode, type NodeType } from "@forklab/engine";
import {
  addBlock, CAP_TYPES, defaultParams, deleteFrom, graphToScripts, isEvent, isValue, looseReporters, moveBlocks, moveScript, plug, setParam, slotSource, unplug,
  type Block, type Script, type Target,
} from "./model";
import { authorColor, graphColors } from "@/lib/colors";
import { computeShares, earningNodes } from "@forklab/engine";

const orderCache = new WeakMap<object, string[]>();
/** Authors in payout order, so block colours match the "Who gets paid" list. */
function sharesOrder(g: Graph): string[] {
  let o = orderCache.get(g);
  if (!o) { o = computeShares(g).map((s) => s.handle); orderCache.set(g, o); }
  return o;
}
import { IdeaCard, newIdea, type Idea } from "../editor/ideas";
import type { Proposal } from "../editor/AIPanel";

/* ---------- block language: categories, colours and sentences ---------- */

export const CATEGORIES = {
  events: { label: "Events", color: "#c8964e" },
  motion: { label: "Motion", color: "#3e86a8" },
  world: { label: "World", color: "#c2643a" },
  control: { label: "Control", color: "#b3862f" },
  operators: { label: "Operators", color: "#6e9a4a" },
  sensing: { label: "Sensing", color: "#3f938b" },
  variables: { label: "Score and variables", color: "#9a4b6e" },
} as const;
type Cat = keyof typeof CATEGORIES;

type Ui = "num" | "text" | "enum" | "tag" | "prefab" | "key";
type Part = string | { p: string; ui: Ui; port?: boolean; labels?: Record<string, string> };

const KEY_LABELS: Record<string, string> = { Space: "space", ArrowLeft: "left arrow", ArrowRight: "right arrow", ArrowUp: "up arrow", ArrowDown: "down arrow", KeyA: "A", KeyD: "D", KeyW: "W", KeyS: "S" };
const DIR: Record<string, string> = { left: "left", right: "right", forward: "forward", back: "back", up: "up", down: "down" };
const SHOOT_DIR: Record<string, string> = { facing: "the way it faces", forward: "forward", back: "back", left: "left", right: "right", up: "up" };
const AXIS: Record<string, string> = { x: "sideways", z: "forward and back", y: "up and down", ground: "on the ground", all: "completely" };
const OPS: Record<string, string> = { lt: "<", le: "≤", gt: ">", ge: "≥", eq: "=", ne: "≠" };
const FIELDS: Record<string, string> = { x: "x position", y: "height", z: "depth", vx: "x speed", vy: "y speed", vz: "z speed", grounded: "on the ground", count: "how many" };
const WHEN: Record<string, string> = { press: "pressed", held: "held down", released: "released" };
export const TAG_OPTIONS: Array<[string, string]> = [["player", "player"], ["rock", "rock"], ["coin", "coin"], ["enemy", "enemy"], ["bolt", "bolt"], ["hurdle", "hurdle"], ["sacred", "sacred"], ["goal", "goal"], ["wall", "wall"], ["a", "the first one touching"], ["b", "the other one touching"]];

export const SPEC: Record<NodeType, { cat: Cat; parts: Part[] }> = {
  OnStart: { cat: "events", parts: ["when the game starts"] },
  OnKey: { cat: "events", parts: ["when", { p: "key", ui: "key" }, "key is", { p: "when", ui: "enum", labels: WHEN }] },
  OnTick: { cat: "events", parts: ["every", { p: "everyN", ui: "num" }, "ticks"] },
  OnCollide: { cat: "events", parts: ["when", { p: "tagA", ui: "tag" }, "touches", { p: "tagB", ui: "tag" }] },
  Move: { cat: "motion", parts: ["move", { p: "entity", ui: "tag" }, { p: "direction", ui: "enum", labels: DIR }, "at speed", { p: "speed", ui: "num", port: true }] },
  Stop: { cat: "motion", parts: ["stop", { p: "entity", ui: "tag" }, { p: "axis", ui: "enum", labels: AXIS }] },
  SetVelocity: { cat: "motion", parts: ["set speed of", { p: "entity", ui: "tag" }, "to x", { p: "vx", ui: "num", port: true }, "y", { p: "vy", ui: "num", port: true }, "z", { p: "vz", ui: "num", port: true }] },
  AddVelocity: { cat: "motion", parts: ["change speed of", { p: "entity", ui: "tag" }, "by x", { p: "vx", ui: "num", port: true }, "y", { p: "vy", ui: "num", port: true }, "z", { p: "vz", ui: "num", port: true }] },
  Spawn: { cat: "world", parts: ["create", { p: "prefab", ui: "prefab" }, "at x", { p: "x", ui: "num", port: true }, "y", { p: "y", ui: "num", port: true }, "z", { p: "z", ui: "num", port: true }] },
  Shoot: { cat: "world", parts: ["shoot", { p: "prefab", ui: "prefab" }, "from", { p: "from", ui: "tag" }, { p: "direction", ui: "enum", labels: SHOOT_DIR }, "speed", { p: "speed", ui: "num", port: true }] },
  Destroy: { cat: "world", parts: ["remove", { p: "entity", ui: "tag" }] },
  Branch: { cat: "control", parts: ["if", { p: "cond", ui: "num", port: true }, "then"] },
  Win: { cat: "control", parts: ["win the game"] },
  Lose: { cat: "control", parts: ["lose the game"] },
  Compare: { cat: "operators", parts: [{ p: "a", ui: "num", port: true }, { p: "op", ui: "enum", labels: OPS }, { p: "b", ui: "num", port: true }] },
  Random: { cat: "operators", parts: ["pick random", { p: "min", ui: "num" }, "to", { p: "max", ui: "num" }] },
  Const: { cat: "operators", parts: [{ p: "value", ui: "num" }] },
  EntityField: { cat: "sensing", parts: [{ p: "field", ui: "enum", labels: FIELDS }, "of", { p: "entity", ui: "tag" }] },
  AddScore: { cat: "variables", parts: ["change score by", { p: "n", ui: "num", port: true }] },
  Score: { cat: "variables", parts: ["score"] },
  SetVar: { cat: "variables", parts: ["set", { p: "name", ui: "text" }, "to", { p: "value", ui: "num", port: true }] },
  GetVar: { cat: "variables", parts: [{ p: "name", ui: "text" }] },
};

export const PALETTE_ORDER: Array<[Cat, NodeType[]]> = [
  ["events", ["OnStart", "OnKey", "OnTick", "OnCollide"]],
  ["motion", ["Move", "Stop", "SetVelocity", "AddVelocity"]],
  ["world", ["Spawn", "Shoot", "Destroy"]],
  ["control", ["Branch", "Win", "Lose"]],
  ["operators", ["Compare", "Random", "Const"]],
  ["sensing", ["EntityField"]],
  ["variables", ["AddScore", "Score", "SetVar", "GetVar"]],
];

/* ---------- drag state ---------- */

type Payload =
  | { kind: "new"; type: NodeType }
  | { kind: "blocks"; id: string }
  | { kind: "script"; id: string }
  | { kind: "reporter"; id: string };
type Drag = { payload: Payload; x: number; y: number; ox: number; oy: number; html: string; target: string | null; overTrash: boolean; zoom: number };

type Ctx = {
  graph: Graph;
  fresh?: Set<string>;
  readOnly: boolean;
  colorByAuthor: boolean;
  update: (g: Graph) => void;
  startDrag: (e: React.PointerEvent, payload: Payload, el: HTMLElement) => void;
  hint: string | null;
};
const BlockCtx = createContext<Ctx | null>(null);
const useBlocks = () => useContext(BlockCtx)!;

/* ---------- pieces ---------- */

function Field({ node, part }: { node: GraphNode; part: Exclude<Part, string> }) {
  const { graph, readOnly, update, hint } = useBlocks();
  const v = node.params[part.p];
  const set = (val: number | string) => update(setParam(graph, node.id, part.p, val));
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  if (part.port) {
    const src = slotSource(graph, node.id, part.p);
    if (src) {
      const r = graph.nodes.find((n) => n.id === src);
      if (r) return <ReporterView node={r} />;
    }
  }
  const slot = part.port ? `${node.id}:${part.p}` : undefined;
  const hintCls = slot && hint === `slot:${slot}` ? " slot-hint" : "";
  if (readOnly) {
    const shown = part.labels?.[String(v)] ?? (part.ui === "key" ? KEY_LABELS[String(v)] : undefined) ?? (part.ui === "tag" ? TAG_OPTIONS.find((t) => t[0] === v)?.[1] : undefined) ?? String(v ?? "");
    return <span className={`bk-field ${part.ui === "num" ? "num" : "pick"}`} data-slot={slot}>{shown}</span>;
  }
  switch (part.ui) {
    case "num":
      return <input className={`bk-field num${hintCls}`} data-slot={slot} type="number" value={Number(v ?? 0)} onPointerDown={stop} onChange={(e) => set(Math.trunc(Number(e.target.value) || 0))} aria-label={part.p} />;
    case "text":
      return <input className="bk-field pick" value={String(v ?? "")} onPointerDown={stop} onChange={(e) => set(e.target.value.replace(/[^\x20-\x7e]/g, "").slice(0, 24))} aria-label={part.p} />;
    case "enum":
    case "key":
    case "prefab": {
      const opts: Array<[string, string]> = part.ui === "key" ? KEYS.map((k) => [k, KEY_LABELS[k]]) : part.ui === "prefab" ? Object.keys(BUILTIN_PREFABS).map((k) => [k, k]) : Object.entries(part.labels ?? {});
      return (
        <select className="bk-field pick" value={String(v ?? "")} onPointerDown={stop} onChange={(e) => set(e.target.value)} aria-label={part.p}>
          {opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
      );
    }
    case "tag":
      return (
        <select className="bk-field pick" value={String(v ?? "")} onPointerDown={stop} onChange={(e) => set(e.target.value)} aria-label={part.p}>
          {TAG_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          {!TAG_OPTIONS.some((t) => t[0] === v) ? <option value={String(v)}>{String(v)}</option> : null}
        </select>
      );
  }
}

function Parts({ node }: { node: GraphNode }) {
  return (
    <>
      {SPEC[node.type].parts.map((part, i) => (typeof part === "string" ? <span key={i} className="bk-text">{part}</span> : <Field key={i} node={node} part={part} />))}
    </>
  );
}

const earnCache = new WeakMap<object, Set<string>>();
/** Who-gets-paid colouring: each author's colour on blocks that earn, grey on controls and setup (they earn nothing). */
function colorOf(node: GraphNode, byAuthor: boolean, graph?: Graph) {
  if (!byAuthor) return CATEGORIES[SPEC[node.type].cat].color;
  if (!graph) return authorColor(node.authorId);
  let earn = earnCache.get(graph);
  if (!earn) { earn = earningNodes(graph); earnCache.set(graph, earn); }
  if (!earn.has(node.id)) return "#4a4852";
  return graphColors(graph, sharesOrder(graph)).get(node.authorId) ?? authorColor(node.authorId);
}

function ReporterView({ node, palette }: { node: GraphNode; palette?: NodeType }) {
  const { startDrag, readOnly, colorByAuthor, graph } = useBlocks();
  const bool = node.type === "Compare";
  return (
    <span
      className={`bk-reporter${bool ? " bool" : ""}`}
      data-bid={palette ? undefined : node.id}
      style={{ "--bk": colorOf(node, colorByAuthor, graph) } as React.CSSProperties}
      onPointerDown={(e) => { if (readOnly) return; e.stopPropagation(); startDrag(e, palette ? { kind: "new", type: palette } : { kind: "reporter", id: node.id }, e.currentTarget); }}
      title={colorByAuthor ? `by @${node.authorId}` : undefined}
    >
      <Parts node={node} />
    </span>
  );
}

function BlockRow({ node, hat, cap, onDown }: { node: GraphNode; hat?: boolean; cap?: boolean; onDown: (e: React.PointerEvent, el: HTMLElement) => void }) {
  const { colorByAuthor, hint, fresh, graph } = useBlocks();
  const drop = hat ? `top:${node.id}` : `after:${node.id}`;
  return (
    <div
      className={`bk-block${hat ? " hat" : ""}${cap ? " cap" : ""}${hint === drop ? " hint" : ""}${fresh?.has(node.id) ? " fresh" : ""}`}
      style={{ "--bk": colorOf(node, colorByAuthor, graph) } as React.CSSProperties}
      data-drop={cap ? undefined : drop}
      data-bid={node.id}
      onPointerDown={(e) => onDown(e, e.currentTarget)}
      title={colorByAuthor ? `by @${node.authorId}` : undefined}
    >
      <Parts node={node} />
    </div>
  );
}

function StackView({ blocks }: { blocks: Block[] }) {
  const { graph, startDrag, readOnly, colorByAuthor, hint } = useBlocks();
  return (
    <>
      {blocks.map((b) => {
        const node = graph.nodes.find((n) => n.id === b.id);
        if (!node) return null;
        const down = (e: React.PointerEvent, el: HTMLElement) => { if (readOnly) return; e.stopPropagation(); startDrag(e, { kind: "blocks", id: b.id }, el.closest(".bk-item") as HTMLElement); };
        if (node.type === "Branch") {
          const col = colorOf(node, colorByAuthor, graph);
          return (
            <div key={b.id} className="bk-item">
              <div className="bk-c" style={{ "--bk": col } as React.CSSProperties}>
                <div className={`bk-block c-top${hint === `mouth:${b.id}:then` ? " hint" : ""}`} data-bid={b.id} data-drop={`mouth:${b.id}:then`} onPointerDown={(e) => down(e, e.currentTarget)}><Parts node={node} /></div>
                <div className="bk-mouth"><StackView blocks={b.then ?? []} /></div>
                <div className={`bk-block c-mid${hint === `mouth:${b.id}:else` ? " hint" : ""}`} data-drop={`mouth:${b.id}:else`} onPointerDown={(e) => down(e, e.currentTarget)}><span className="bk-text">else</span></div>
                <div className="bk-mouth"><StackView blocks={b.else ?? []} /></div>
                <div className={`bk-block c-bot${hint === `after:${b.id}` ? " hint" : ""}`} data-drop={`after:${b.id}`} onPointerDown={(e) => down(e, e.currentTarget)} />
              </div>
            </div>
          );
        }
        return (
          <div key={b.id} className="bk-item">
            <BlockRow node={node} cap={CAP_TYPES.has(node.type)} onDown={down} />
          </div>
        );
      })}
    </>
  );
}

function ScriptView({ script }: { script: Script }) {
  const { graph, startDrag, readOnly } = useBlocks();
  const hat = script.hatId ? graph.nodes.find((n) => n.id === script.hatId) : null;
  return (
    <div className="bk-script" data-sid={script.hatId ?? script.body[0]?.id} style={{ left: script.x, top: script.y }}>
      {hat ? (
        <div className="bk-item">
          <BlockRow node={hat} hat onDown={(e, el) => { if (readOnly) return; e.stopPropagation(); startDrag(e, { kind: "script", id: hat.id }, el.closest(".bk-script") as HTMLElement); }} />
        </div>
      ) : null}
      <StackView blocks={script.body} />
    </div>
  );
}

/* ---------- links between scripts ---------- */

/** What connects one script to another: a block that creates a thing and the event that reacts to it, or a variable set and read. */
export function scriptLinks(g: Graph): Array<{ from: string; to: string; label: string; kind: "spawn" | "var" }> {
  const out: Array<{ from: string; to: string; label: string; kind: "spawn" | "var" }> = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, label: string, kind: "spawn" | "var") => { const k = `${from}>${to}`; if (from !== to && !seen.has(k)) { seen.add(k); out.push({ from, to, label, kind }); } };
  const collide = g.nodes.filter((n) => n.type === "OnCollide");
  for (const n of g.nodes) {
    if (n.type === "Spawn" || n.type === "Shoot") {
      const tag = BUILTIN_PREFABS[String(n.params.prefab)]?.tag ?? String(n.params.prefab);
      if (tag === "player") continue; // the player is everywhere; a line to every script would be noise
      for (const c of collide) if (c.params.tagA === tag || c.params.tagB === tag) add(n.id, c.id, `${tag} touches`, "spawn");
    }
    if (n.type === "SetVar") for (const r of g.nodes) if (r.type === "GetVar" && r.params.name === n.params.name) add(n.id, r.id, `${String(n.params.name)}`, "var");
  }
  return out;
}

/* ---------- palette ---------- */

const sampleNode = (type: NodeType): GraphNode => ({ id: `palette-${type}`, type, params: Object.fromEntries((SPEC[type].parts.filter((p) => typeof p !== "string") as Array<Exclude<Part, string>>).map((p) => [p.p, ""])), authorId: "you", originFork: "" });

export function BlockPalette({ onAdd, onIdea }: { onAdd: (t: NodeType) => void; onIdea?: () => void }) {
  const { startDrag, hint } = useBlocks();
  const [cat, setCat] = useState<Cat>("events");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  // scroll only the palette list; scrollIntoView would also scroll the page
  const jump = (c: Cat) => { setCat(c); const list = listRef.current, el = refs.current[c]; if (list && el) list.scrollTo({ top: el.offsetTop - list.offsetTop, behavior: "smooth" }); };
  return (
    <div className={`bk-palette${hint === "trash" ? " trash" : ""}`} data-trash="1">
      <nav className="bk-cats" aria-label="Block categories">
        {PALETTE_ORDER.map(([c]) => (
          <button key={c} className={cat === c ? "on" : ""} onClick={() => jump(c)}>
            <span className="dot" style={{ background: CATEGORIES[c].color }} />{CATEGORIES[c].label.split(" ")[0]}
          </button>
        ))}
      </nav>
      <div className="bk-palette-list" ref={listRef} onScroll={(e) => { const list = e.currentTarget; let cur: Cat = "events"; for (const [c] of PALETTE_ORDER) { const el = refs.current[c]; if (el && el.offsetTop - list.offsetTop <= list.scrollTop + 8) cur = c; } if (cur !== cat) setCat(cur); }}>
        {onIdea ? (
          <button className="ns-idea-btn bk-idea-btn" onClick={onIdea}>
            <span className="ns-plus">+</span><span><strong>Idea block</strong><small>Type anything; the assistant builds the blocks</small></span>
          </button>
        ) : null}
        {PALETTE_ORDER.map(([c, types]) => (
          <div key={c} ref={(el) => { refs.current[c] = el; }} className="bk-palette-group">
            <p className="bk-cat-title" style={{ color: CATEGORIES[c].color }}>{CATEGORIES[c].label}</p>
            {types.map((t) => {
              const node = withDefaults(sampleNode(t));
              return (
                <div key={t} className="bk-palette-item" onDoubleClick={() => onAdd(t)}>
                  {isValue(t) ? <ReporterView node={node} palette={t} /> : (
                    <div className={`bk-block${isEvent(t) ? " hat" : ""}${CAP_TYPES.has(t) ? " cap" : ""}${t === "Branch" ? " c-solo" : ""}`} style={{ "--bk": CATEGORIES[c].color } as React.CSSProperties} onPointerDown={(e) => startDrag(e, { kind: "new", type: t }, e.currentTarget)}>
                      <Parts node={node} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {hint === "trash" ? <div className="bk-trash-note">Drop to delete</div> : null}
    </div>
  );
}

function withDefaults(n: GraphNode): GraphNode {
  return { ...n, params: defaultParams(n.type) };
}

/* ---------- workspace ---------- */

export function BlockEditor({ graph, onChange, onTidy, onIdeaProposal, author, readOnly = false, colorByAuthor = false, palette = true, fresh }: { graph: Graph; onChange?: (g: Graph) => void; onTidy?: (g: Graph) => void; onIdeaProposal?: (p: Proposal) => void; author: string; readOnly?: boolean; colorByAuthor?: boolean; palette?: boolean; fresh?: Set<string> }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const scripts = useMemo(() => graphToScripts(graph), [graph]);
  // dependency links between scripts: what one script creates or sets, another reacts to or reads
  const linkDefs = useMemo(() => scriptLinks(graph), [graph]);
  const [links, setLinks] = useState<Array<{ d: string; x: number; y: number; label: string; kind: string }>>([]);
  useLayoutEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const z = zoomRef.current || 1;
    const base = host.getBoundingClientRect();
    const box = (id: string) => {
      const el = host.querySelector<HTMLElement>(`[data-bid="${id}"]`);
      if (!el || el.closest(".bk-palette")) return null;
      const r = el.getBoundingClientRect();
      return { l: (r.left - base.left) / z, r: (r.right - base.left) / z, t: (r.top - base.top) / z, b: (r.bottom - base.top) / z };
    };
    const out: typeof links = [];
    for (const l of linkDefs) {
      const a = box(l.from), b = box(l.to);
      if (!a || !b) continue;
      const x1 = a.r + 4, y1 = (a.t + a.b) / 2;
      const toRight = b.l > a.r;
      const x2 = toRight ? b.l - 4 : b.r + 4, y2 = (b.t + b.b) / 2;
      const bend = Math.max(60, Math.abs(x2 - x1) * 0.45);
      const d = `M${x1},${y1} C${x1 + bend},${y1} ${toRight ? x2 - bend : x2 + bend},${y2} ${x2},${y2}`;
      out.push({ d, x: (x1 + x2) / 2, y: (y1 + y2) / 2, label: l.label, kind: l.kind });
    }
    const key = JSON.stringify(out);
    setLinks((prev) => (JSON.stringify(prev) === key ? prev : out));
  });

  // measure the real scripts and push apart any that overlap (sizes depend on fonts and field widths)
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastTidy = useRef("");
  useLayoutEffect(() => {
    const host = canvasRef.current;
    if (!host || !onTidy) return;
    const z = zoomRef.current || 1;
    const boxes = [...host.querySelectorAll<HTMLElement>(":scope > .bk-script[data-sid]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.sid!, x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, w: r.width / z, h: r.height / z };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    const placed: typeof boxes = [];
    const moved: Array<{ id: string; x: number; y: number }> = [];
    for (const b of boxes) {
      let y = b.y;
      for (let guard = 0; guard < 50; guard += 1) {
        const hit = placed.find((p) => b.x < p.x + p.w + 16 && p.x < b.x + b.w + 16 && y < p.y + p.h + 16 && p.y < y + b.h + 16);
        if (!hit) break;
        y = hit.y + hit.h + 24;
      }
      if (y !== b.y) moved.push({ id: b.id, x: b.x, y });
      placed.push({ ...b, y });
    }
    if (!moved.length) return;
    // never apply the same tidy twice in a row: if it didn't take, stop rather than loop
    const key = JSON.stringify(moved);
    if (lastTidy.current === key) return;
    lastTidy.current = key;
    let g = graphRef.current;
    for (const m of moved) g = moveScript(g, m.id, m.x, m.y);
    onTidy(g);
  });
  const loose = useMemo(() => looseReporters(graph), [graph]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const area = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const update = useCallback((g: Graph) => onChange?.(g), [onChange]);

  const toWorkspace = (cx: number, cy: number) => {
    const r = area.current!.getBoundingClientRect();
    return { x: (cx - r.left + area.current!.scrollLeft) / zoom, y: (cy - r.top + area.current!.scrollTop) / zoom };
  };

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const authorRef = useRef(author);
  authorRef.current = author;
  const updateRef = useRef(update);
  updateRef.current = update;

  /** Listeners attach the moment a drag starts, so even a fast flick (down, move, up) lands. */
  const startDrag = useCallback((e: React.PointerEvent, payload: Payload, el: HTMLElement) => {
    if (readOnly || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input, select")) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    // the dragged piece: a block drags everything under it in its stack, like Scratch
    const moving: HTMLElement[] = [el];
    if (payload.kind === "blocks") { let n = el.nextElementSibling as HTMLElement | null; while (n) { moving.push(n); n = n.nextElementSibling as HTMLElement | null; } }
    const wrap = document.createElement("div");
    for (const m of moving) {
      const c = m.cloneNode(true) as HTMLElement;
      c.style.position = "relative"; c.style.left = "0"; c.style.top = "0";
      c.querySelectorAll("input, select").forEach((x) => x.removeAttribute("id"));
      wrap.appendChild(c);
    }
    const html = wrap.innerHTML;
    const zoomNow = zoomRef.current;
    const toWs = (cx: number, cy: number) => {
      const a = area.current!.getBoundingClientRect();
      return { x: (cx - a.left + area.current!.scrollLeft) / zoomRef.current, y: (cy - a.top + area.current!.scrollTop) / zoomRef.current };
    };
    const inMoving = (x: Element) => moving.some((m) => m.contains(x));
    const findTarget = (cx: number, cy: number): { target: string | null; trash: boolean } => {
      const els = document.elementsFromPoint(cx, cy) as HTMLElement[];
      if (els.some((x) => x.closest("[data-trash]"))) return { target: null, trash: payload.kind !== "new" };
      const wantsSlot = payload.kind === "reporter" || (payload.kind === "new" && isValue(payload.type));
      if (wantsSlot) {
        // nearest empty number slot within reach of the reporter's left edge
        let best: string | null = null, bd = 40 * 40;
        const lx = cx - ox, ly = cy - oy + 12 * zoomNow;
        area.current?.querySelectorAll<HTMLElement>("[data-slot]").forEach((d) => {
          if (inMoving(d)) return;
          const b = d.getBoundingClientRect();
          const dist = (lx - b.left) ** 2 + (ly - (b.top + b.height / 2)) ** 2;
          if (dist < bd) { bd = dist; best = d.dataset.slot!; }
        });
        return { target: best ? `slot:${best}` : null, trash: false };
      }
      if (payload.kind === "script" || (payload.kind === "new" && isEvent(payload.type))) return { target: null, trash: false };
      // snap by distance: the dragged block's top-left looks for the closest bottom-left attach point
      const lx = cx - ox, ly = cy - oy;
      let best: string | null = null, bd = 56 * 56;
      area.current?.querySelectorAll<HTMLElement>("[data-drop]").forEach((d) => {
        if (inMoving(d)) return;
        const b = d.getBoundingClientRect();
        const kind = d.dataset.drop!.split(":")[0];
        const ax = b.left + (kind === "mouth" ? 18 * zoomNow : 0);
        const dist = (lx - ax) ** 2 + (ly - b.bottom) ** 2;
        if (dist < bd) { bd = dist; best = d.dataset.drop!; }
      });
      return { target: best, trash: false };
    };
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      if (!started && payload.kind !== "new") moving.forEach((m) => m.classList.add("bk-lifted"));
      started = true;
      const t = findTarget(ev.clientX, ev.clientY);
      setDrag({ payload, x: ev.clientX, y: ev.clientY, ox, oy, html, target: t.target, overTrash: t.trash, zoom: payload.kind === "new" ? 1 : zoomNow });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      moving.forEach((m) => m.classList.remove("bk-lifted"));
      setDrag(null);
      const moved = Math.hypot(ev.clientX - sx, ev.clientY - sy) >= 3;
      if (!moved) return; // a click, not a drag
      const t = findTarget(ev.clientX, ev.clientY);
      const g = graphRef.current;
      const at = toWs(ev.clientX - ox, ev.clientY - oy);
      const ar = area.current?.getBoundingClientRect();
      const inArea = !!ar && ev.clientX >= ar.left && ev.clientX <= ar.right && ev.clientY >= ar.top && ev.clientY <= ar.bottom;
      const who = authorRef.current;
      let next: Graph | null = null;
      if (t.trash && payload.kind !== "new") next = deleteFrom(g, payload.id);
      else if (t.target?.startsWith("slot:")) {
        const [, nodeId, port] = t.target.split(":");
        if (payload.kind === "reporter") next = plug(g, payload.id, nodeId, port);
        else if (payload.kind === "new") { const a = addBlock(g, payload.type, who, { kind: "loose", x: at.x, y: at.y }); next = plug(a.graph, a.id, nodeId, port); }
      } else if (t.target) {
        const [kind, a, b2] = t.target.split(":");
        const target: Target = kind === "after" ? { kind: "after", blockId: a } : kind === "top" ? { kind: "top", hatId: a } : { kind: "mouth", branchId: a, arm: b2 as "then" | "else" };
        if (payload.kind === "blocks") next = moveBlocks(g, payload.id, target);
        else if (payload.kind === "new") next = addBlock(g, payload.type, who, target).graph;
      } else if (inArea) {
        if (payload.kind === "script") next = moveScript(g, payload.id, at.x, at.y);
        else if (payload.kind === "blocks") next = moveBlocks(g, payload.id, { kind: "loose", x: at.x, y: at.y });
        else if (payload.kind === "reporter") next = unplug(g, payload.id, at.x, at.y);
        else if (payload.kind === "new") next = addBlock(g, payload.type, who, { kind: "loose", x: at.x, y: at.y }).graph;
      }
      if (next) updateRef.current(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [readOnly]);

  // drag the empty workspace to pan
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const ctx: Ctx = { graph, fresh, readOnly, colorByAuthor, update, startDrag, hint: drag ? (drag.overTrash ? "trash" : drag.target) : null };

  // deleting: click a block to select it, then Delete or Backspace; or drag it onto the palette
  const [selected, setSelected] = useState<string | null>(null);
  const remove = useCallback((id: string) => { if (readOnly) return; update(deleteFrom(graph, id)); setSelected(null); }, [graph, readOnly, update]);
  useEffect(() => {
    const host = canvasRef.current;
    host?.querySelectorAll(".bk-sel").forEach((el) => el.classList.remove("bk-sel"));
    if (selected) host?.querySelector(`[data-bid="${selected}"]`)?.classList.add("bk-sel");
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!selected || readOnly) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, readOnly, remove]);

  const addIdeaAt = (cx?: number, cy?: number) => {
    if (!area.current) return;
    const r = area.current.getBoundingClientRect();
    const at = toWorkspace(cx ?? r.left + r.width * 0.35, cy ?? r.top + r.height * 0.25);
    setIdeas((xs) => [...xs, newIdea(Math.round(at.x), Math.round(at.y))]);
  };
  const dragIdea = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const start = ideas.find((x) => x.id === id);
    if (!start) return;
    const move = (ev: PointerEvent) => setIdeas((xs) => xs.map((x) => (x.id === id ? { ...x, x: start.x + (ev.clientX - sx) / zoomRef.current, y: start.y + (ev.clientY - sy) / zoomRef.current } : x)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const ideaViews = ideas.map((i) => (
    <div key={i.id} className="bk-idea" style={{ left: i.x, top: i.y }}>
      <IdeaCard idea={i} graph={graph} author={author}
        onText={(t) => setIdeas((xs) => xs.map((x) => (x.id === i.id ? { ...x, text: t } : x)))}
        onRemove={() => setIdeas((xs) => xs.filter((x) => x.id !== i.id))}
        onProposal={(p) => { setIdeas((xs) => xs.filter((x) => x.id !== i.id)); onIdeaProposal?.(p); }}
        dragHandle={dragIdea(i.id)} />
    </div>
  ));

  const addCentered = (t: NodeType) => {
    if (readOnly || !area.current) return;
    const r = area.current.getBoundingClientRect();
    const at = toWorkspace(r.left + r.width * 0.4, r.top + r.height * 0.35);
    update(addBlock(graph, t, author, { kind: "loose", x: at.x, y: at.y }).graph);
  };

  return (
    <BlockCtx.Provider value={ctx}>
      <div className={`bk-editor${palette ? "" : " no-palette"}`}>
        {palette ? <div className={`bk-palette-wrap${readOnly ? " inert" : ""}`} inert={readOnly || undefined}><BlockPalette onAdd={addCentered} onIdea={onIdeaProposal ? () => addIdeaAt() : undefined} /></div> : null}
        {palette ? <Splitter name="blocks-palette" cssVar="--pal-w" min={220} max={640} initial={330} label="Resize the block palette" /> : null}
        <div
          ref={area}
          className={`bk-area${drag ? " dragging" : ""}`}
          onPointerDownCapture={(e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bid]"); setSelected(b?.dataset.bid ?? null); }}
          onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("bk-canvas")) { pan.current = { x: e.clientX, y: e.clientY, sl: area.current!.scrollLeft, st: area.current!.scrollTop }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } }}
          onPointerMove={(e) => { if (pan.current && area.current) { area.current.scrollLeft = pan.current.sl - (e.clientX - pan.current.x); area.current.scrollTop = pan.current.st - (e.clientY - pan.current.y); } }}
          onPointerUp={() => { pan.current = null; }}
          onDoubleClick={(e) => { if (!readOnly && onIdeaProposal && (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("bk-canvas"))) addIdeaAt(e.clientX, e.clientY); }}
          onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(1.6, Math.max(0.5, z - e.deltaY * 0.002))); } }}
        >
          <div className="bk-canvas" ref={canvasRef} style={{ transform: `scale(${zoom})` }}>
            {scripts.map((s) => <ScriptView key={s.hatId ?? s.body[0]?.id} script={s} />)}
            {loose.map((r) => (
              <div key={r.id} className="bk-script" style={{ left: r.pos?.x ?? 40, top: r.pos?.y ?? 40 }}><ReporterView node={r} /></div>
            ))}
            <svg className="bk-links" aria-hidden="true">
              <defs><marker id="bk-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>
              {links.map((l, i) => (
                <g key={i} className={`bk-link ${l.kind}`}>
                  <path d={l.d} markerEnd="url(#bk-arrow)" />
                  <text x={l.x} y={l.y - 6} textAnchor="middle">{l.label}</text>
                </g>
              ))}
            </svg>
            {ideaViews}
            {!scripts.length && !loose.length && !ideas.length ? <p className="bk-empty">Drag a block from the left, starting with a yellow “when …” block. Or double-click here and describe an idea.</p> : null}
          </div>
          {selected && !readOnly && !drag ? <div className="bk-sel-hint" aria-live="polite">Delete or Backspace removes the selected block and the ones under it</div> : null}
          <div className="bk-zoom">
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} aria-label="Zoom out">−</button>
            <button onClick={() => setZoom(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} aria-label="Zoom in">+</button>
          </div>
        </div>
      </div>
      {drag && typeof document !== "undefined" ? createPortal(
        <div className="bk-ghost" style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, transform: `scale(${drag.zoom})` }} dangerouslySetInnerHTML={{ __html: drag.html }} />,
        document.body,
      ) : null}
    </BlockCtx.Provider>
  );
}

