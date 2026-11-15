import { hashOf } from "./hash";
import { flattenPayout, type BuilderEntry, type Contributor, type PayoutLine, type PlayerRow } from "./payout";

export const SNAPSHOT_SCHEMA = "forklab.snapshot.v1" as const;

export type ChallengeSnapshot = {
  schema: typeof SNAPSHOT_SCHEMA;
  challengeId: string;
  kind: "episode" | "game";
  endedAt: number;
  builders: BuilderEntry[];
  game?: { levelHash: string; mechanicHash: string; seed: number };
  players: PlayerRow[];
  contributors: Contributor[];
  payouts: PayoutLine[];
};

export function buildSnapshot(input: Omit<ChallengeSnapshot, "schema" | "payouts">): ChallengeSnapshot {
  const payouts = flattenPayout(input);
  return { schema: SNAPSHOT_SCHEMA, ...input, payouts };
}

export function snapshotBodyHash(s: ChallengeSnapshot): string {
  return hashOf(s);
}

/** Re-derive the payouts and hash from a published body. Used by the Verify results button. */
export function verifySnapshot(s: ChallengeSnapshot, expectedHash: string): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  let ok = true;
  try {
    const again = flattenPayout(s);
    const same = again.length === s.payouts.length && again.every((l, i) => l.wallet === s.payouts[i].wallet && l.bps === s.payouts[i].bps);
    if (!same) { ok = false; notes.push("Payout list does not match the published standings."); }
    else notes.push("Payout list recomputed from the standings and matches.");
  } catch (e) {
    ok = false;
    notes.push(`Payout could not be recomputed: ${(e as Error).message}`);
  }
  const h = snapshotBodyHash(s);
  if (h !== expectedHash) { ok = false; notes.push("Snapshot hash does not match the anchored value."); }
  else notes.push("Snapshot hash matches the anchored value.");
  return { ok, notes };
}
