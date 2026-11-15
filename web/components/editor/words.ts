import { CATALOG, type GraphNode } from "@forklab/engine";

const PARAM_SHOWN = ["key", "when", "entity", "direction", "prefab", "tagA", "tagB", "axis", "name", "everyN"];

/** A node in a few words: "Move (player, left)". */
export function nodeWords(n: GraphNode | undefined): string {
  if (!n) return "a block";
  const pretty = (k: string, v: unknown) => (k === "key" ? String(v).replace(/^Key/, "").replace(/^Arrow(\w+)/, "$1 arrow") : String(v));
  const bits = PARAM_SHOWN.filter((k) => n.params[k] !== undefined && n.params[k] !== "").map((k) => pretty(k, n.params[k])).slice(0, 3);
  return `${CATALOG[n.type].label}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

