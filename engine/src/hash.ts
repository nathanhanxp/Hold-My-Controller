import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Edge, Graph } from "./schema";

/** JSON with object keys sorted and no whitespace. Numbers must be integers so every language agrees. */
export function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new TypeError(`canonical(): non-integer number ${value}`);
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  throw new TypeError(`canonical(): unsupported ${typeof value}`);
}

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonical(value));
}

const edgeKey = (e: Edge) => `${e.from.node}\u0000${e.from.port}\u0000${e.to.node}\u0000${e.to.port}\u0000${e.kind}`;
export function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0));
}

export function incomingEdges(g: Pick<Graph, "edges">, nodeId: string): Edge[] {
  return sortEdges(g.edges.filter((e) => e.to.node === nodeId));
}

/** Structural identity of a node: its type, params and what feeds it. Used for diffs. */
export function nodeHash(g: Pick<Graph, "nodes" | "edges">, nodeId: string): string {
  const n = g.nodes.find((x) => x.id === nodeId);
  if (!n) throw new Error(`unknown node ${nodeId}`);
  return hashOf({ type: n.type, params: n.params, incoming: incomingEdges(g, nodeId) });
}

/** Content hash of a graph. Includes authorship, so attribution is part of what gets anchored. Title and theme are excluded. */
export function graphHash(g: Graph): string {
  return hashOf({
    schema: g.schema,
    kind: g.kind,
    parent: g.parent,
    root: g.root,
    sources: [...g.sources].sort(),
    license: g.license,
    nodes: [...g.nodes]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((n) => ({ id: n.id, type: n.type, params: n.params, authorId: n.authorId, originFork: n.originFork })),
    edges: sortEdges(g.edges),
    // custom prefabs change how the game plays; absent or empty keeps older hashes unchanged
    ...(g.prefabs && Object.keys(g.prefabs).length ? { prefabs: g.prefabs } : {}),
  });
}
