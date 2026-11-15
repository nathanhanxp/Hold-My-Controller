import { param, type Graph } from "@forklab/engine";

type Step = { text: string; check: (g: Graph) => boolean };
const has = (g: Graph, type: string, f: (n: Graph["nodes"][number]) => boolean = () => true) => g.nodes.some((n) => n.type === type && f(n));
const wired = (g: Graph, fromType: string, toType: string) => g.edges.some((e) => g.nodes.find((n) => n.id === e.from.node)?.type === fromType && g.nodes.find((n) => n.id === e.to.node)?.type === toType);

export const TUTORIALS: Array<{ id: string; title: string; intro: string; steps: Step[] }> = [
  {
    id: "jump", title: "Make a jump", intro: "Spawn a player, add gravity, and jump with Space.",
    steps: [
      { text: "Add On start and a Spawn node; set its prefab to player and connect them.", check: (g) => wired(g, "OnStart", "Spawn") && has(g, "Spawn", (n) => param(n, "prefab") === "player") },
      { text: "Add Every N ticks (N = 1) and Add velocity with vy = -12 for gravity; connect them.", check: (g) => wired(g, "OnTick", "AddVelocity") },
      { text: "Add On key (Space, press) and Add velocity with vy = 270; connect them.", check: (g) => wired(g, "OnKey", "AddVelocity") },
    ],
  },
  {
    id: "enemy", title: "Add an enemy", intro: "Enemies run in from the right; touching one loses.",
    steps: [
      { text: "Add Every N ticks (N = 110) connected to Spawn with prefab enemy, x = 15500, y = 0.", check: (g) => has(g, "Spawn", (n) => param(n, "prefab") === "enemy") && wired(g, "OnTick", "Spawn") },
      { text: "Add On collide (player, enemy) connected to Lose.", check: (g) => wired(g, "OnCollide", "Lose") },
    ],
  },
  {
    id: "score", title: "Add a score", intro: "Score a point every second you survive.",
    steps: [
      { text: "Add Every N ticks with N = 60.", check: (g) => has(g, "OnTick", (n) => Number(param(n, "everyN")) === 60) },
      { text: "Connect it to Add score with n = 1.", check: (g) => wired(g, "OnTick", "AddScore") },
    ],
  },
];
