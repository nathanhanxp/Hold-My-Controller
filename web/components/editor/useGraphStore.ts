"use client";
import { useCallback, useReducer } from "react";
import { CATALOG, emptyGraph, type Edge, type Graph, type GraphNode, type NodeType } from "@forklab/engine";

export type GraphState = { graph: Graph; past: Graph[]; future: Graph[]; selection: string[]; lastUndoneEdge: string | null };

type Action =
  | { t: "set"; graph: Graph; history?: boolean }
  | { t: "addNode"; type: NodeType; author: string; pos: { x: number; y: number } }
  | { t: "updateParam"; id: string; key: string; value: number | string }
  | { t: "move"; id: string; pos: { x: number; y: number } }
  | { t: "positions"; pos: Record<string, { x: number; y: number }> }
  | { t: "removeNodes"; ids: string[] }
  | { t: "addEdge"; edge: Edge }
  | { t: "removeEdge"; edge: Edge }
  | { t: "meta"; patch: Partial<Pick<Graph, "title" | "tags" | "license" | "kind" | "theme" | "view">> }
  | { t: "select"; ids: string[] }
  | { t: "undo" }
  | { t: "redo" };

const sameEdge = (a: Edge, b: Edge) => a.from.node === b.from.node && a.from.port === b.from.port && a.to.node === b.to.node && a.to.port === b.to.port;
const edgeId = (e: Edge) => `${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}`;

function nextId(g: Graph): string {
  let i = g.nodes.length + 1;
  const ids = new Set(g.nodes.map((n) => n.id));
  while (ids.has(`n${String(i).padStart(2, "0")}`)) i += 1;
  return `n${String(i).padStart(2, "0")}`;
}

function commit(s: GraphState, graph: Graph): GraphState {
  return { ...s, graph, past: [...s.past.slice(-99), s.graph], future: [], lastUndoneEdge: null };
}

function reducer(s: GraphState, a: Action): GraphState {
  switch (a.t) {
    case "set":
      return a.history === false ? { ...s, graph: a.graph } : commit(s, a.graph);
    case "addNode": {
      const params: GraphNode["params"] = {};
      for (const p of CATALOG[a.type].params) params[p.name] = p.default;
      const node: GraphNode = { id: nextId(s.graph), type: a.type, params, authorId: a.author, originFork: "", pos: a.pos };
      return { ...commit(s, { ...s.graph, nodes: [...s.graph.nodes, node] }), selection: [node.id] };
    }
    case "updateParam":
      return commit(s, { ...s.graph, nodes: s.graph.nodes.map((n) => (n.id === a.id ? { ...n, params: { ...n.params, [a.key]: a.value } } : n)) });
    case "positions":
      // layout only: merge positions into the current graph, never replace it (no undo entry)
      return { ...s, graph: { ...s.graph, nodes: s.graph.nodes.map((n) => (a.pos[n.id] ? { ...n, pos: a.pos[n.id] } : n)) } };
    case "move":
      return { ...s, graph: { ...s.graph, nodes: s.graph.nodes.map((n) => (n.id === a.id ? { ...n, pos: a.pos } : n)) } };
    case "removeNodes": {
      const ids = new Set(a.ids);
      return { ...commit(s, { ...s.graph, nodes: s.graph.nodes.filter((n) => !ids.has(n.id)), edges: s.graph.edges.filter((e) => !ids.has(e.from.node) && !ids.has(e.to.node)) }), selection: [] };
    }
    case "addEdge":
      if (s.graph.edges.some((e) => sameEdge(e, a.edge))) return s;
      return commit(s, { ...s.graph, edges: [...s.graph.edges, a.edge] });
    case "removeEdge":
      return commit(s, { ...s.graph, edges: s.graph.edges.filter((e) => !sameEdge(e, a.edge)) });
    case "meta":
      return commit(s, { ...s.graph, ...a.patch });
    case "select":
      return { ...s, selection: a.ids };
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      const added = s.graph.edges.find((e) => !prev.edges.some((p) => sameEdge(p, e)));
      return { ...s, graph: prev, past: s.past.slice(0, -1), future: [s.graph, ...s.future], lastUndoneEdge: added ? edgeId(added) : null };
    }
    case "redo": {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return { ...s, graph: next, past: [...s.past, s.graph], future: rest, lastUndoneEdge: null };
    }
  }
}

export function useGraphStore(initial?: Graph, author = "guest") {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ graph: initial ?? emptyGraph(author), past: [], future: [], selection: [], lastUndoneEdge: null }));
  const d = useCallback((a: Action) => dispatch(a), []);
  return { state, dispatch: d };
}

export { edgeId, sameEdge };
