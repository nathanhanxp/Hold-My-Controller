"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { thumbUrl } from "@/lib/three/shots";
import type { CardGraph, PublicAsset } from "@/lib/serialize";
import { AuthorChip, LicenseChip, EmptyState, ErrorPanel, SkeletonPanel } from "./ui";
import { Ship } from "./glyphs";
import { ago, useFetch } from "@/lib/client";
import { splitColors } from "@/lib/colors";

/** A real frame of the game from the 3D renderer, rendered once the card scrolls near the viewport. */
function GameThumb({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      thumbUrl(id).then((u) => { if (live && u) setSrc(u); }).catch(() => {});
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [id]);
  // eslint-disable-next-line @next/next/no-img-element
  return <div ref={ref} className={`thumb shot${src ? " ready" : ""}`}>{src ? <img src={src} alt="" /> : null}</div>;
}

/** A fork built by several people: everyone whose blocks are in it, largest share first. */
export function Creators({ shares }: { shares: Array<{ handle: string; bps: number }> }) {
  const by = [...shares].sort((a, b) => b.bps - a.bps);
  const colors = splitColors(shares.map((s) => s.handle));
  const names = by.slice(0, 2).map((s) => `@${s.handle}`).join(", ") + (by.length > 2 ? ` +${by.length - 2}` : "");
  return (
    <span className="chip creators" title={by.map((s) => `@${s.handle} ${(s.bps / 100).toFixed(0)}%`).join(", ")}>
      <span className="stack-dots" aria-hidden="true">{by.slice(0, 4).map((s) => <span key={s.handle} style={{ background: colors.get(s.handle) }} />)}</span>
      {names} · {by.length} creators
    </span>
  );
}

export function MechanicCard({ g, reason }: { g: CardGraph; reason?: string }) {
  const [, setHover] = useState(false);
  return (
    <Link href={`/m/${g._id}`} className="card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <GameThumb id={g._id} />
      {reason ? <span className="chip ai reason">{reason}</span> : null}
      <div className="body">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{g.title}</h3>
          {g.kind === "level" ? <span className="chip">Level</span> : null}
        </div>
        <div className="row">{(g.shares?.length ?? 0) > 1 ? <Creators shares={g.shares!} /> : <AuthorChip handle={g.authorId} link={false} />}<LicenseChip license={g.license} /></div>
        <p className="small muted">{g.stats.forks} fork{g.stats.forks === 1 ? "" : "s"} · {g.stats.plays} play{g.stats.plays === 1 ? "" : "s"}{g.parentId ? " · forked" : ""}</p>
      </div>
    </Link>
  );
}

export function MechanicRow({ g }: { g: CardGraph }) {
  return (
    <tr>
      <td><Link href={`/m/${g._id}`} style={{ fontWeight: 600 }}>{g.title}</Link></td>
      <td><AuthorChip handle={g.authorId} /></td>
      <td><LicenseChip license={g.license} /></td>
      <td>{g.stats.forks}</td>
      <td>{g.stats.plays}</td>
      <td className="muted small">{ago(g.createdAt)}</td>
    </tr>
  );
}

export function MechanicTable({ items }: { items: CardGraph[] }) {
  return (
    <div className="table-scroll">
      <table className="data">
        <thead><tr><th>Title</th><th>Author</th><th>License</th><th>Forks</th><th>Plays</th><th>Published</th></tr></thead>
        <tbody>{items.map((g) => <MechanicRow key={g._id} g={g} />)}</tbody>
      </table>
    </div>
  );
}

