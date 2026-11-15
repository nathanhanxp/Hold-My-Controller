import { countedNodes } from "./attribution";
import { hashOf } from "./hash";
import { compile, Sim } from "./interpret";
import { param, type Graph } from "./schema";
import type { PrefabDef } from "./world";

export const MINIGAME_SCHEMA = "forklab.minigame.v1" as const;
export const MAX_TICKS = 7200;

export type MinigameSpec = {
  schema: typeof MINIGAME_SCHEMA;
  levelHash: string;
  mechanicHash: string;
  seed: number;
  maxTicks: number;
  scoring: { kind: "score" } | { kind: "survive_ticks" };
  allowedKeys?: string[];
};

export function minigameHash(spec: MinigameSpec): string {
  return hashOf(spec);
}

/** Reasons the pair cannot be composed. Empty means it composes. */
export function composeCheck(level: Graph, mechanic: Graph, prefabs: Record<string, PrefabDef> = {}): string[] {
  const reasons: string[] = [];
  if (level.kind !== "level") reasons.push("The arena graph must be a level.");
  if (mechanic.kind !== "mechanic") reasons.push("The player controller must be a mechanic.");
  const counted = countedNodes(level);
  const spawnsPlayer = level.nodes.some((n) => {
    if (!counted.has(n.id) || n.type !== "Spawn") return false;
    const p = String(param(n, "prefab"));
    return p === "player" || prefabs[p]?.tag === "player";
  });
  if (!spawnsPlayer) reasons.push("Level never spawns a player.");
  const mc = countedNodes(mechanic);
  const actsOnPlayer = mechanic.nodes.some((n) => mc.has(n.id) && (n.type === "SetVelocity" || n.type === "AddVelocity") && String(param(n, "entity")) === "player");
  if (!actsOnPlayer) reasons.push("Mechanic never moves the player.");
  return reasons;
}

/**
 * One world, two programs: the level (namespace "level") then the mechanic (namespace "mech").
 * RNG streams are named "level:<name>" and "mech:<name>", variables are scoped per graph,
 * score is shared. The mechanic's own OnStart spawns are suppressed (the level owns the arena),
 * but the rest of its OnStart still runs.
 */
export function composeSim(level: Graph, mechanic: Graph, seed: number, prefabs: Record<string, PrefabDef> = {}): Sim {
  const problems = composeCheck(level, mechanic, prefabs);
  if (problems.length) throw new Error(problems.join(" "));
  return new Sim([compile(level, "level"), compile(mechanic, "mech", { suppressStartSpawns: true })], seed, prefabs);
}
