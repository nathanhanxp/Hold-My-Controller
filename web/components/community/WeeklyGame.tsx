"use client";
import { useState } from "react";
import type { MinigameSpec } from "@forklab/engine";
import { GamePreview, type RunResult } from "../GamePreview";
import { Modal, StatusLine, AuthorChip } from "../ui";
import { useIdentity } from "../identity";
import { api, countdown, sol } from "@/lib/client";
import { AmphoraSplit } from "../odyssey/AmphoraSplit";
import { useWallet } from "@solana/wallet-adapter-react";
import type { PublicGraph } from "@/lib/serialize";
import type { ChallengeDoc } from "@/lib/store/types";

export type GameData = {
  challenge: ChallengeDoc;
  level: PublicGraph;
  mechanic: PublicGraph;
  standings: Array<{ player: string; score: number; replayHash: string; ticks: number; endedBy: string }>;
  projected: Array<{ wallet: string; bps: number; lamports: number; handle: string; role: string }>;
};

type Posted = { score: number; ticks: number; endedBy: string; forgedClaimRejected: boolean; claimedScore?: number };

/** Full-screen play with recording; the server replays the input script and records its own score. */
export type GhostRun = { inputs: Array<[number, number]>; label: string };

export function PlayModal({ game, onClose, onPosted, ghost }: { game: GameData; onClose: () => void; onPosted: () => void; ghost?: GhostRun | null }) {
  const { handle } = useIdentity();
  const wallet = useWallet();
  const [run, setRun] = useState<RunResult | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [status, setStatus] = useState("");
  const spec = game.challenge.minigame as MinigameSpec;
  const post = async (claimed?: number) => {
    if (!run) return;
    if (!handle) { setStatus("Pick a handle in the top bar first."); return; }
    setStatus("Sending your inputs; the server is replaying the run");
    try {
      const r = await api<Posted>(`/api/challenges/${game.challenge._id}/replays`, {
        method: "POST",
        json: { player: handle, wallet: wallet.publicKey?.toBase58(), claimedScore: claimed ?? run.score, script: { graphHash: spec.mechanicHash, seed: spec.seed, ticks: Math.max(1, run.ticks), inputs: run.inputs } },
      });
      setPosted(r);
      setStatus(r.forgedClaimRejected ? `Rejected the claimed score of ${r.claimedScore}. The server replay scored ${r.score}, and only that is on the board.` : `Verified by replay: ${r.score}.`);
      onPosted();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return (
    <Modal title={ghost ? `${game.challenge.title}: race ${ghost.label}` : game.challenge.title} onClose={onClose}>
      <div className="stack">
        <GamePreview graph={game.mechanic.graph} level={game.level.graph} seed={spec.seed} maxTicks={spec.maxTicks} theme={game.challenge.look?.theme ?? game.mechanic.theme} ghost={ghost ?? null} autoStart label={game.challenge.title} onEnd={(r) => { setRun(r); setPosted(null); setStatus(""); }}
          actions={run ? <button className="btn ghost" onClick={() => post()} disabled={!!posted}>{posted ? `Posted ${posted.score}` : `Post score ${run.score}`}</button> : null} />

        {run ? (
          <div className="row">
            <button className="btn" onClick={() => post()} disabled={!!posted}>Post score {run.score}</button>
          </div>
        ) : null}
        <StatusLine tone={posted ? (posted.forgedClaimRejected ? "warn" : "ok") : "muted"}>{status}</StatusLine>
      </div>
    </Modal>
  );
}

export function WeeklyGamePanel({ game, onPlay }: { game: GameData; onPlay: () => void }) {
  const c = game.challenge;
  return (
    <section className="panel stack" aria-labelledby="wg-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="wg-h">Minigame of the week</h2>
        <span className="chip">{countdown(c.endsAt)}</span>
      </div>
      <GamePreview graph={game.mechanic.graph} level={game.level.graph} seed={c.minigame!.seed} maxTicks={c.minigame!.maxTicks} theme={game.mechanic.theme} idle label="Weekly game preview" onPlay={onPlay} />
      <div className="row"><button className="btn lg" onClick={onPlay}>Play</button></div>
      <AmphoraSplit poolLabel={sol(c.prize.poolLamports)} bands={[{ label: "Players (50, 30, 20 of this pot)", percent: 70, color: "var(--aegean)" }, { label: `Contributors of ${game.mechanic.title}`, percent: 30, color: "var(--olive)" }]} />
      {game.projected.length ? (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Recipient</th><th>Role</th><th>Share</th><th>Tokens</th></tr></thead>
            <tbody>{game.projected.map((p) => <tr key={p.wallet}><td><AuthorChip handle={p.handle} /></td><td className="small">{p.role === "contributor" ? "Contributor" : "Player"}</td><td>{(p.bps / 100).toFixed(2)}%</td><td>{sol(p.lamports)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="small muted">No verified players yet. Play to be first.</p>}
    </section>
  );
}
