import { countedNodes } from "./attribution";
import { param, type Graph, type GraphNode } from "./schema";

export type RuleResult = { ok: boolean; reasons: string[] };
export type Rule = { id: string; episode: string; title: string; rule: string; check(g: Graph): RuleResult };

function liveView(g: Graph) {
  const counted = countedNodes(g);
  const nodes = g.nodes.filter((n) => counted.has(n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = g.edges.filter((e) => counted.has(e.from.node) && counted.has(e.to.node));
  return { nodes, byId, edges };
}

/** Nodes reachable from `start` along exec edges (including start). */
function execReach(view: ReturnType<typeof liveView>, start: string): GraphNode[] {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of view.edges) if (e.kind === "exec" && e.from.node === id) stack.push(e.to.node);
  }
  return [...seen].map((id) => view.byId.get(id)!).filter(Boolean);
}

/** True if any value feeding `nodeId` (transitively through data edges) is of `type`. */
function fedBy(view: ReturnType<typeof liveView>, nodeId: string, type: string): boolean {
  const seen = new Set<string>();
  const stack = view.edges.filter((e) => e.kind === "data" && e.to.node === nodeId).map((e) => e.from.node);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (view.byId.get(id)?.type === type) return true;
    for (const e of view.edges) if (e.kind === "data" && e.to.node === id) stack.push(e.from.node);
  }
  return false;
}

export const oneKey: Rule = {
  id: "one_key", episode: "1", title: "One key", rule: "Exactly one input key may be used.",
  check(g) {
    const view = liveView(g);
    const keys = [...new Set(view.nodes.filter((n) => n.type === "OnKey").map((n) => String(param(n, "key"))))].sort();
    if (keys.length === 1) return { ok: true, reasons: [`Uses one key: ${keys[0]}.`] };
    if (keys.length === 0) return { ok: false, reasons: ["No key is used. Add one On key node."] };
    return { ok: false, reasons: [`Found ${keys.length} keys: ${keys.join(", ")}.`] };
  },
};

export const sacredObject: Rule = {
  id: "sacred", episode: "2", title: "Sacred object", rule: "Touching the sacred entity must lose the game.",
  check(g) {
    const view = liveView(g);
    const collides = view.nodes.filter((n) => {
      if (n.type !== "OnCollide") return false;
      const a = String(param(n, "tagA"));
      const b = String(param(n, "tagB"));
      return (a === "player" && b === "sacred") || (a === "sacred" && b === "player");
    });
    if (!collides.length) return { ok: false, reasons: ["No counted On collide between player and sacred."] };
    const hit = collides.find((c) => execReach(view, c.id).some((n) => n.type === "Lose"));
    if (hit) return { ok: true, reasons: [`${hit.id} leads to Lose when the player touches the sacred object.`] };
    return { ok: false, reasons: ["The player and sacred collision never reaches Lose."] };
  },
};

export const wind: Rule = {
  id: "wind", episode: "3", title: "Wind", rule: "A wind force that changes over time acts on the player.",
  check(g) {
    const view = liveView(g);
    for (const t of view.nodes.filter((n) => n.type === "OnTick")) {
      for (const n of execReach(view, t.id)) {
        if ((n.type === "AddVelocity" || n.type === "SetVelocity") && String(param(n, "entity")) === "player" && fedBy(view, n.id, "Random")) {
          return { ok: true, reasons: [`${t.id} pushes the player with a random value through ${n.id}.`] };
        }
      }
    }
    return { ok: false, reasons: ["No Every N ticks chain changes the player's velocity with a Random value."] };
  },
};

export const RULES: Record<string, Rule> = { one_key: oneKey, sacred: sacredObject, wind };

export function checkRule(ruleId: string, g: Graph): RuleResult {
  const r = RULES[ruleId];
  if (!r) return { ok: false, reasons: [`Unknown rule ${ruleId}.`] };
  return r.check(g);
}
