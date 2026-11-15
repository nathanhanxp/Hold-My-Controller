import { readFileSync } from "node:fs";
import path from "node:path";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { env } from "../env";
import { buildCreateChallengeIx, buildSettleIx, challengeNumericId, challengePda, connection, memoIx, programConfigured, withRpcRetry } from "../solana";
import type { ChallengeDoc } from "../store/types";
import type { SettleSender } from "./challenges";
import { ApiError } from "./publish";

/** Platform authority keypair (gitignored file, JSON array of 64 bytes). Never logged. */
export function loadAuthority(): Keypair | null {
  const p = env().PLATFORM_AUTHORITY_KEYPAIR_PATH;
  for (const candidate of [path.resolve(process.cwd(), p), path.resolve(process.cwd(), "..", p)]) {
    try {
      const raw = JSON.parse(readFileSync(candidate, "utf8"));
      const arr = Array.isArray(raw) ? raw : raw?.authority;
      if (Array.isArray(arr) && arr.length === 64) return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch { /* try next */ }
  }
  return null;
}

export const chainLive = () => env().FORKLAB_MODE === "live" && programConfigured() && !!loadAuthority();

export const simulatedSender: SettleSender = async (c) => ({ sig: `SIMULATED-settle-${c._id}-${Date.now().toString(36)}`, simulated: true });

/** One transaction: settle (pays every recipient) plus a Memo carrying the same snapshot hash. */
export const devnetSettleSender: SettleSender = async (c, snapshotHash, payouts) => {
  const authority = loadAuthority();
  if (!authority) throw new ApiError("NO_AUTHORITY", "The platform authority keypair is not configured.", 503);
  const tx = new Transaction()
    .add(buildSettleIx(authority.publicKey, challengeNumericId(c._id), snapshotHash, payouts.map((p) => ({ wallet: new PublicKey(p.wallet), bps: p.bps }))))
    .add(memoIx({ app: "forklab", v: 1, kind: "settle", challenge: c._id, snapshot: snapshotHash }));
  const sig = await withRpcRetry(() => sendAndConfirmTransaction(connection(), tx, [authority], { commitment: "confirmed" }));
  return { sig, simulated: false };
};

export async function devnetCreateChallenge(c: ChallengeDoc): Promise<{ pda?: string; sig?: string }> {
  const authority = loadAuthority();
  if (!authority) return {};
  const id = challengeNumericId(c._id);
  const tx = new Transaction().add(buildCreateChallengeIx(authority.publicKey, id, c.kind, c.endsAt, c.prize.maxWinners, c.prize.poolLamports));
  const sig = await withRpcRetry(() => sendAndConfirmTransaction(connection(), tx, [authority], { commitment: "confirmed" }));
  return { pda: challengePda(id).toBase58(), sig };
}

export const settleSender = (): SettleSender => (chainLive() ? devnetSettleSender : simulatedSender);
