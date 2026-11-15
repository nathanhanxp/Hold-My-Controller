"use client";
import { PageHeader, SkeletonPanel, ErrorPanel, StatStrip, EmptyState } from "../ui";
import { MechanicCard } from "../cards";
import { useFetch, sol } from "@/lib/client";
import { authorColor } from "@/lib/colors";
import type { CardGraph } from "@/lib/serialize";

type Profile = { creator: { handle: string; mechanics: number; forksReceived: number; plays: number; earnedLamports: number; wins: number }; user: { pubkey?: string } | null; graphs: CardGraph[]; contributed: CardGraph[] };

export function ProfilePage({ handle }: { handle: string }) {
  const { data, error, loading, reload } = useFetch<Profile>(`/api/creators/${encodeURIComponent(handle)}`);
  return (
    <div className="wrap">
      <PageHeader eyebrow="Creator" title={<span className="row" style={{ display: "inline-flex" }}><span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 6, background: authorColor(handle), display: "inline-block" }} />@{handle}</span>} intro={data?.user?.pubkey ? "Wallet linked" : "No wallet linked yet."} />
      {loading && !data ? <SkeletonPanel lines={3} /> : null}
      {error ? <ErrorPanel message="Couldn't load this creator." onRetry={reload} /> : null}
      {data ? (
        <div className="stack" style={{ marginTop: 18, gap: 20 }}>
          <StatStrip items={[{ label: "Mechanics", value: data.creator.mechanics }, { label: "Forks received", value: data.creator.forksReceived }, { label: "Plays", value: data.creator.plays }, { label: "Earned (devnet)", value: sol(data.creator.earnedLamports) }, { label: "Challenges won", value: data.creator.wins }]} />
          <section className="stack"><h2>Published</h2>{data.graphs.length ? <div className="cards">{data.graphs.map((g) => <MechanicCard key={g._id} g={g} />)}</div> : <EmptyState>Nothing published yet.</EmptyState>}</section>
          <section className="stack"><h2>Nodes in other people&apos;s mechanics</h2>{data.contributed.length ? <div className="cards">{data.contributed.map((g) => <MechanicCard key={g._id} g={g} />)}</div> : <EmptyState>No forks carry this creator&apos;s nodes yet.</EmptyState>}</section>
        </div>
      ) : null}
    </div>
  );
}
