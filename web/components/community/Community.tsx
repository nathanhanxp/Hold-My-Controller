"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SkeletonPanel, ErrorPanel, AuthorChip, StatusLine, EmptyState, Modal } from "../ui";
import { GamePreview, controlsOf } from "../GamePreview";
import { PlayModal, type GameData, type GhostRun } from "./WeeklyGame";
import { PrizePanel } from "./PrizePanel";
import { useIdentity } from "../identity";
import { api, countdown, sol, useFetch } from "@/lib/client";
import { thumbUrl } from "@/lib/three/shots";
import type { CardGraph, PublicAsset } from "@/lib/serialize";
import type { ChallengeDoc } from "@/lib/store/types";

type Slot = "mechanic" | "level" | "look";
type Nominee = { id: string; slot: Slot; title: string; author: string; votes: number; tags: string[]; theme?: { sky: string; ground: string; accent: string }; kind: "graph" | "asset"; why: "top" | "rising" | "nominated"; plays: number; forks: number; creators?: string[] };
type Ballot = { game: string; closesAt: number; slots: Record<Slot, Nominee[]>; mine?: Record<Slot, string[]>; perSlot?: number };
type Replay = { _id: string; player: string; score: number; ticks: number; inputs: Array<[number, number]> };

const SLOT_COPY: Record<Slot, { title: string; share: string }> = {
  mechanic: { title: "Mechanic", share: "15% of the pot" },
  level: { title: "Level", share: "7.5% of the pot" },
  look: { title: "Look", share: "7.5% of the pot" },
};


/**
 * The Community tab is the weekly game the community runs: play this week's game, race a ghost,
 * vote on next week's mechanic, level and look, and see how the prize pool splits.
 */
