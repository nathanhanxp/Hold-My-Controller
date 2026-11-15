"use client";
import Link from "next/link";
import { useState } from "react";
import { snapshotBodyHash, verifyMinigameReplay, verifySnapshot, type ChallengeSnapshot, type Graph } from "@forklab/engine";
import type { ChallengeDoc } from "@/lib/store/types";
import { api, sol } from "@/lib/client";
import { explorerTx, isSimulatedSig } from "@/lib/solana";
import { AuthorChip, Simulated, StatusLine } from "../ui";
import { AmphoraSplit } from "../odyssey/AmphoraSplit";
import { Check, Cross, Tripod } from "../glyphs";

/** Pool, status, payouts, settle receipt, snapshot and the browser-side "Verify results". */
export function PrizePanel({ challenge, onChanged, canSettle }: { challenge: ChallengeDoc; onChanged: () => void; canSettle: boolean }) {
  const p = challenge.prize;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [checks, setChecks] = useState<Array<{ ok: boolean; note: string }> | null>(null);
  const ended = Date.now() >= challenge.endsAt;

  const settle = async () => {
    setBusy(true); setStatus("Writing the snapshot, then settling in one transaction");
    try {
      const r = await api<{ challenge: ChallengeDoc; onChain: boolean }>(`/api/challenges/${challenge._id}/settle`, { method: "POST", json: {} });
      const n = r.challenge.prize.payouts?.length ?? 0;
      setStatus(`Settled. Paid ${n} recipient${n === 1 ? "" : "s"}.`);
      onChanged();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true); setChecks(null); setStatus("Re-running replays and recomputing the payout in your browser");
    const out: Array<{ ok: boolean; note: string }> = [];
    try {
      const res = await fetch(`/api/challenges/${challenge._id}/snapshot.json`);
      if (!res.ok) throw new Error("No snapshot yet.");
      const body = (await res.json()) as ChallengeSnapshot;
      const anchored = p.snapshotHash ?? res.headers.get("X-Snapshot-Hash") ?? "";
      const v = verifySnapshot(body, anchored);
      out.push({ ok: v.ok, note: v.notes.join(" ") });
      if (challenge.kind === "game" && challenge.minigame && body.game) {
        const [lvl, mech, reps] = await Promise.all([
          api<{ mechanic: { graph: Graph } }>(`/api/mechanics/${body.game.levelHash}`),
          api<{ mechanic: { graph: Graph } }>(`/api/mechanics/${body.game.mechanicHash}`),
          api<{ items: Array<{ _id: string; inputs: Array<[number, number]>; ticks: number; score: number }> }>(`/api/challenges/${challenge._id}/replays`),
        ]);
        for (const pl of body.players.slice(0, 3)) {
          const rep = reps.items.find((r) => r._id === pl.replayHash);
          if (!rep) { out.push({ ok: false, note: `@${pl.player}: replay not published.` }); continue; }
          const r = verifyMinigameReplay(challenge.minigame, lvl.mechanic.graph, mech.mechanic.graph, { graphHash: body.game.mechanicHash, seed: body.game.seed, ticks: rep.ticks, inputs: rep.inputs });
          out.push({ ok: r.score === pl.score, note: r.score === pl.score ? `@${pl.player}: replay re-run in your browser scores ${r.score}, matching the board.` : `@${pl.player}: replay scores ${r.score}, but the snapshot says ${pl.score}.` });
        }
      }
      out.push({ ok: snapshotBodyHash(body) === anchored, note: `Snapshot sha256 ${snapshotBodyHash(body).slice(0, 16)}... ${p.settleSig && !isSimulatedSig(p.settleSig) ? "is stored in the settle transaction and its Memo." : "(Simulated settle: compare with the hash shown here)."}` });
      setChecks(out);
      setStatus(out.every((x) => x.ok) ? "Results verified." : "Some checks failed.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const playersPct = challenge.kind === "game" ? 70 : 100;
  return (
    <section className="panel stack" aria-labelledby={`prize-${challenge._id}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id={`prize-${challenge._id}`} style={{ fontSize: "1.3rem" }}>Prize: {challenge.title}</h2>
        <span className={`chip ${p.status === "settled" ? "ok" : p.status === "no_winners" ? "warn" : ""}`}>{p.status === "open" ? (ended ? "Ended, settling" : "Open") : p.status.replace("_", " ")}</span>
      </div>
      <AmphoraSplit poolLabel={sol(p.poolLamports)} bands={challenge.kind === "game" ? [{ label: "Players", percent: playersPct, color: "var(--aegean)" }, { label: "Contributors", percent: 30, color: "var(--olive)" }] : [{ label: "Builders (50, 30, 20)", percent: 100, color: "var(--aegean)" }]} />
      {p.payouts?.length ? (
        <div className="table-scroll">
          <table className="data"><thead><tr><th>Recipient</th><th>Role</th><th>Share</th><th>Tokens</th></tr></thead>
            <tbody>{p.payouts.map((x, i) => <tr key={x.wallet} className={i === 0 ? "rank-one" : undefined}><td>{x.handle ? <AuthorChip handle={x.handle} /> : <span className="muted">Player</span>}</td><td className="small">{x.role === "contributor" ? "Contributor" : x.role === "builder" ? "Builder" : "Player"}</td><td>{(x.bps / 100).toFixed(2)}%</td><td>{sol(Math.floor((p.poolLamports * x.bps) / 10000))}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {p.settleSig ? <p className="small">Settle receipt: {isSimulatedSig(p.settleSig) ? <Simulated /> : <a href={explorerTx(p.settleSig)} target="_blank" rel="noreferrer">one transaction on Explorer</a>}</p> : null}
      {p.snapshotHash ? <p className="small"><a href={`/api/challenges/${challenge._id}/snapshot.json`} download>Download results</a></p> : null}
      <div className="row">
        {p.status === "settled" ? <button className="btn ghost" onClick={verify} disabled={busy}><Tripod size={18} />Verify results</button> : null}
        {p.status === "open" && ended && canSettle ? <button className="btn" onClick={settle} disabled={busy}>Settle now (admin)</button> : null}
        <Link className="btn quiet sm" href={`/community/${challenge._id}`}>Details</Link>
      </div>
      <StatusLine tone={checks ? (checks.every((c) => c.ok) ? "ok" : "warn") : "muted"}>{status}</StatusLine>
      {checks ? (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}>
          {checks.map((c, i) => <li key={i} className="row small" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: c.ok ? "var(--olive)" : "var(--clay)" }}>{c.ok ? <Check size={16} title="ok" /> : <Cross size={16} title="failed" />}</span>{c.note}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
