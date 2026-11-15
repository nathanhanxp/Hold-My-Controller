import { collectGraph, dodgeGraph, graphHash, groveGraph, hurdleGraph, jumpGraph, platformerGraph, shooterGraph, siegeGraph, trickshotGraph, type Graph } from "@forklab/engine";

export function template(name: string | null): Graph | null {
  // the classic one-key games are side-on, so they open in 2D
  if (name === "jump") return { ...jumpGraph(), view: "2d" };
  if (name === "dodge") return { ...dodgeGraph(graphHash(jumpGraph())), view: "2d" };
  if (name === "collect") { const j = graphHash(jumpGraph()); const d = dodgeGraph(j); return { ...collectGraph(d, graphHash(d)), view: "2d" }; }
  if (name === "ledges") return platformerGraph();
  if (name === "shooter") return shooterGraph();
  if (name === "trickshot") return trickshotGraph();
  if (name === "siege") return siegeGraph();
  if (name === "grove") return groveGraph();
  if (name === "hurdle") return hurdleGraph();
  return null;
}

