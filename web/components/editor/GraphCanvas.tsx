"use client";
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Connection, type Edge as RFEdge, type Node as RFNode, type NodeChange, type EdgeChange, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { connectionProblem, countedNodes, portOf, type Edge, type Graph } from "@forklab/engine";
import { NodeView, type NodeData } from "./NodeView";
import { authorColor } from "@/lib/colors";
import { edgeId } from "./useGraphStore";

const nodeTypes = { fl: NodeView };

type Props = {
  graph: Graph;
  readOnly?: boolean;
  ghost?: boolean;
  colorByAuthor?: boolean;
  selection?: string[];
  lastUndoneEdge?: string | null;
  onParam?: (id: string, key: string, value: number | string) => void;
  onMove?: (id: string, pos: { x: number; y: number }) => void;
  onSelect?: (ids: string[]) => void;
  onRemoveNodes?: (ids: string[]) => void;
  onConnectEdge?: (e: Edge) => void;
  onRemoveEdge?: (e: Edge) => void;
  onDropType?: (type: string, pos: { x: number; y: number }) => void;
  height?: number | string;
};

function toEdge(c: Connection | RFEdge, g: Graph): Edge | null {
  if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return null;
  const from = g.nodes.find((n) => n.id === c.source);
  if (!from) return null;
  const isExec = portOf(from.type, "out", c.sourceHandle)?.kind === "exec";
  return { from: { node: c.source, port: c.sourceHandle }, to: { node: c.target, port: c.targetHandle }, kind: isExec ? "exec" : "data" };
}

function Canvas(p: Props) {
  const { graph, readOnly, ghost, colorByAuthor = false, selection = [] } = p;
  const [reason, setReason] = useState<string | null>(null);
  const [retracting, setRetracting] = useState<RFEdge | null>(null);
  const counted = useMemo(() => countedNodes(graph), [graph]);

  useEffect(() => {
    if (!reason) return;
    const t = setTimeout(() => setReason(null), 4000);
    return () => clearTimeout(t);
  }, [reason]);

  // Undo retracts the thread along the edge (skipped under reduced motion via CSS).
  const [prevEdges, setPrevEdges] = useState(graph.edges);
  useEffect(() => {
    if (p.lastUndoneEdge) {
      const e = prevEdges.find((x) => edgeId(x) === p.lastUndoneEdge);
      if (e) {
        setRetracting({ id: `retract-${p.lastUndoneEdge}`, source: e.from.node, sourceHandle: e.from.port, target: e.to.node, targetHandle: e.to.port, className: "thread-retract", style: { stroke: e.kind === "exec" ? "var(--figure)" : "var(--vase)", strokeWidth: 2 }, selectable: false });
        const t = setTimeout(() => setRetracting(null), 520);
        setPrevEdges(graph.edges);
        return () => clearTimeout(t);
      }
    }
    setPrevEdges(graph.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.edges, p.lastUndoneEdge]);

  const nodes: RFNode<NodeData>[] = graph.nodes.map((n, i) => ({
    id: n.id,
    type: "fl",
    position: n.pos ?? { x: (i % 4) * 240, y: Math.floor(i / 4) * 160 },
    data: { node: n, colorByAuthor, dead: !counted.has(n.id), ghost, readOnly, onParam: p.onParam },
    selected: selection.includes(n.id),
    draggable: !readOnly,
  }));
  const edges: RFEdge[] = graph.edges.map((e) => ({
    id: edgeId(e),
    source: e.from.node,
    sourceHandle: e.from.port,
    target: e.to.node,
    targetHandle: e.to.port,
    style: { stroke: colorByAuthor ? authorColor(graph.nodes.find((n) => n.id === e.to.node)?.authorId ?? "") : e.kind === "exec" ? "var(--figure)" : "var(--vase)", strokeWidth: 2, strokeDasharray: e.kind === "data" ? "5 4" : undefined },
    deletable: !readOnly,
  }));
  if (retracting) edges.push(retracting);

  const onNodesChange = (changes: NodeChange[]) => {
    if (readOnly) return;
    const sel: string[] = [...selection];
    let selChanged = false;
    for (const c of changes) {
      if (c.type === "position" && c.position) p.onMove?.(c.id, { x: Math.round(c.position.x), y: Math.round(c.position.y) });
      if (c.type === "select") { selChanged = true; if (c.selected) { if (!sel.includes(c.id)) sel.push(c.id); } else { const i = sel.indexOf(c.id); if (i >= 0) sel.splice(i, 1); } }
      if (c.type === "remove") p.onRemoveNodes?.([c.id]);
    }
    if (selChanged) p.onSelect?.(sel);
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readOnly) return;
    for (const c of changes) {
      if (c.type === "remove") {
        const e = graph.edges.find((x) => edgeId(x) === c.id);
        if (e) p.onRemoveEdge?.(e);
      }
    }
  };
  const onConnect = (c: Connection) => {
    const e = toEdge(c, graph);
    if (!e) return;
    const problem = connectionProblem(graph, e);
    if (problem) { setReason(problem); return; }
    p.onConnectEdge?.(e);
  };

  return (
    <div className="warp" style={{ height: p.height ?? "100%", minHeight: 420, position: "relative" }}
      onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
      onDrop={(e) => {
        const t = e.dataTransfer.getData("application/forklab-node");
        if (!t || readOnly) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        p.onDropType?.(t, { x: Math.round(e.clientX - r.left - 80), y: Math.round(e.clientY - r.top - 20) });
      }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.25}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} color="rgba(94,107,112,0.12)" />
        <Controls showInteractive={false} />
        {!readOnly ? <MiniMap pannable zoomable style={{ background: "var(--panel)", borderRadius: 10 }} nodeColor={(n) => (colorByAuthor ? authorColor((n.data as NodeData).node.authorId) : "#1B1511")} /> : null}
      </ReactFlow>
      {reason ? <div role="alert" className="notice warn" style={{ position: "absolute", left: 12, bottom: 12, maxWidth: 420, zIndex: 10 }}>{reason}</div> : null}
      {ghost ? <div className="notice sim" style={{ position: "absolute", left: 12, top: 12, zIndex: 10 }}>Proposal preview. Nothing changes until you press Apply.</div> : null}
    </div>
  );
}

export function GraphCanvas(p: Props) {
  return <ReactFlowProvider><Canvas {...p} /></ReactFlowProvider>;
}
