"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { useIdentity } from "./identity";
import { api, sol } from "@/lib/client";
import { explorerTx } from "@/lib/solana";
import { Modal, StatusLine } from "./ui";
import { splitColors } from "@/lib/colors";

type License = { sig: string; simulated: boolean; priceLamports: number; feeLamports: number; split: Array<{ handle: string; wallet: string; lamports: number }> };

/** License flow (BlinkBounties detail-page pattern): busy, status and error on every step, then a success modal. */
export function LicenseButton({ hash, title, priceLamports, live, onDone }: { hash: string; title: string; priceLamports: number; live: boolean; onDone?: () => void }) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { handle } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState<License | null>(null);
  const go = async () => {
    setBusy(true);
    try {
      if (!live) {
        setStatus("Licensing");
        const r = await api<{ license: License }>(`/api/mechanics/${hash}/license-sim`, { method: "POST", json: { buyer: wallet.publicKey?.toBase58(), buyerHandle: handle ?? undefined } });
        setDone(r.license);
      } else {
        if (!wallet.publicKey || !wallet.sendTransaction) { setStatus("Connect a wallet first."); return; }
        setStatus("Building the license transaction");
        const r = await api<{ transaction: string }>(`/api/actions/mechanic/${hash}`, { method: "POST", json: { account: wallet.publicKey.toBase58() } });
        const tx = Transaction.from(Buffer.from(r.transaction, "base64"));
        setStatus("Approve in your wallet");
        const sig = await wallet.sendTransaction(tx, connection);
        setStatus("Confirming");
        const bh = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
        setStatus("Recording the receipt");
        const rec = await api<{ license: License }>(`/api/mechanics/${hash}/licenses`, { method: "POST", json: { sig, buyer: wallet.publicKey.toBase58(), buyerHandle: handle ?? undefined } });
        setDone(rec.license);
      }
      setStatus("");
      onDone?.();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const payTokens = async () => {
    if (!handle) { setStatus("Pick a handle in the top bar first."); return; }
    setBusy(true);
    try {
      const r = await api<{ license: License }>(`/api/mechanics/${hash}/pay-tokens`, { method: "POST", json: { handle } });
      setDone(r.license);
      setStatus("");
      window.dispatchEvent(new Event("forklab:tokens"));
      onDone?.();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <span className="row">
        <button className="btn lg" onClick={payTokens} disabled={busy}>{busy ? "Working" : `Pay ${sol(priceLamports)}`}</button>
        {live && wallet.publicKey ? <button className="btn ghost" onClick={go} disabled={busy}>Pay with wallet</button> : null}
      </span>
      <StatusLine tone={status && !busy ? "warn" : "muted"}>{status}</StatusLine>
      {done ? (
        <Modal title={`Paid ${done.split.length} contributor${done.split.length === 1 ? "" : "s"}`} onClose={() => setDone(null)}>
          <div className="stack">
            <p>You licensed {title} for {sol(done.priceLamports)}.</p>
            <table className="data"><thead><tr><th>Recipient</th><th>Amount</th></tr></thead><tbody>
              {done.split.map((s) => { const c = splitColors(done.split.map((x) => x.handle)).get(s.handle); return <tr key={s.wallet}><td><span className="split-dot" style={{ background: c }} aria-hidden="true" />@{s.handle}</td><td style={{ color: c, fontWeight: 700 }}>{sol(s.lamports)}</td></tr>; })}
              {done.feeLamports ? <tr><td>Platform fee</td><td>{sol(done.feeLamports)}</td></tr> : null}
            </tbody></table>
            {done.simulated ? null : <a className="btn ghost" href={explorerTx(done.sig)} target="_blank" rel="noreferrer">See the single transaction on Explorer</a>}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
