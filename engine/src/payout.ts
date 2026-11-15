import { TOTAL_BPS } from "./attribution";

export const RANK_WEIGHTS = [5000, 3000, 2000];
export const PLAYER_POT = 7000;
export const CONTRIBUTOR_POT = 3000;
export const MAX_RECIPIENTS = 12;

export type PayoutLine = { wallet: string; bps: number };
export type BuilderEntry = { graph: string; author: string; wallet: string; votes: number; ruleOk: boolean; publishedAt: number };
export type PlayerRow = { player: string; wallet: string; score: number; replayHash: string; verifiedAt?: number };
export type Contributor = { handle: string; wallet: string; bps: number };

export class PayoutError extends Error {
  constructor(readonly code: "NO_WINNERS" | "TOO_MANY_RECIPIENTS" | "BAD_SHARES", message: string) {
    super(message);
  }
}

/** Split `pot` over ranked recipients with the rank weights (renormalised if fewer than 3). */
function rankSplit(pot: number, wallets: string[]): number[] {
  const w = RANK_WEIGHTS.slice(0, wallets.length);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((wi) => Math.floor((pot * wi) / sum));
}

function merge(lines: PayoutLine[]): PayoutLine[] {
  const out: PayoutLine[] = [];
  for (const l of lines) {
    const hit = out.find((o) => o.wallet === l.wallet);
    if (hit) hit.bps += l.bps;
    else out.push({ ...l });
  }
  return out.filter((l) => l.bps > 0);
}

/** Ranks players: highest verified score first, ties by earlier verification, then wallet. */
export function rankPlayers(players: PlayerRow[]): PlayerRow[] {
  return [...players].sort((a, b) => b.score - a.score || (a.verifiedAt ?? 0) - (b.verifiedAt ?? 0) || (a.wallet < b.wallet ? -1 : 1));
}

export function rankBuilders(entries: BuilderEntry[]): BuilderEntry[] {
  return entries.filter((e) => e.ruleOk).sort((a, b) => b.votes - a.votes || a.publishedAt - b.publishedAt);
}

/**
 * Snapshot -> list of { wallet, bps } that settle pays. Always sums to 10,000.
 * Episode: top 3 rule-passing entries by votes, weights 5000/3000/2000.
 * Game: 7000 over the top 3 verified players, 3000 over the winning mechanic's contributors by their shares.
 * Per pot: floor(pot * w_i / sum(w)); the total remainder goes to rank one. Duplicate wallets merge.
 */
export function flattenPayout(snapshot: { kind: "episode" | "game"; builders?: BuilderEntry[]; players?: PlayerRow[]; contributors?: Contributor[] }): PayoutLine[] {
  let lines: PayoutLine[] = [];
  if (snapshot.kind === "episode") {
    const top = rankBuilders(snapshot.builders ?? []).slice(0, 3);
    if (!top.length) throw new PayoutError("NO_WINNERS", "No entry passed the rule.");
    const amounts = rankSplit(TOTAL_BPS, top.map((t) => t.wallet));
    lines = top.map((t, i) => ({ wallet: t.wallet, bps: amounts[i] }));
  } else {
    const top = rankPlayers(snapshot.players ?? []).slice(0, 3);
    if (!top.length) throw new PayoutError("NO_WINNERS", "No verified players.");
    const contributors = (snapshot.contributors ?? []).filter((c) => c.bps > 0);
    const playerPot = contributors.length ? PLAYER_POT : TOTAL_BPS;
    const amounts = rankSplit(playerPot, top.map((t) => t.wallet));
    lines = top.map((t, i) => ({ wallet: t.wallet, bps: amounts[i] }));
    if (contributors.length) {
      const shareSum = contributors.reduce((s, c) => s + c.bps, 0);
      if (shareSum <= 0) throw new PayoutError("BAD_SHARES", "Contributor shares are empty.");
      for (const c of contributors) lines.push({ wallet: c.wallet, bps: Math.floor((CONTRIBUTOR_POT * c.bps) / shareSum) });
    }
  }
  const sum = lines.reduce((s, l) => s + l.bps, 0);
  lines[0].bps += TOTAL_BPS - sum;
  const merged = merge(lines);
  if (merged.length > MAX_RECIPIENTS) throw new PayoutError("TOO_MANY_RECIPIENTS", `At most ${MAX_RECIPIENTS} recipients.`);
  return merged;
}

/** Projected lamports per line for a pool (remainder to the first line, like the program). */
export function lamportsFor(pool: number, lines: PayoutLine[]): number[] {
  const amounts = lines.map((l) => Math.floor((pool * l.bps) / TOTAL_BPS));
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (amounts.length) amounts[0] += pool - sum;
  return amounts;
}