export function Community() {
  const { handle } = useIdentity();
  const game = useFetch<GameData>("/api/games/current", 20_000);
  const ballot = useFetch<Ballot>(handle ? `/api/ballot?handle=${handle}` : "/api/ballot", 30_000);
  const list = useFetch<{ items: ChallengeDoc[] }>("/api/challenges");
  const health = useFetch<{ mode: string }>("/api/health");
  const replays = useFetch<{ items: Replay[] }>(game.data ? `/api/challenges/${game.data.challenge._id}/replays` : null, 30_000);
  const [playing, setPlaying] = useState<null | { ghost: GhostRun | null }>(null);
  const [trying, setTrying] = useState<Nominee | null>(null);
  const c = game.data?.challenge;
  const pastGames = (list.data?.items ?? []).filter((x) => x.kind === "game" && x._id !== c?._id);

  // the ghost to race: the mechanic creator's best run if they played, otherwise the current leader
  const ghost: GhostRun | null = useMemo(() => {
    const items = replays.data?.items ?? [];
    if (!items.length || !game.data) return null;
    const creator = game.data.mechanic.authorId;
    const pick = items.find((r) => r.player === creator) ?? items[0];
    return { inputs: pick.inputs, label: `@${pick.player}${pick.player === creator ? " (creator)" : ""}` };
  }, [replays.data, game.data]);

  return (
    <div className="wrap community">
      {/* this week's game */}
      <section className="cm-hero" aria-labelledby="cm-h">
        <div className="cm-hero-copy">
          <p className="eyebrow">Community · {c ? `Week ${c.episode.slice(-2)}` : "This week"}</p>
          <h1 id="cm-h">This week&apos;s game</h1>
          {game.data ? (
            <>
              <p className="cm-sub"><strong>{game.data.mechanic.title}</strong> on <strong>{game.data.level.title}</strong>{c?.look ? <> in <strong>{c.look.title}</strong></> : null}</p>
              <dl className="cm-facts">
                <div><dt>Prize pool</dt><dd>{sol(c!.prize.poolLamports)}</dd></div>
                <div><dt>Ends</dt><dd>{countdown(c!.endsAt)}</dd></div>
                <div><dt>Players</dt><dd>{game.data.standings.length}</dd></div>
                <div><dt>Picked by</dt><dd>{c?.chosenBy === "vote" ? "Community vote" : "Rotation"}</dd></div>
              </dl>
              <div className="row cm-cta">
                <button className="btn lg" onClick={() => setPlaying({ ghost: null })}>Play for the top score</button>
                {ghost ? <button className="btn ghost lg" onClick={() => setPlaying({ ghost })}>Race {ghost.label}</button> : null}
              </div>
              <p className="cm-controls"><span>Controls</span>{controlsOf([game.data.mechanic.graph, game.data.level.graph])}</p>
            </>
          ) : game.error ? <ErrorPanel message="Couldn't load this week's game." onRetry={game.reload} /> : <SkeletonPanel lines={4} />}
        </div>
        <div className="cm-hero-stage">
          {game.data ? <GamePreview graph={game.data.mechanic.graph} level={game.data.level.graph} seed={c!.minigame!.seed} maxTicks={c!.minigame!.maxTicks} theme={c?.look?.theme ?? game.data.mechanic.theme} idle label="This week's game" onPlay={() => setPlaying({ ghost: null })} /> : <SkeletonPanel height={320} />}
        </div>
      </section>

      {/* leaderboard and how the pot splits */}
      <section className="cm-grid">
        <div className="cm-card ticks" aria-labelledby="lb-h">
          <div className="sec-head"><span className="sec-index">01</span><h2 id="lb-h" className="cm-h2">Leaderboard</h2><span className="sec-rule" /></div>
          {game.data ? <Board game={game.data} /> : <SkeletonPanel lines={5} />}
        </div>
        <div className="cm-card ticks" aria-labelledby="pot-h">
          <div className="sec-head"><span className="sec-index">02</span><h2 id="pot-h" className="cm-h2">How the pot splits</h2><span className="sec-rule" /></div>
          {game.data ? <PotSplit game={game.data} /> : <SkeletonPanel lines={5} />}
        </div>
      </section>

      {/* next week's ballot */}
      <section className="cm-ballot" aria-labelledby="vote-h">
        <div className="sec-head"><span className="sec-index">03</span><h2 id="vote-h" className="cm-h2">Vote for next week</h2><span className="sec-rule" /><span className="sec-note">{ballot.data ? `Closes ${countdown(ballot.data.closesAt)}` : ""}</span></div>
        {ballot.error ? <ErrorPanel message="Couldn't load the ballot." onRetry={ballot.reload} /> : !ballot.data ? <SkeletonPanel lines={6} /> : (
          <div className="cm-slots">
            {(["mechanic", "level", "look"] as Slot[]).map((slot) => <SlotColumn key={slot} slot={slot} items={ballot.data!.slots[slot]} mine={ballot.data!.mine?.[slot] ?? []} perSlot={ballot.data!.perSlot ?? 2} handle={handle} onChanged={ballot.reload} onTry={setTrying} />)}
          </div>
        )}
      </section>


      <section className="cm-feeds" aria-labelledby="feeds-h">
        <div className="sec-head"><span className="sec-index">04</span><h2 id="feeds-h" className="cm-h2">Browse</h2><span className="sec-rule" /><Link className="sec-note" href="/library?mode=describe">Describe it</Link></div>
        <FeedRows onTry={setTrying} handle={handle} onChanged={ballot.reload} />
      </section>

      {/* settle and verify, this week and past weeks */}
      <section className="cm-past" aria-labelledby="past-h">
        <div className="sec-head"><span className="sec-index">05</span><h2 id="past-h" className="cm-h2">Results and receipts</h2><span className="sec-rule" /></div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
          {c ? <PrizePanel challenge={c} onChanged={() => { game.reload(); list.reload(); }} canSettle={health.data?.mode === "mock"} /> : null}
          {pastGames.slice(0, 3).map((x) => <PrizePanel key={x._id} challenge={x} onChanged={() => { list.reload(); game.reload(); }} canSettle={health.data?.mode === "mock"} />)}
        </div>
      </section>

      {trying && game.data ? <QuickPlay n={trying} game={game.data} onClose={() => setTrying(null)} /> : null}
      {playing && game.data ? <PlayModal game={game.data} ghost={playing.ghost} onClose={() => setPlaying(null)} onPosted={() => { game.reload(); replays.reload(); }} /> : null}
    </div>
  );
}

function Board({ game }: { game: GameData }) {
  const projected = new Map(game.projected.filter((p) => p.role === "player").map((p) => [p.handle, p]));
  if (!game.standings.length) return <EmptyState>No verified runs yet. Be the first on the board.</EmptyState>;
  return (
    <ol className="board">
      {game.standings.slice(0, 10).map((s, i) => (
        <li key={s.player} className={i < 3 ? `top top-${i + 1}` : undefined}>
          <span className="board-rank">{String(i + 1).padStart(2, "0")}</span>
          <AuthorChip handle={s.player} />
          <span className="board-score">{s.score}</span>
          <span className="board-prize">{projected.get(s.player) ? sol(projected.get(s.player)!.lamports) : ""}</span>
        </li>
      ))}
    </ol>
  );
}

