"use client";
import { Splitter } from "./Splitter";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, Handle, Position, ReactFlowProvider, useReactFlow,
  type Connection, type Edge as RFEdge, type Node as RFNode, type NodeChange, type EdgeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CATALOG, computeShares, earningNodes, connectionProblem, countedNodes, portOf, type Edge, type Graph, type GraphNode, type NodeType } from "@forklab/engine";
import { CATEGORIES, PALETTE_ORDER, SPEC } from "../blocks/Blocks";
import { defaultParams, newId, setParam } from "../blocks/model";
import { layoutGraph } from "./layout";
import { authorColor, graphColors } from "@/lib/colors";
import { IdeaCard, type Idea } from "./ideas";
import { nodeWords, type Advice } from "./Advice";
import type { Proposal } from "./AIPanel";

export type Pos = { x: number; y: number };

type GameData = { node: GraphNode; fresh: boolean; dead: boolean; readOnly: boolean; colorByAuthor: boolean; authorTint?: string; onParam: (id: string, k: string, v: number | string) => void };
type IdeaData = { idea: Idea; graph: Graph; author: string; onText: (id: string, t: string) => void; onDone: (id: string, p: Proposal) => void; onRemove: (id: string) => void };

const KEY_LABEL: Record<string, string> = { Space: "Space", ArrowLeft: "Left arrow", ArrowRight: "Right arrow", ArrowUp: "Up arrow", ArrowDown: "Down arrow", KeyA: "A", KeyD: "D", KeyW: "W", KeyS: "S" };

