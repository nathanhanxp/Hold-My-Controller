import bs58 from "bs58";
import { graphHash, type Graph, type Share } from "@forklab/engine";

// Port of Night Watch src/App.tsx fingerprint / memoOf / verifyTimeline, adapted to graph lineages.

export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export type VerifyRecord = { hash: string; title: string; graph: Graph; anchorSig?: string; anchorStatus: string; shares: Share[]; paid: boolean };
export type VerifyRow = { hash: string; title: string; ok: boolean; note: string; sig?: string };
export type Memo = { app?: string; kind?: string; graph?: string; prev?: string };

/** getTransaction over JSON-RPC, find the Memo instruction, base58-decode its data, parse it. */
export async function memoOf(rpc: string, sig: string, fetchImpl: typeof fetch = fetch): Promise<Memo | null> {
  const res = await fetchImpl(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] }),
  });
  if (res.status === 429) throw new Error("rate limited");
  const j = (await res.json()) as { result?: { transaction?: { message?: { accountKeys: string[]; instructions: Array<{ programIdIndex: number; data: string }> } } } };
  const msg = j?.result?.transaction?.message;
  if (!msg) return null;
  const ix = msg.instructions.find((i) => msg.accountKeys[i.programIdIndex] === MEMO_PROGRAM);
  if (!ix) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bs58.decode(ix.data))) as Memo;
  } catch {
    return null;
  }
}

export type VerifyDeps = {
  memo: (sig: string) => Promise<Memo | null>;
  onchainAuthors?: (hash: string) => Promise<Array<{ wallet: string; bps: number }> | null>;
  recomputeShares?: (rec: VerifyRecord, lineage: string[]) => Share[];
  pauseMs?: number;
};

/** Oldest first. A missing ancestor or any changed byte shows up as a failed row with a plain note. */
export async function verifyLineage(records: VerifyRecord[], deps: VerifyDeps, expectedChain?: string[]): Promise<VerifyRow[]> {
  const rows: VerifyRow[] = [];
  let prevLocal = "";
  const seen: string[] = [];
  if (expectedChain && expectedChain.length !== records.length) {
    const have = new Set(records.map((r) => r.hash));
    const missing = expectedChain.filter((h) => !have.has(h));
    for (const m of missing) rows.push({ hash: m, title: "(missing)", ok: false, note: "An earlier version is missing." });
  }
  for (const rec of records) {
    const local = graphHash(rec.graph);
    const base = { hash: rec.hash, title: rec.title, sig: rec.anchorSig };
    if (local !== rec.hash) {
      rows.push({ ...base, ok: false, note: "Content was changed after it was published." });
    } else if (rec.graph.parent !== (prevLocal || null) && seen.length > 0) {
      rows.push({ ...base, ok: false, note: "An earlier version is missing or was changed." });
    } else if (!rec.anchorSig || rec.anchorStatus === "pending") {
      rows.push({ ...base, ok: false, note: "Not anchored yet." });
    } else if (rec.anchorSig.startsWith("SIMULATED")) {
      rows.push({ ...base, ok: true, note: "Matches." });
    } else {
      try {
        const memo = await deps.memo(rec.anchorSig);
        if (!memo) rows.push({ ...base, ok: false, note: "On-chain record not found." });
        else if (memo.graph !== local) rows.push({ ...base, ok: false, note: "Content was changed after it was published." });
        else if ((memo.prev ?? "") !== (rec.graph.parent ?? "")) rows.push({ ...base, ok: false, note: "The link to the previous version does not match." });
        else {
          let note = "Matches the on-chain record.";
          if (rec.paid && deps.onchainAuthors) {
            const onchain = await deps.onchainAuthors(rec.hash);
            const expected = (deps.recomputeShares?.(rec, seen) ?? rec.shares).map((s) => ({ wallet: s.wallet ?? "", bps: s.bps }));
            if (!onchain) note += "";
            else if (JSON.stringify(onchain) !== JSON.stringify(expected)) {
              rows.push({ ...base, ok: false, note: "On-chain payout split does not match." });
              prevLocal = local; seen.push(local);
              continue;
            } else note += " Payout split matches.";
          }
          rows.push({ ...base, ok: true, note });
        }
      } catch {
        rows.push({ ...base, ok: false, note: "Could not reach Solana." });
      }
      if (deps.pauseMs) await new Promise((r) => setTimeout(r, deps.pauseMs));
    }
    prevLocal = local;
    seen.push(local);
  }
  return rows;
}