export function AssetCard({ a, reason }: { a: PublicAsset & { reason?: string }; reason?: string }) {
  return (
    <Link href={`/library/${a.kind}/${a._id}`} className="card">
      <div className="thumb" style={{ display: "grid", placeItems: "center", background: a.asset.theme ? a.asset.theme.sky : "#070A10" }} aria-hidden="true">
        {a.asset.prefab ? (
          <div style={{ width: `${Math.min(80, a.asset.prefab.w / 30)}%`, aspectRatio: `${a.asset.prefab.w} / ${a.asset.prefab.h}`, maxHeight: "70%", background: a.asset.prefab.color, border: "1px solid var(--figure)" }} />
        ) : a.asset.theme ? (
          <div style={{ display: "flex", width: "70%", height: 36, borderRadius: 8, overflow: "hidden", boxShadow: "0 10px 30px -10px rgba(0,0,0,0.8)" }}>
            {[a.asset.theme.sky, a.asset.theme.ground, a.asset.theme.accent].map((c) => <div key={c} style={{ flex: 1, background: c }} />)}
          </div>
        ) : null}
      </div>
      {reason || a.reason ? <span className="chip ai reason">{reason ?? a.reason}</span> : null}
      <div className="body">
        <div className="row" style={{ justifyContent: "space-between" }}><h3>{a.title}</h3><span className="chip">{a.kind === "prefab" ? "Prefab" : "Theme"}</span></div>
        <div className="row"><AuthorChip handle={a.authorId} link={false} /><span className="chip free">Free to fork</span></div>
        <p className="small muted">{a.stats.forks} forks · used {a.stats.uses} time{a.stats.uses === 1 ? "" : "s"}</p>
      </div>
    </Link>
  );
}

type Activity = { items: Array<{ _id: string; kind: string; text: string; ref?: string; at: number }> };
export function ActivityFeed() {
  const { data, error, loading, reload } = useFetch<Activity>("/api/activity", 10_000);
  return (
    <section className="panel" aria-labelledby="activity-h">
      <div className="panel-title"><h2 id="activity-h" className="row" style={{ fontSize: "1.3rem" }}><Ship size={20} />Activity</h2></div>
      {loading && !data ? <SkeletonPanel lines={4} /> : error && !data ? <ErrorPanel message="Couldn't load activity." onRetry={reload} /> : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {(data?.items ?? []).slice(0, 12).map((a) => (
            <li key={a._id} className="small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              {a.ref && /^[0-9a-f]{64}$/.test(a.ref) ? <Link href={`/m/${a.ref}`} style={{ color: "var(--ink)" }}>{a.text}</Link> : a.ref ? <Link href={`/community/${a.ref}`} style={{ color: "var(--ink)" }}>{a.text}</Link> : a.text}
              <div className="tiny muted">{ago(a.at)}</div>
            </li>
          ))}
          {data && !data.items.length ? <li className="muted small">Nothing yet. Publish a mechanic to start the feed.</li> : null}
        </ul>
      )}
    </section>
  );
}

export function RecommendedRail({ hash, fallback }: { hash: string | null; fallback?: CardGraph[] }) {
  const { data, error, loading } = useFetch<{ items: Array<CardGraph & { reason: string }> }>(hash ? `/api/mechanics/${hash}/similar` : null);
  const items = hash ? data?.items ?? [] : [];
  return (
    <section aria-labelledby="rec-h" className="stack">
      <h2 id="rec-h">Recommended</h2>
      {hash && loading ? <div className="cards">{[0, 1, 2].map((i) => <SkeletonPanel key={i} height={120} />)}</div> : null}
      {hash && error ? <p className="small muted">Recommendations are unavailable right now.</p> : null}
      {items.length ? (
        <div className="cards">{items.slice(0, 6).map((g) => <MechanicCard key={g._id} g={g} reason={g.reason} />)}</div>
      ) : !loading && fallback?.length ? (
        <div className="cards">{fallback.slice(0, 3).map((g, i) => <MechanicCard key={g._id} g={g} reason={i === 0 ? "Winning mechanic" : "Most forked"} />)}</div>
      ) : !loading && !hash ? <EmptyState>No recommendations yet.</EmptyState> : null}
    </section>
  );
}