function PotSplit({ game }: { game: GameData }) {
  const pool = game.challenge.prize.poolLamports;
  const makers = game.projected.filter((p) => p.role === "contributor");
  const rows: Array<[string, number, string]> = [["1st place", 3500, "var(--gold)"], ["2nd place", 2100, "#d9c48f"], ["3rd place", 1400, "#b9a77a"]];
  return (
    <div className="pot">
      <div className="pot-bar" aria-hidden="true">
        {rows.map(([l, bps, col]) => <span key={l} style={{ flex: bps, background: col }} title={l} />)}
        <span style={{ flex: 3000, background: "var(--aegean-deep)" }} title="Makers" />
      </div>
      <div className="pot-cols">
        <div>
          <p className="pot-k">Players · 70%</p>
          <ul>{rows.map(([l, bps]) => <li key={l}><span>{l}</span><strong>{sol(Math.floor((pool * bps) / 10000))}</strong></li>)}</ul>
        </div>
        <div>
          <p className="pot-k">Makers · 30%</p>
          <ul>
            {makers.length ? makers.map((m) => <li key={m.wallet}><span><AuthorChip handle={m.handle} link={false} /></span><strong>{sol(m.lamports)}</strong></li>) : <li><span className="muted">Shown once the game has players</span></li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function NomineeArt({ n }: { n: Nominee }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (n.kind !== "graph") return;
    let live = true;
    thumbUrl(n.id).then((u) => { if (live && u) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [n.id, n.kind]);
  if (n.kind === "asset" && n.theme) {
    return <div className="nom-art swatch" aria-hidden="true"><span style={{ background: n.theme.sky }} /><span style={{ background: n.theme.ground }} /><span style={{ background: n.theme.accent }} /></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`nom-art shot${src ? " ready" : ""}`}>{src ? <img src={src} alt="" /> : null}</div>;
}

function SlotColumn({ slot, items, mine, perSlot, handle, onChanged, onTry }: { slot: Slot; items: Nominee[]; mine: string[]; perSlot: number; handle: string | null; onChanged: () => void; onTry: (n: Nominee) => void }) {
  const [status, setStatus] = useState("");
  const total = items.reduce((t, x) => t + x.votes, 0);
  const vote = async (id: string) => {
    if (!handle) { setStatus("Pick a handle in the top bar to vote."); return; }
    try {
      const r = await api<{ earned: number }>("/api/ballot/vote", { method: "POST", json: { slot, id, handle } });
      setStatus(r.earned ? "Vote counted. You earned 1 token, and 1 more if this pick wins." : "Vote counted. You already earned this slot's token this week.");
      window.dispatchEvent(new Event("forklab:tokens"));
      onChanged();
    } catch (e) { setStatus((e as Error).message); }
  };
  const unvote = async (id: string) => {
    if (!handle) return;
    try {
      const r = await api<{ lost: number }>("/api/ballot/vote", { method: "DELETE", json: { slot, id, handle } });
      setStatus(r.lost ? "Vote removed. The token it earned was taken back." : "Vote removed. You keep this slot's token for your other vote.");
      window.dispatchEvent(new Event("forklab:tokens"));
      onChanged();
    } catch (e) { setStatus((e as Error).message); }
  };
  return (
    <div className="slot ticks">
      <div className="slot-head"><h3>{SLOT_COPY[slot].title}</h3><span className="slot-share">{SLOT_COPY[slot].share}</span><span className="slot-left">{Math.max(0, perSlot - mine.length)} of {perSlot} votes left</span></div>
      <ul className="noms">
        {items.map((n) => (
          <li key={n.id}>
            <button className="nom-try" onClick={() => onTry(n)} aria-label={`Try ${n.title}`}>
              <NomineeArt n={n} />
              <span className="nom-play" aria-hidden="true">Play</span>
            </button>
            <div className="nom-body">
              <span className="nom-title">{n.title}{n.why === "rising" ? <span className="nom-badge">Rising</span> : null}</span>
              <span className="nom-by">{(n.creators?.length ?? 0) > 1 ? `${n.creators!.map((h) => `@${h}`).slice(0, 3).join(", ")}${n.creators!.length > 3 ? ` +${n.creators!.length - 3}` : ""}` : `@${n.author}`}{n.kind === "graph" ? ` · ${n.plays} plays · ${n.forks} forks` : ""}</span>
              <div className="nom-meter" aria-hidden="true"><span style={{ width: `${total ? (n.votes / total) * 100 : 0}%` }} /></div>
            </div>
            <div className="nom-vote">
              <strong>{n.votes}</strong>
              {mine.includes(n.id) ? (
                <button className="btn sm voted" onClick={() => unvote(n.id)} title="Remove your vote" aria-label={`Remove your vote for ${n.title}`}><span className="v-on">Voted</span><span className="v-off">Remove</span></button>
              ) : (
                <button className="btn sm" onClick={() => vote(n.id)} disabled={n.author === handle || mine.length >= perSlot} title={n.author === handle ? "You can't vote for your own piece" : mine.length >= perSlot ? "Both votes used. Remove one to vote here." : undefined}>Vote</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <StatusLine>{status}</StatusLine>
    </div>
  );
}

type Card = CardGraph;
type Feeds = { trending: Card[]; rising: Card[]; fits: Card[]; levelTitle: string | null; levelHash: string | null };

/** Three short rows to choose from: what's hot, what's climbing, and what runs on next week's level. */
function FeedRows({ onTry, handle, onChanged }: { onTry: (n: Nominee) => void; handle: string | null; onChanged: () => void }) {
  const { data } = useFetch<Feeds>("/api/feeds", 60_000);
  const [note, setNote] = useState("");
  const nominate = async (g: Card) => {
    if (!handle) { setNote("Pick a handle in the top bar first."); return; }
    try {
      await api("/api/ballot/nominate", { method: "POST", json: { slot: g.kind === "level" ? "level" : "mechanic", id: g._id, handle } });
      setNote(`${g.title} is on next week's ballot. 20 tokens spent.`);
      window.dispatchEvent(new Event("forklab:tokens"));
      onChanged();
    } catch (e) { setNote((e as Error).message); }
  };
  if (!data) return <SkeletonPanel lines={4} />;
  const rows: Array<[string, Card[]]> = [["Trending this week", data.trending], ["Rising", data.rising], [data.levelTitle ? `Fits ${data.levelTitle}` : "Fits next week's level", data.fits]];
  return (
    <div className="feeds">
      {rows.map(([title, items]) => (
        <div key={title} className="feed">
          <h3>{title}</h3>
          <div className="feed-row">
            {items.map((g) => {
              const n: Nominee = { id: g._id, slot: "mechanic", title: g.title, author: g.authorId, votes: 0, tags: g.tags, kind: "graph", why: "top", plays: g.stats.plays, forks: g.stats.forks };
              return (
                <div key={g._id} className="feed-card">
                  <button className="nom-try" onClick={() => onTry(n)} aria-label={`Try ${g.title}`}><NomineeArt n={n} /><span className="nom-play" aria-hidden="true">Play</span></button>
                  <div className="feed-meta"><strong>{g.title}</strong><span>@{g.authorId} · {g.stats.plays} plays</span></div>
                  <span className="feed-actions">
                    <Link className="feed-similar" href={`/library?similar=${g._id}`}>Similar</Link>
                    <button className="feed-similar" onClick={() => nominate(g)} title="Put this game on next week's ballot for 20 tokens">Nominate · 20</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <StatusLine>{note}</StatusLine>
    </div>
  );
}

/** One-click try: the game is already running when the dialog opens; Play takes the controls. Ten seconds is enough to judge. */
function QuickPlay({ n, game, onClose }: { n: Nominee; game: GameData; onClose: () => void }) {
  const { data } = useFetch<{ mechanic: { graph: import("@forklab/engine").Graph; theme?: import("@forklab/engine").Theme; title: string } }>(n.kind === "graph" ? `/api/mechanics/${n.id}` : null);
  const piece = data?.mechanic;
  // a mechanic plays on next week's reference level, a level hosts this week's mechanic, a look dresses this week's game
  const mech = n.slot === "mechanic" ? piece?.graph : game.mechanic.graph;
  const level = n.slot === "level" ? piece?.graph : n.slot === "mechanic" ? null : game.level.graph;
  const theme = n.slot === "look" ? n.theme : n.slot === "mechanic" ? piece?.theme : game.mechanic.theme;
  return (
    <Modal title={n.title} onClose={onClose}>
      {mech ? <GamePreview graph={mech} level={level ?? null} theme={theme} maxTicks={600} idle label={n.title} /> : <SkeletonPanel height={300} />}
      <p className="small muted" style={{ marginTop: 10 }}>{mech ? controlsOf([mech, level]) : ""}</p>
    </Modal>
  );
}
