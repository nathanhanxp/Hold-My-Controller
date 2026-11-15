"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SkeletonPanel, ErrorPanel, EmptyState, StatusLine } from "../ui";
import { CardCarousel3D } from "../three/CardCarousel3D";
import { Emblem3D } from "../three/Emblem3D";
import { MechanicCard, RecommendedRail, AssetCard } from "../cards";
import { AuthorChip } from "../ui";
import { api, safeStorage, sol, useFetch } from "@/lib/client";
import type { CardGraph, PublicAsset } from "@/lib/serialize";

const SCOPES = [
  { id: "all", label: "All" }, { id: "mechanics", label: "Games" }, { id: "levels", label: "Levels" }, { id: "prefabs", label: "Prefabs" },
  { id: "themes", label: "Themes" }, { id: "creators", label: "Creators" }, { id: "challenges", label: "Challenges" },
] as const;
const FILTERS = [
  { id: "free", label: "Free to fork", key: "license" }, { id: "paid", label: "Paid", key: "license" },
  { id: "trending", label: "Trending", key: "sort" }, { id: "forks", label: "Most forked", key: "sort" }, { id: "new", label: "Newest", key: "sort" },
] as const;

type SearchResult = { mode: string; via?: string; notice: string | null; items: unknown[] };

export function Discover() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = sp.get("q") ?? "";
  const scope = (sp.get("scope") ?? "all") as (typeof SCOPES)[number]["id"];
  const mode = sp.get("mode") === "describe" ? "describe" : "keyword";
  const license = sp.get("license") ?? "";
  const sort = sp.get("sort") ?? "trending";
  const tag = sp.get("tag") ?? "";
  const view = sp.get("view") === "list" ? "list" : "cards";
  const [text, setText] = useState(q);
  const [suggest, setSuggest] = useState<CardGraph[]>([]);
  useEffect(() => setText(q), [q]);

  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? n.delete(k) : n.set(k, v));
    router.replace(`${path}?${n.toString()}`, { scroll: false });
  };

  const url = `/api/search?${new URLSearchParams({ q, scope, mode, ...(license ? { license } : {}), ...(tag ? { tag } : {}), sort }).toString()}`;
  const { data, error, loading, reload } = useFetch<SearchResult>(url);
  const { data: winner } = useFetch<{ mechanic: CardGraph }>("/api/winner");
  const { data: mostForked } = useFetch<{ items: CardGraph[] }>("/api/mechanics?sort=forks&license=free");
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  useEffect(() => setLastPlayed(safeStorage().get("forklab.lastPlayed")), []);

  // debounced suggestions as you type (250 ms)
  useEffect(() => {
    if (!text.trim() || text === q) { setSuggest([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api<SearchResult>(`/api/search?${new URLSearchParams({ q: text, scope: "mechanics", mode }).toString()}`);
        setSuggest((r.items as CardGraph[]).slice(0, 5));
      } catch { setSuggest([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [text, q, mode]);

  const items = data?.items ?? [];
  const tags = useMemo(() => [...new Set((items as CardGraph[]).flatMap((i) => (Array.isArray((i as CardGraph).tags) ? (i as CardGraph).tags : [])))].slice(0, 10), [items]);
  const isGraphs = scope === "mechanics" || scope === "levels";
  const isAssets = scope === "prefabs" || scope === "themes";
  const fallback = [winner?.mechanic, ...(mostForked?.items ?? [])].filter(Boolean).filter((g, i, a) => a.findIndex((x) => x!._id === g!._id) === i) as CardGraph[];
  const { data: featured } = useFetch<{ items: CardGraph[] }>("/api/mechanics?sort=trending");
  const heroItems = (featured?.items ?? []).slice(0, 8);
  const stats = (featured?.items ?? []).reduce((a, g) => ({ games: a.games + 1, forks: a.forks + g.stats.forks, plays: a.plays + g.stats.plays }), { games: 0, forks: 0, plays: 0 });
  const recHash = lastPlayed ?? (isGraphs && items.length && q ? (items[0] as CardGraph)._id : null);

  return (
    <div className="wrap">
      <section className="hero-full" aria-labelledby="hero-h">
        <Emblem3D />
        <div className="hero-copy">
          <p className="eyebrow">Discover</p>
          <h1 id="hero-h">Easy to make. <em>Easy to join.</em></h1>
          <div className="row" style={{ marginTop: 26 }}>
            <Link className="btn lg" href="/build">Start building <span className="arrow">-&gt;</span></Link>
            <Link className="btn ghost lg" href="/community">This week&apos;s game</Link>
          </div>
          <dl className="hero-meta" aria-label="Hold My Controller at a glance">
          <div><dt>Games</dt><dd>{String(stats.games).padStart(2, "0")}</dd></div>
          <div><dt>Forks</dt><dd>{String(stats.forks).padStart(2, "0")}</dd></div>
          <div><dt>Plays</dt><dd>{stats.plays.toLocaleString("en-US")}</dd></div>
        </dl>
        </div>
      </section>
      <section className="featured" aria-labelledby="featured-h">
        <div className="sec-head"><span className="sec-index">01</span><h2 id="featured-h" className="explore-title">Featured</h2><span className="sec-rule" /><span className="sec-note" /></div>
        <div className="featured-stage">{heroItems.length ? <CardCarousel3D items={heroItems} /> : null}</div>
      </section>
      <section className="explore" aria-labelledby="search-h">
        <div className="sec-head"><span className="sec-index">02</span><h2 id="search-h" className="explore-title">Explore</h2><span className="sec-rule" /><span className="sec-note">{data ? `${items.length} results` : ""}</span></div>
        <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text }); setSuggest([]); }}>
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "describe" ? "Describe a game, for example: dodge falling rocks" : "Search games, levels, prefabs, creators"} autoComplete="off" />
          <div className="seg" role="radiogroup" aria-label="Search mode">
            <button type="button" aria-pressed={mode === "keyword"} onClick={() => set({ mode: null })}>Keyword</button>
            <button type="button" aria-pressed={mode === "describe"} onClick={() => set({ mode: "describe" })}>Describe</button>
          </div>
          {suggest.length ? (
            <ul className="suggest">
              {suggest.map((g) => <li key={g._id}><Link href={`/m/${g._id}`}>{g.title} <span className="muted">@{g.authorId}</span></Link></li>)}
            </ul>
          ) : null}
        </form>
        <div className="filters">
          <div className="row" role="tablist" aria-label="Type">
            {SCOPES.map((t) => <button key={t.id} role="tab" className="chip big" aria-selected={scope === t.id} aria-pressed={scope === t.id} onClick={() => set({ scope: t.id === "all" ? null : t.id, tag: null })}>{t.label}</button>)}
          </div>
          {isGraphs || isAssets || scope === "all" ? (
            <div className="row">
              {FILTERS.filter((f) => (scope === "mechanics" || scope === "all") || f.key !== "license").map((f) => {
                const on = f.key === "license" ? license === f.id : sort === f.id;
                return <button key={f.id} className="chip" aria-pressed={on} onClick={() => set({ [f.key]: on && f.key === "license" ? null : f.id })}>{f.label}</button>;
              })}
              {tags.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => set({ tag: tag === t ? null : t })}>#{t}</button>)}
            </div>
          ) : null}
        </div>
        <StatusLine>{loading ? "" : data ? `${items.length} result${items.length === 1 ? "" : "s"}` : ""}</StatusLine>
        {loading && !data ? <div className="cards">{[0, 1, 2, 3].map((i) => <SkeletonPanel key={i} height={140} />)}</div> : null}
        {error ? <ErrorPanel message="Couldn't reach the server." onRetry={reload} /> : null}
        {data && !items.length ? <EmptyState>Nothing matches. Try another word or clear a filter.</EmptyState> : null}
        {data && items.length && (isGraphs || isAssets || scope === "all") ? (
          <div className="cards">
            {(items as Array<{ _id: string; itemType?: string }>).map((it) =>
              it.itemType === "prefab" || it.itemType === "theme" || (scope !== "all" && isAssets) ? <AssetCard key={it._id} a={it as unknown as PublicAsset} /> : <MechanicCard key={it._id} g={it as unknown as CardGraph} />,
            )}
          </div>
        ) : null}
        {data && items.length && scope === "creators" ? (
          <div className="cards">
            {(items as Array<{ handle: string; mechanics: number; forksReceived: number; earnedLamports: number }>).map((c) => (
              <Link key={c.handle} href={`/u/${c.handle}`} className="card creator-card">
                <div className="body">
                  <AuthorChip handle={c.handle} link={false} />
                  <p className="small muted">{c.mechanics} games · {c.forksReceived} forks · {sol(c.earnedLamports)} earned</p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
        {data && items.length && scope === "challenges" ? (
          <div className="cards">
            {(items as Array<{ _id: string; title: string; kind: string; prize: { status: string } }>).map((c) => (
              <Link key={c._id} href={`/community/${c._id}`} className="card"><div className="body"><h3>{c.title}</h3><p className="small muted">{c.kind === "game" ? "Weekly game" : "Episode"} · {c.prize.status.replace("_", " ")}</p></div></Link>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 48 }}><RecommendedRail hash={recHash} fallback={fallback} /></div>
      </section>
    </div>
  );
}