/** One engine node, styled like a game-engine visual script: coloured header, typed pins, inline fields. */
const GameNode = memo(function GameNode({ data, selected }: NodeProps & { data: GameData }) {
  const { node, fresh, dead, readOnly, colorByAuthor, authorTint, onParam } = data;
  const def = CATALOG[node.type];
  const cat = SPEC[node.type].cat;
  const color = colorByAuthor ? authorTint ?? authorColor(node.authorId) : CATEGORIES[cat].color;
  const rows = Math.max(def.inputs.length, def.outputs.length);
  return (
    <div className={`gn${selected ? " sel" : ""}${fresh ? " fresh" : ""}${dead ? " dead" : ""}`} style={{ "--gn": color } as React.CSSProperties} title={dead ? "Not reached from any event, so it never runs." : def.help}>
      <div className="gn-head"><span className="gn-cat">{CATEGORIES[cat].label.split(" ")[0]}</span><span className="gn-title">{def.label}</span></div>
      <div className="gn-pins" style={{ height: rows * 22 }}>
        {def.inputs.map((p, i) => (
          <div key={`i${p.name}`} className="gn-pin in" style={{ top: i * 22 }}>
            <Handle id={p.name} type="target" position={Position.Left} className={p.kind === "exec" ? "pin-exec" : "pin-num"} isConnectable={!readOnly} />
            <span>{p.name === "in" ? "" : p.name}</span>
          </div>
        ))}
        {def.outputs.map((p, i) => (
          <div key={`o${p.name}`} className="gn-pin out" style={{ top: i * 22 }}>
            <span>{p.name === "out" ? (p.kind === "exec" ? "" : "value") : p.name === "true" ? "then" : p.name === "false" ? "else" : p.name === "out" ? "" : p.name}</span>
            <Handle id={p.name} type="source" position={Position.Right} className={p.kind === "exec" ? "pin-exec" : "pin-num"} isConnectable={!readOnly} />
          </div>
        ))}
      </div>
      {def.params.length ? (
        <div className="gn-fields nodrag">
          {def.params.map((p) => {
            const v = node.params[p.name] ?? p.default;
            const id = `gn-${node.id}-${p.name}`;
            return (
              <label key={p.name} htmlFor={id} className="gn-field">
                <span>{p.name}</span>
                {readOnly ? <em>{String(v)}</em> : p.options ? (
                  <select id={id} value={String(v)} onChange={(e) => onParam(node.id, p.name, e.target.value)}>
                    {p.options.map((o) => <option key={o} value={o}>{p.name === "key" ? KEY_LABEL[o] ?? o : o}</option>)}
                  </select>
                ) : p.kind === "int" ? (
                  <input id={id} type="number" step={1} value={Number(v)} onChange={(e) => onParam(node.id, p.name, Math.trunc(Number(e.target.value) || 0))} />
                ) : (
                  <input id={id} type="text" maxLength={40} value={String(v)} onChange={(e) => onParam(node.id, p.name, e.target.value.replace(/[^\x20-\x7e]/g, ""))} />
                )}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

/** A free-text node: write anything, and the assistant turns it into real nodes wired into the game. */
const IdeaNode = memo(function IdeaNode({ data }: NodeProps & { data: IdeaData }) {
  const { idea, graph, author, onText, onDone, onRemove } = data;
  return <IdeaCard idea={idea} graph={graph} author={author} onText={(t) => onText(idea.id, t)} onRemove={() => onRemove(idea.id)} onProposal={(p) => onDone(idea.id, p)} />;
});

const nodeTypes = { game: GameNode, idea: IdeaNode };

type Props = {
  graph: Graph;
  proposal: Proposal | null;
  author: string;
  colorByAuthor: boolean;
  positions: React.MutableRefObject<Map<string, Pos>>;
  onChange: (g: Graph) => void;
  onProposal: (p: Proposal, anchor: Pos) => void;
  onAdvice?: (a: Advice) => void;
};

function autoPositions(g: Graph): Map<string, Pos> {
  const laid = layoutGraph(g);
  return new Map(laid.nodes.map((n) => [n.id, { x: n.pos?.x ?? 0, y: n.pos?.y ?? 0 }]));
}

function Studio({ graph, proposal, author, colorByAuthor, positions, onChange, onProposal, onAdvice }: Props) {
  const [wire, setWire] = useState<{ id: string; x: number; y: number } | null>(null);
  const flow = useReactFlow();
  const shown = proposal?.graph ?? graph;
  const readOnly = !!proposal;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [, force] = useState(0);
  const anchor = useRef<Pos | null>(null);
  const counted = useMemo(() => countedNodes(shown), [shown]);
  // one colour per author for this game, in payout order, matching "Who gets paid"
  const tints = useMemo(() => graphColors(shown, computeShares(shown).map((x) => x.handle)), [shown]);
  const earns = useMemo(() => earningNodes(shown), [shown]);
  const known = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph]);

  // give every node a place: first visit lays the graph out, later nodes land near where they were asked for
  const pos = positions.current;
  if (!shown.nodes.every((n) => pos.has(n.id))) {
    if (pos.size === 0) for (const [k, v] of autoPositions(shown)) pos.set(k, v);
    const fresh = shown.nodes.filter((n) => !pos.has(n.id));
    const base = anchor.current ?? { x: Math.max(0, ...[...pos.values()].map((p) => p.x)) + 280, y: 40 };
    fresh.forEach((n, i) => pos.set(n.id, { x: base.x + (i % 3) * 250, y: base.y + Math.floor(i / 3) * 170 }));
  }
  useEffect(() => { if (!proposal) anchor.current = null; }, [proposal]);
  useEffect(() => { if (!reason) return; const t = setTimeout(() => setReason(null), 4000); return () => clearTimeout(t); }, [reason]);

  const onParam = (id: string, k: string, v: number | string) => onChange(setParam(graph, id, k, v));
  const updateIdea = (id: string, patch: Partial<Idea>) => setIdeas((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const done = (id: string, p: Proposal) => {
    const idea = ideas.find((x) => x.id === id);
    anchor.current = idea ? { x: idea.x + 320, y: idea.y } : null;
    setIdeas((xs) => xs.filter((x) => x.id !== id));
    onProposal(p, anchor.current ?? { x: 0, y: 0 });
  };

  const rfNodes: RFNode[] = [
    ...shown.nodes.map((n) => ({
      id: n.id, type: "game", position: pos.get(n.id) ?? { x: 0, y: 0 }, draggable: true,
      data: { node: n, fresh: !!proposal && !known.has(n.id), dead: !counted.has(n.id), readOnly, colorByAuthor, authorTint: earns.has(n.id) ? tints.get(n.authorId) : "#4a4852", onParam } satisfies GameData,
    })),
    ...ideas.map((i) => ({
      id: `idea:${i.id}`, type: "idea", position: { x: i.x, y: i.y }, draggable: true,
      data: { idea: i, graph, author, onText: (id: string, t: string) => updateIdea(id, { text: t }), onDone: done, onRemove: (id: string) => setIdeas((xs) => xs.filter((x) => x.id !== id)) } satisfies IdeaData,
    })),
  ];
  const rfEdges: RFEdge[] = shown.edges.map((e) => ({
    id: `${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}`,
    source: e.from.node, sourceHandle: e.from.port, target: e.to.node, targetHandle: e.to.port,
    type: "default",
    className: e.kind === "exec" ? "wire-exec" : "wire-num",
    animated: !!proposal && (!known.has(e.from.node) || !known.has(e.to.node)),
    deletable: !readOnly,
  }));

  const onNodesChange = (changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === "position" && c.position) {
        if (c.id.startsWith("idea:")) updateIdea(c.id.slice(5), { x: c.position.x, y: c.position.y });
        else { pos.set(c.id, { x: Math.round(c.position.x), y: Math.round(c.position.y) }); force((v) => v + 1); }
      }
      if (c.type === "remove" && !readOnly) {
        if (c.id.startsWith("idea:")) setIdeas((xs) => xs.filter((x) => `idea:${x.id}` !== c.id));
        else onChange({ ...graph, nodes: graph.nodes.filter((n) => n.id !== c.id), edges: graph.edges.filter((e) => e.from.node !== c.id && e.to.node !== c.id) });
      }
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readOnly) return;
    const doomed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
    if (doomed.size) onChange({ ...graph, edges: graph.edges.filter((e) => !doomed.has(`${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}`)) });
  };
  const onConnect = (c: Connection) => {
    if (readOnly || !c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
    const from = graph.nodes.find((n) => n.id === c.source);
    if (!from) return;
    const edge: Edge = { from: { node: c.source, port: c.sourceHandle }, to: { node: c.target, port: c.targetHandle }, kind: portOf(from.type, "out", c.sourceHandle)?.kind === "exec" ? "exec" : "data" };
    // an exec output feeds one chain: rewiring it replaces the old wire, like most engines
    const edges = graph.edges.filter((e) => !(edge.kind === "exec" && e.kind === "exec" && e.from.node === edge.from.node && e.from.port === edge.from.port) && !(e.to.node === edge.to.node && e.to.port === edge.to.port && edge.kind === "data"));
    const problem = connectionProblem({ ...graph, edges }, edge);
    if (problem) {
      const a = graph.nodes.find((n) => n.id === edge.from.node), b = graph.nodes.find((n) => n.id === edge.to.node);
      if (onAdvice) onAdvice({ action: "connect", title: "That connection won't work", what: `${nodeWords(a)} "${edge.from.port}" to ${nodeWords(b)} "${edge.to.port}"`, problem, affected: [], tone: "warn" });
      else setReason(problem);
      return;
    }
    onChange({ ...graph, edges: [...edges, edge] });
  };

  const center = (): Pos => {
    const el = document.querySelector(".ns-canvas");
    const r = el?.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) * 0.45, y: (r?.top ?? 0) + (r?.height ?? 600) * 0.35 });
  };
  const addType = (t: NodeType, at?: Pos) => {
    if (readOnly) return;
    const p = at ?? center();
    const id = newId(graph);
    pos.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
    onChange({ ...graph, nodes: [...graph.nodes, { id, type: t, params: defaultParams(t), authorId: author, originFork: "" }] });
  };
  const addIdea = (at?: Pos) => {
    const p = at ?? center();
    setIdeas((xs) => [...xs, { id: Math.random().toString(36).slice(2, 8), text: "", x: p.x, y: p.y }]);
  };

  return (
    <div className="ns">
      <Splitter name="nodes-palette" cssVar="--ns-w" min={180} max={520} initial={220} label="Resize the node list" />
      <aside className="ns-palette" aria-label="Nodes">
        <button className="ns-idea-btn" draggable onDragStart={(e) => e.dataTransfer.setData("application/forklab-node", "__idea")} onClick={() => addIdea()} disabled={readOnly}>
          <span className="ns-plus">+</span><span><strong>Idea node</strong><small>Type anything; the assistant builds it</small></span>
        </button>
        {PALETTE_ORDER.map(([c, types]) => (
          <div key={c} className="ns-group">
            <p style={{ color: CATEGORIES[c].color }}>{CATEGORIES[c].label}</p>
            {types.map((t) => (
              <button key={t} className="ns-item" style={{ "--gn": CATEGORIES[c].color } as React.CSSProperties} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData("application/forklab-node", t)} onClick={() => addType(t)} disabled={readOnly} title={CATALOG[t].help}>
                {CATALOG[t].label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="ns-canvas"
        onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
        onDrop={(e) => {
          const t = e.dataTransfer.getData("application/forklab-node");
          if (!t || readOnly) return;
          const p = flow.screenToFlowPosition({ x: e.clientX - 90, y: e.clientY - 20 });
          if (t === "__idea") addIdea(p); else addType(t as NodeType, p);
        }}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains("react-flow__pane")) addIdea(flow.screenToFlowPosition({ x: e.clientX - 140, y: e.clientY - 40 })); }}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={(e, edge) => { if (!readOnly) setWire({ id: edge.id, x: e.clientX, y: e.clientY }); }}
          onPaneClick={() => setWire(null)}
          nodesConnectable={!readOnly}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
          zoomOnDoubleClick={false}
          defaultViewport={{ x: 36, y: 28, zoom: 0.78 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} size={1.2} color="rgba(236,222,200,0.08)" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        {reason ? <div role="alert" className="ns-toast">{reason}</div> : null}
        {wire ? (() => {
          const host = document.querySelector(".ns-canvas")?.getBoundingClientRect();
          return (
            <div className="wire-menu" style={{ left: wire.x - (host?.left ?? 0), top: wire.y - (host?.top ?? 0) }}>
              <button className="btn sm" onClick={() => { onChange({ ...graph, edges: graph.edges.filter((e) => `${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}` !== wire.id) }); setWire(null); }}>Disconnect</button>
            </div>
          );
        })() : null}
        {!graph.nodes.length && !ideas.length ? <p className="ns-empty">Double-click anywhere to add an idea node, or pick a node on the left.</p> : null}
      </div>
    </div>
  );
}

export function NodeStudio(p: Props) {
  return <ReactFlowProvider><Studio {...p} /></ReactFlowProvider>;
}

