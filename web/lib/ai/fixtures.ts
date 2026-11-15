import { collectGraph, dodgeGraph, graphHash, jumpGraph, type Graph } from "@forklab/engine";
import { promptKey, type Proposal } from "./proposal";
import type { AiTask } from "./types";

/** The three demo prompts always return a valid graph, even with every provider down. Keyed by sha256(prompt). */
export const DEMO_PROMPTS = [
  "dodge falling rocks with one key",
  "jump over enemies that run at you",
  "collect coins while rocks fall",
] as const;

function toProposal(g: Graph, explanation: string): Proposal {
  return {
    title: g.title,
    tags: g.tags,
    explanation,
    nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, params: { ...n.params } })),
    edges: g.edges,
  };
}

let table: Map<string, unknown> | null = null;
function build() {
  const jump = jumpGraph();
  const jh = graphHash(jump);
  const dodge = dodgeGraph(jh);
  const collect = collectGraph(dodge, graphHash(dodge));
  const t = new Map<string, unknown>();
  t.set(`graph:${promptKey(DEMO_PROMPTS[0])}`, toProposal(dodge, "Space flips the player's direction; rocks spawn at random columns and falling on the player loses."));
  t.set(`graph:${promptKey(DEMO_PROMPTS[1])}`, toProposal(jump, "Space jumps when grounded; gravity pulls down every tick; touching an enemy loses; one point per second."));
  t.set(`graph:${promptKey(DEMO_PROMPTS[2])}`, toProposal(collect, "Dodge rocks with one key and pick up coins worth five points."));
  // Ask mode, with an empty editor: works with every provider down
  t.set(`ask:${promptKey(`ask:${DEMO_QUESTION}`)}`, {
    answer: "You build a game from blocks: events like a key press or a timer start actions like moving, shooting or spawning. Start from a template, or describe a game and the assistant proposes the blocks.",
    suggestions: [
      { label: "A dodging game", prompt: DEMO_PROMPTS[0] },
      { label: "A jumping runner", prompt: DEMO_PROMPTS[1] },
      { label: "Collect coins", prompt: DEMO_PROMPTS[2] },
    ],
  });
  return t;
}

/** The Ask-mode demo question; answered from the fixture table when no provider is reachable. */
export const DEMO_QUESTION = "what can i make?";

export function fixtureFor(task: AiTask, key: string): unknown {
  if (!table) table = build();
  return table.get(`${task}:${key}`);
}
