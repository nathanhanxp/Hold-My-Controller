"use client";
import { useState } from "react";
import { computeShares, type Share } from "@forklab/engine";
import { memoOf, verifyLineage, type VerifyRecord, type VerifyRow } from "@/lib/verify";
import { explorerAddress, explorerTx, fetchMechanic, isSimulatedSig, rpcUrl } from "@/lib/solana";
import { api, sol, ago, useFetch } from "@/lib/client";
import { Tripod, Check, Cross } from "./glyphs";
import { SkeletonPanel, StatusLine } from "./ui";

type Receipts = {
  anchor: { status: string; sig?: string; note?: string };
  mechanicPda: string | null;
  licenses: Array<{ _id: string; buyer: string; buyerHandle?: string; sig: string; priceLamports: number; simulated: boolean; split: Array<{ handle: string; wallet: string; lamports: number }>; feeLamports: number; createdAt: number }>;
  records: VerifyRecord[];
  expectedChain: string[];
};

/** Recomputes every hash in the lineage in this browser, then checks the devnet memo and the payout account. */
export function VerifyPanel({ hash, mock }: { hash: string; mock: boolean }) {
  const { data, error, loading, reload } = useFetch<Receipts>(`/api/receipts/${hash}`);
  const [rows, setRows] = useState<VerifyRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true); setRows(null); setMsg("Checking");
    try {
      const fresh = await api<Receipts>(`/api/receipts/${hash}`);
      const r = await verifyLineage(fresh.records, {
        memo: (sig) => memoOf(rpcUrl(), sig),
        onchainAuthors: async (h) => (await fetchMechanic(h))?.authors ?? null,
        recomputeShares: (rec, lineage) => computeShares(rec.graph, lineage).map((s: Share) => ({ ...s, wallet: rec.shares.find((x) => x.handle === s.handle)?.wallet })),
        pauseMs: 250,
      }, fresh.expectedChain);
      setRows(r);
      setMsg(r.every((x) => x.ok) ? "Every record checks out." : "Some records failed. See the notes.");
    } catch (e) {
      setMsg(`Verify could not finish: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const tamper = async () => {
    await api(`/api/dev/tamper/${hash}`, { method: "POST" });
    setMsg("Stored copy edited on the server (demo). Press Verify again.");
    reload();
  };
  if (loading && !data) return <SkeletonPanel lines={4} />;
  if (error) return <p className="small" style={{ color: "var(--clay)" }}>{error.message}</p>;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 className="row"><Tripod size={22} />Receipts and checks</h3>
        <div className="row">
          <button className="btn" onClick={run} disabled={busy}>{busy ? "Verifying" : "Verify"}</button>
          {mock ? <button className="btn quiet sm" onClick={tamper} title="Demo only: edits the stored graph without changing its id">Tamper with stored copy (demo)</button> : null}
        </div>
      </div>
      <StatusLine tone={rows ? (rows.every((r) => r.ok) ? "ok" : "warn") : "muted"}>{msg}</StatusLine>
      {rows ? (
        <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r, i) => (
            <li key={`${r.hash}-${i}`} className="panel tight row" style={{ flexWrap: "nowrap", alignItems: "flex-start", background: r.ok ? "linear-gradient(90deg, rgba(169,196,137,0.14), transparent 70%)" : "linear-gradient(90deg, rgba(224,122,78,0.18), transparent 70%)" }}>
              <span style={{ color: r.ok ? "var(--olive)" : "var(--clay)" }}>{r.ok ? <Check size={20} title="ok" /> : <Cross size={20} title="failed" />}</span>
              <div>
                <p style={{ fontWeight: 600 }}>{r.title}</p>
                <p className="small">{r.note}</p>
                <p className="hash">{r.hash}{r.sig && !isSimulatedSig(r.sig) ? <> · <a href={explorerTx(r.sig)} target="_blank" rel="noreferrer">Explorer</a></> : null}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <div>
        <h4 style={{ fontSize: "1.05rem", marginBottom: 6 }}>Anchor</h4>
        <p className="small">
          {data?.anchor.status === "pending" ? "Anchoring" : data?.anchor.status === "simulated" ? <>Anchored</> : data?.anchor.status === "confirmed" && data.anchor.sig ? <>Confirmed: <a href={explorerTx(data.anchor.sig)} target="_blank" rel="noreferrer">view on Explorer (devnet)</a></> : data?.anchor.status}
        </p>
        {data?.mechanicPda ? <p className="small"><a href={explorerAddress(data.mechanicPda)} target="_blank" rel="noreferrer">Payout account on Explorer</a></p> : null}
      </div>
      <div>
        <h4 style={{ fontSize: "1.05rem", marginBottom: 6 }}>Licenses</h4>
        {data?.licenses.length ? (
          <div className="table-scroll"><table className="data"><thead><tr><th>Buyer</th><th>Price</th><th>Paid to</th><th>When</th><th>Receipt</th></tr></thead><tbody>
            {data.licenses.map((l) => (
              <tr key={l._id}>
                <td>{l.buyerHandle ? `@${l.buyerHandle}` : "Someone"}</td>
                <td>{sol(l.priceLamports)}</td>
                <td className="small">{l.split.map((s) => `@${s.handle} ${sol(s.lamports)}`).join(", ") || "authors"}{l.feeLamports ? `, fee ${sol(l.feeLamports)}` : ""}</td>
                <td className="small muted">{ago(l.createdAt)}</td>
                <td>{l.simulated ? "·" : <a href={explorerTx(l.sig)} target="_blank" rel="noreferrer">Explorer</a>}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <p className="small muted">No licenses yet.</p>}
      </div>

    </div>
  );
}
