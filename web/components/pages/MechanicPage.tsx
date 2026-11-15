"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { prefabRegistry, type Graph } from "@forklab/engine";
import { GamePreview } from "../GamePreview";
import { GraphCanvas } from "../editor/GraphCanvas";
import { layoutGraph, needsLayout } from "../editor/layout";
import { SeaChart, LineageList } from "../LineageMap";
import { VerifyPanel } from "../VerifyPanel";
import { LicenseButton } from "../LicenseButton";
import { ExportModal } from "../ExportModal";
import { RecommendedRail } from "../cards";
import { AuthorChip, ErrorPanel, LicenseChip, NotFoundArt, PageHeader, SkeletonPanel, SplitBars, StatusLine, Simulated } from "../ui";
import { Ship, Tripod, Loom, WindRoseGlyph } from "../glyphs";
import { api, safeStorage, useFetch } from "@/lib/client";
import type { CardGraph, PublicGraph } from "@/lib/serialize";
import { explorerTx } from "@/lib/solana";

type Lineage = { current: string; ancestors: CardGraph[]; descendants: CardGraph[]; tree: CardGraph[]; sources: CardGraph[] };
type Health = { mode: "live" | "mock"; programConfigured: boolean };

export function MechanicPage({ hash }: { hash: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (["play", "graph", "lineage", "verify"] as const).find((t) => t === sp.get("tab")) ?? "play";
  const { data, error, loading, reload } = useFetch<{ mechanic: PublicGraph }>(`/api/mechanics/${hash}`);
  const { data: lineage } = useFetch<Lineage>(`/api/mechanics/${hash}/lineage`);
  const { data: health } = useFetch<Health>("/api/health");
  const [changelog, setChangelog] = useState<{ text: string; badge: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [lineageView, setLineageView] = useState<"chart" | "list">("chart");
  const [msg, setMsg] = useState("");
  const [prefabs, setPrefabs] = useState({});
  const m = data?.mechanic;

  useEffect(() => {
    if (!m) return;
    api<{ text: string; badge: string }>("/api/ai/changelog", { method: "POST", json: { hash } }).then(setChangelog).catch(() => setChangelog({ text: m.changelog ?? "", badge: "AI: local" }));
    Promise.all(m.assetRefs.map((a) => api<{ asset: { _id: string; asset: never } }>(`/api/assets/${a}`).catch(() => null)))
      .then((rs) => setPrefabs(prefabRegistry(rs.filter(Boolean).map((r) => ({ hash: r!.asset._id, asset: r!.asset.asset })))));
    // poll until anchored
    if (m.anchor.status === "pending") { const t = setTimeout(reload, 8000); return () => clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?._id, m?.anchor.status]);

  if (loading && !data) return <div className="wrap" style={{ paddingTop: 28 }}><SkeletonPanel lines={3} height={320} /></div>;
  if (error?.status === 404) return <NotFoundArt title="Mechanic not found" message="No mechanic has that hash. It may not be published yet." />;
  if (error || !m) return <div className="wrap" style={{ paddingTop: 28 }}><ErrorPanel message="Couldn't reach the server. Retrying may help." onRetry={reload} /></div>;

  const setTab = (t: string) => router.replace(`${path}?tab=${t}`, { scroll: false });
  const live = health?.mode === "live" && !!health.programConfigured;
  const graph: Graph = needsLayout(m.graph) ? layoutGraph(m.graph) : m.graph;
  const share = async () => {
    const url = `${window.location.origin}/m/${hash}`;
    try { await navigator.clipboard.writeText(url); setMsg("Link copied"); } catch { setMsg(url); }
  };

  return (
    <div className="wrap">
      <PageHeader eyebrow={m.kind === "level" ? "Level" : "Mechanic"} title={m.title} intro={<span className="row" style={{ display: "inline-flex" }}>by <AuthorChip handle={m.authorId} /> <LicenseChip license={m.license} />{m.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</span>}>
        <Link className="btn quiet" href={`/build?fork=${hash}`}>Fork</Link>
        <button className="btn quiet" onClick={() => setShowExport(true)}>Export</button>
        <button className="btn ghost" onClick={share}>Share</button>
      </PageHeader>
      <div className="row small" style={{ marginTop: 10 }}>
        {m.parentId ? <Link className="chip" href={`/m/${m.parentId}`}>Fork of {lineage?.ancestors.at(-1)?.title ?? "a mechanic"}</Link> : <span className="chip">Original</span>}
        {lineage?.sources.length ? <span className="chip warn">Borrowed from {lineage.sources.map((s) => `@${s.authorId}'s ${s.title}`).join(", ")}</span> : null}
        <span className="hash">{hash}</span>
      </div>
      <StatusLine>{msg}</StatusLine>
      <div className="two-col" style={{ marginTop: 8 }}>
        <div className="stack">
          <GamePreview graph={m.graph} theme={m.theme} prefabs={prefabs} label={m.title} onPlay={() => { safeStorage().set("forklab.lastPlayed", hash); void api(`/api/mechanics/${hash}/play`, { method: "POST" }).catch(() => undefined); }} />
          <div className="tabs" role="tablist" aria-label="Mechanic views">
            <button role="tab" aria-selected={tab === "play"} onClick={() => setTab("play")}><Ship size={16} />About</button>
            <button role="tab" aria-selected={tab === "graph"} onClick={() => setTab("graph")}><Loom size={16} />Graph</button>
            <button role="tab" aria-selected={tab === "lineage"} onClick={() => setTab("lineage")}><WindRoseGlyph size={16} />Lineage map</button>
            <button role="tab" aria-selected={tab === "verify"} onClick={() => setTab("verify")}><Tripod size={16} />Verify</button>
          </div>
          <div role="tabpanel" className="panel">
            {tab === "play" ? (
              <div className="stack">
                                <p className="small muted">{m.graph.nodes.length} nodes, {m.stats.plays} plays, {m.stats.forks} forks, {m.stats.licenses} licenses.</p>
                <div className="row"><Link className="btn" href={`/build?fork=${hash}`}>Fork and edit</Link><button className="btn quiet" onClick={() => setTab("lineage")}>See the voyage</button></div>
              </div>
            ) : null}
            {tab === "graph" ? (
              <div style={{ height: 520 }}>
                <GraphCanvas graph={graph} readOnly colorByAuthor />
              </div>
            ) : null}
            {tab === "lineage" ? (
              <div className="stack">
                <div className="row"><button className="chip" aria-pressed={lineageView === "chart"} onClick={() => setLineageView("chart")}>Sea chart</button><button className="chip" aria-pressed={lineageView === "list"} onClick={() => setLineageView("list")}>List</button></div>
                {!lineage ? <SkeletonPanel lines={2} height={200} /> : lineageView === "chart" ? <SeaChart docs={[...lineage.tree, ...lineage.sources.filter((s) => !lineage.tree.some((t) => t._id === s._id))]} current={hash} sources={lineage.sources} /> : <LineageList docs={lineage.tree} current={hash} />}
              </div>
            ) : null}
            {tab === "verify" ? <VerifyPanel hash={hash} mock={health?.mode !== "live"} /> : null}
          </div>
        </div>
        <aside className="stack">
          {m.license.type === "paid" ? (
            <section className="panel stack" aria-labelledby="lic-h">
              <h2 id="lic-h" style={{ fontSize: "1.3rem" }}>License</h2>
                            <LicenseButton hash={hash} title={m.title} priceLamports={m.license.priceLamports} live={live} onDone={reload} />
            </section>
          ) : (
            <section className="panel stack"><h2 style={{ fontSize: "1.3rem" }}>Free to fork</h2><Link className="btn" href={`/build?fork=${hash}`}>Fork it</Link></section>
          )}
          <section className="panel" aria-labelledby="split-h">
            <h2 id="split-h" style={{ fontSize: "1.3rem", marginBottom: 10 }}>Payout split</h2>
            <SplitBars shares={m.shares} />
          </section>
          <section className="panel stack" aria-labelledby="cl-h">
            <div className="row" style={{ justifyContent: "space-between" }}><h2 id="cl-h" style={{ fontSize: "1.3rem" }}>Changelog</h2></div>
            <p className="small">{changelog?.text ?? m.changelog ?? "Loading"}</p>
          </section>
          <section className="panel stack" aria-labelledby="an-h">
            <h2 id="an-h" style={{ fontSize: "1.3rem" }}>Anchor</h2>
            {m.anchor.status === "pending" ? <p className="small" role="status">Anchoring</p> : m.anchor.status === "simulated" ? <p className="small">Anchored</p> : m.anchor.status === "confirmed" && m.anchor.sig ? <a className="small" href={explorerTx(m.anchor.sig)} target="_blank" rel="noreferrer">Confirmed on devnet (Explorer)</a> : <p className="small">{m.anchor.status}</p>}
          </section>
        </aside>
      </div>
      <div style={{ marginTop: 28 }}><RecommendedRail hash={hash} /></div>
      {showExport ? <ExportModal graph={m.graph} hash={hash} author={null} prefabs={prefabs} onClose={() => setShowExport(false)} /> : null}
    </div>
  );
}
