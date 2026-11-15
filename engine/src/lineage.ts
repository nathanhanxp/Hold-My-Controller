import { graphHash } from "./hash";
import type { Graph } from "./schema";

export type Hashed = { graph: Graph; hash: string };

export function attachHash(graph: Graph): Hashed {
  return { graph, hash: graphHash(graph) };
}

/** Resolve a node's origin: "" means "the graph it is in". */
export function resolveOrigin(origin: string, selfHash: string): string {
  return origin === "" ? selfHash : origin;
}
