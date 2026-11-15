import { composeCheck, composeSim, type Graph } from "@forklab/engine";
import type { AssetDoc, GraphDoc, Store } from "../store/types";
import { gameIdFor } from "./weeks";

/*
 * Choosing without browsing everything: people vote on a short list, and browse short ranked feeds.
 * Finalists per slot: the four strongest pieces by plays and forks that pass the compatibility check,
 * plus one "rising" pick ranked by how fast plays and forks grow, so new work can get in.
 */

const DAY = 86_400_000;
export const FINALISTS = 5;

export const strength = (s: { plays?: number; forks?: number; uses?: number }) => (s.plays ?? 0) + 3 * (s.forks ?? 0) + 2 * (s.uses ?? 0);
/** Growth rate: strength per day since publishing, for pieces under 30 days old. */
export function risingScore(stats: { plays?: number; forks?: number; uses?: number }, createdAt: number, now = Date.now()): number {
  const age = Math.max(1, (now - createdAt) / DAY);
  return age > 30 ? 0 : strength(stats) / age;
}

/** Some key makes the player go up (a jump), anywhere in the graph. */
export function hasJump(g: Graph): boolean {
  if (!g.nodes.some((n) => n.type === "OnKey")) return false;
  return g.nodes.some((n) => ((n.type === "AddVelocity" || n.type === "SetVelocity") && String(n.params.entity) === "player" && Number(n.params.vy ?? 0) > 0) || (n.type === "Move" && n.params.direction === "up"));
}

/** Runners coming along the ground from the side can only be cleared by jumping over them. */
export function needsJump(level: Graph): boolean {
  return level.nodes.some((n) => n.type === "Spawn" && String(n.params.prefab) === "enemy" && Number(n.params.y ?? 0) === 0 && n.params.z === undefined)
    && level.nodes.some((n) => n.type === "OnCollide" && [n.params.tagA, n.params.tagB].includes("enemy"));
}

/** Can this mechanic actually be played on this level: composes cleanly, spawns a player, and has the moves the level asks for. */
export function fits(level: Graph, mechanic: Graph): boolean {
  try {
    if (composeCheck(level, mechanic).length) return false;
    if (needsJump(level) && !hasJump(mechanic) && !hasJump(level)) return false;
    const sim = composeSim(level, mechanic, 7);
    let player = false;
    for (let t = 0; t < 180 && sim.status === "running"; t += 1) { sim.step(0); if (sim.entities.some((e) => e.tag === "player")) player = true; }
    return player;
  } catch {
    return false;
  }
}

/** The level that "fits next week's level" is measured against: this week's game's level, or the most played level. */
export async function referenceLevel(store: Store, now = Date.now()): Promise<GraphDoc | null> {
  const current = await store.getChallenge(gameIdFor(new Date(now)));
  if (current?.minigame) return store.getGraph(current.minigame.levelHash);
  return (await store.listGraphs({ kind: "level", sort: "trending", limit: 1 }))[0] ?? null;
}
export async function referenceMechanic(store: Store, now = Date.now()): Promise<GraphDoc | null> {
  const current = await store.getChallenge(gameIdFor(new Date(now)));
  if (current?.minigame) return store.getGraph(current.minigame.mechanicHash);
  return (await store.listGraphs({ kind: "mechanic", license: "free", sort: "trending", limit: 1 }))[0] ?? null;
}

function pick<T extends { _id: string }>(ranked: T[], rising: T[], n = FINALISTS): Array<T & { why: "top" | "rising" }> {
  const top = ranked.slice(0, n - 1).map((x) => ({ ...x, why: "top" as const }));
  const r = rising.find((x) => !top.some((t) => t._id === x._id));
  const out: Array<T & { why: "top" | "rising" }> = r ? [...top, { ...r, why: "rising" as const }] : ranked.slice(0, n).map((x) => ({ ...x, why: "top" as const }));
  return out;
}

export async function finalistsFor(store: Store, slot: "mechanic" | "level" | "look", now = Date.now()) {
  if (slot === "look") {
    const themes = await store.listAssets({ kind: "theme", limit: 200 });
    const ranked = [...themes].sort((a, b) => strength(b.stats) - strength(a.stats));
    const rising = [...themes].sort((a, b) => risingScore(b.stats, b.createdAt, now) - risingScore(a.stats, a.createdAt, now));
    return pick<AssetDoc>(ranked, rising);
  }
  const docs = await store.listGraphs({ kind: slot, ...(slot === "mechanic" ? { license: "free" as const } : {}), limit: 300 });
  const ref = slot === "mechanic" ? await referenceLevel(store, now) : await referenceMechanic(store, now);
  const ok = docs.filter((d) => !ref || (slot === "mechanic" ? fits(ref.graph, d.graph) : fits(d.graph, ref.graph)));
  const ranked = [...ok].sort((a, b) => strength(b.stats) - strength(a.stats));
  const rising = [...ok].sort((a, b) => risingScore(b.stats, b.createdAt, now) - risingScore(a.stats, a.createdAt, now));
  return pick<GraphDoc>(ranked, rising);
}

/** Three short rows that cover most choosing: trending, rising, and what fits next week's level. */
export async function feeds(store: Store, now = Date.now(), n = 8) {
  const docs = await store.listGraphs({ kind: "mechanic", license: "free", limit: 300 });
  const ref = await referenceLevel(store, now);
  const trending = [...docs].sort((a, b) => strength(b.stats) - strength(a.stats)).slice(0, n);
  const rising = [...docs].filter((d) => risingScore(d.stats, d.createdAt, now) > 0).sort((a, b) => risingScore(b.stats, b.createdAt, now) - risingScore(a.stats, a.createdAt, now)).slice(0, n);
  const fitting = ref ? docs.filter((d) => fits(ref.graph, d.graph)).sort((a, b) => strength(b.stats) - strength(a.stats)).slice(0, n) : [];
  return { trending, rising, fits: fitting, levelTitle: ref?.title ?? null, levelHash: ref?._id ?? null };
}
