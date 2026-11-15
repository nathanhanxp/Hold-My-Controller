import { z } from "zod";
import { compile, maskAt, Sim, snapshotHash } from "./interpret";
import { composeSim, MAX_TICKS, type MinigameSpec } from "./minigame";
import { KEY_ALL_MASK, type Graph } from "./schema";
import type { PrefabDef } from "./world";

export const MAX_INPUT_RECORDS = 4096;

export const inputScriptSchema = z.object({
  graphHash: z.string().regex(/^[0-9a-f]{64}$/),
  seed: z.number().int().min(0).max(0xffffffff),
  ticks: z.number().int().min(1).max(MAX_TICKS),
  inputs: z.array(z.tuple([z.number().int().min(0).max(MAX_TICKS), z.number().int().min(0).max(KEY_ALL_MASK)])).max(MAX_INPUT_RECORDS),
});
export type InputScript = z.infer<typeof inputScriptSchema>;

export type ReplayResult = { score: number; ticks: number; endedBy: "win" | "lose" | "timeout"; finalSnapshotHash: string };
export class ReplayError extends Error {
  constructor(readonly code: "MALFORMED" | "OVER_TICK_CAP" | "WRONG_GRAPH" | "WRONG_SEED" | "NOT_SORTED", message: string) {
    super(message);
  }
}

export function parseScript(input: unknown): InputScript {
  if (input && typeof input === "object" && typeof (input as { ticks?: unknown }).ticks === "number" && (input as { ticks: number }).ticks > MAX_TICKS) {
    throw new ReplayError("OVER_TICK_CAP", `Replays are limited to ${MAX_TICKS} ticks.`);
  }
  const r = inputScriptSchema.safeParse(input);
  if (!r.success) throw new ReplayError("MALFORMED", `Replay is malformed: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`);
  for (let i = 1; i < r.data.inputs.length; i += 1) {
    if (r.data.inputs[i][0] < r.data.inputs[i - 1][0]) throw new ReplayError("NOT_SORTED", "Input records must be in tick order.");
  }
  return r.data;
}

function finish(sim: Sim, script: InputScript, scoring: MinigameSpec["scoring"] = { kind: "score" }): ReplayResult {
  const mask = maskAt(script.inputs);
  for (let t = 0; t < script.ticks && sim.status === "running"; t += 1) sim.step(mask(t));
  const endedBy = sim.status === "running" ? "timeout" : sim.status;
  const score = scoring.kind === "survive_ticks" ? sim.tick : sim.score;
  return { score, ticks: sim.tick, endedBy, finalSnapshotHash: snapshotHash(sim.snapshot()) };
}

/** Re-run a single mechanic and return the authoritative score. Never trust a client number. */
export function verifyReplay(graph: Graph, graphHashValue: string, input: unknown, prefabs: Record<string, PrefabDef> = {}): ReplayResult {
  const script = parseScript(input);
  if (script.graphHash !== graphHashValue) throw new ReplayError("WRONG_GRAPH", "Replay was recorded on a different graph.");
  return finish(new Sim([compile(graph, "mech")], script.seed, prefabs), script);
}

/** Re-run a composed minigame (level + mechanic). The script must name the mechanic and use the spec seed. */
export function verifyMinigameReplay(spec: MinigameSpec, level: Graph, mechanic: Graph, input: unknown, prefabs: Record<string, PrefabDef> = {}): ReplayResult {
  const script = parseScript(input);
  if (script.graphHash !== spec.mechanicHash) throw new ReplayError("WRONG_GRAPH", "Replay was recorded on a different mechanic.");
  if (script.seed !== spec.seed) throw new ReplayError("WRONG_SEED", "Replay used a different seed than this week's game.");
  if (script.ticks > spec.maxTicks) throw new ReplayError("OVER_TICK_CAP", `This game is limited to ${spec.maxTicks} ticks.`);
  return finish(composeSim(level, mechanic, spec.seed, prefabs), script, spec.scoring);
}

/** Records key masks per tick into the sparse format (only ticks where the mask changes). */
export class InputRecorder {
  inputs: Array<[number, number]> = [];
  private last = 0;
  record(tick: number, mask: number): void {
    if (mask !== this.last) {
      this.inputs.push([tick, mask]);
      this.last = mask;
    }
  }
}
