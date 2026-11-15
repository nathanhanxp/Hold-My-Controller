"use client";
import Link from "next/link";
import { PageHeader, SkeletonPanel, ErrorPanel, NotFoundArt, AuthorChip } from "../ui";
import { PrizePanel } from "./PrizePanel";
import { countdown, useFetch } from "@/lib/client";
import type { ChallengeDoc, EntryDoc } from "@/lib/store/types";
import type { CardGraph } from "@/lib/serialize";

type Detail = { challenge: ChallengeDoc; rule: { title: string; rule: string } | null; entries: Array<EntryDoc & { graph: CardGraph | null }>; standings: Array<{ player: string; score: number }> };

export function ChallengePage({ id }: { id: string }) {
  const { data, error, loading, reload } = useFetch<Detail>(`/api/challenges/${id}`);
  const health = useFetch<{ mode: string }>("/api/health");
  if (loading && !data) return <div className="wrap" style={{ paddingTop: 28 }}><SkeletonPanel lines={4} /></div>;
  if (error?.status === 404) return <NotFoundArt title="Challenge not found" message="No challenge has that id." />;
  if (error || !data) return <div className="wrap"><ErrorPanel message="Couldn't load the challenge." onRetry={reload} /></div>;
  const c = data.challenge;
  return (
    <div className="wrap">
      <PageHeader eyebrow={c.kind === "game" ? "Weekly game" : `Episode ${c.episode}`} title={c.title} />
      <div className="two-col" style={{ marginTop: 18 }}>
        <section className="panel stack">
          <h2 style={{ fontSize: "1.3rem" }}>Standings</h2>
          {c.kind === "game" ? (
            <table className="data"><thead><tr><th>Rank</th><th>Player</th><th>Score</th></tr></thead><tbody>{data.standings.map((s, i) => <tr key={s.player} className={i === 0 ? "rank-one" : undefined}><td>{i + 1}</td><td><AuthorChip handle={s.player} /></td><td>{s.score}</td></tr>)}</tbody></table>
          ) : (
            <table className="data"><thead><tr><th>Entry</th><th>Author</th><th>Rule</th><th>Votes</th></tr></thead><tbody>{data.entries.map((e) => <tr key={e._id}><td>{e.graph ? <Link href={`/m/${e.graphId}`}>{e.graph.title}</Link> : e.graphId.slice(0, 8)}</td><td><AuthorChip handle={e.author} /></td><td className="small">{e.rule.ok ? "Passes" : "Fails"}</td><td>{e.votes}</td></tr>)}</tbody></table>
          )}

        </section>
        <PrizePanel challenge={c} onChanged={reload} canSettle={health.data?.mode === "mock"} />
      </div>
    </div>
  );
}
