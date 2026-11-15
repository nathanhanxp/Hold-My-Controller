"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { exportAssetFiles, slugify, zipFiles } from "@forklab/engine";
import { AuthorChip, ErrorPanel, NotFoundArt, PageHeader, SkeletonPanel, StatusLine, Simulated } from "../ui";
import { AssetCard, MechanicCard } from "../cards";
import { useIdentity } from "../identity";
import { api, useFetch } from "@/lib/client";
import type { CardGraph, PublicAsset } from "@/lib/serialize";

export function AssetPage({ hash }: { hash: string }) {
  const router = useRouter();
  const { handle } = useIdentity();
  const { data, error, loading, reload } = useFetch<{ asset: PublicAsset; usedBy: CardGraph[] }>(`/api/assets/${hash}`);
  const rec = useFetch<{ items: Array<PublicAsset & { reason: string }> }>(`/api/assets/${hash}/similar`);
  const [status, setStatus] = useState("");
  if (loading && !data) return <div className="wrap" style={{ paddingTop: 28 }}><SkeletonPanel height={200} /></div>;
  if (error?.status === 404) return <NotFoundArt title="Asset not found" message="No prefab or theme has that hash." />;
  if (error || !data) return <div className="wrap"><ErrorPanel message="Couldn't reach the server." onRetry={reload} /></div>;
  const a = data.asset;
  const exportZip = async () => {
    const blob = (await zipFiles(exportAssetFiles(a.asset, hash), "blob")) as Blob;
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = `${slugify(a.title)}-asset.zip`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fork = async () => {
    if (!handle) { setStatus("Pick a handle first."); return; }
    try {
      const r = await api<{ draft: PublicAsset["asset"] }>(`/api/assets/${hash}/fork`, { method: "POST" });
      const draft = { ...r.draft, authorId: handle };
      if (draft.prefab) draft.prefab = { ...draft.prefab, w: Math.min(16000, Math.round(draft.prefab.w * 1.25)) };
      const res = await api<{ asset: PublicAsset }>("/api/assets", { method: "POST", json: { asset: draft } });
      router.push(`/library/${res.asset.kind}/${res.asset._id}`);
    } catch (e) { setStatus((e as Error).message); }
  };
  return (
    <div className="wrap">
      <PageHeader eyebrow={a.kind === "prefab" ? "Prefab" : "Theme"} title={a.title} intro={<span className="row" style={{ display: "inline-flex" }}>by <AuthorChip handle={a.authorId} /><span className="chip free">Free to fork</span></span>}>
        <button className="btn quiet" onClick={fork}>Fork (25 percent wider)</button>
        <button className="btn" onClick={exportZip}>Export for Unity</button>
      </PageHeader>
      <StatusLine>{status}</StatusLine>
      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="stack">
          <div style={{ maxWidth: 360 }}><AssetCard a={a} /></div>
          <section className="panel">
            <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>Parameters</h2>
            <table className="data"><tbody>
              {a.asset.prefab ? Object.entries(a.asset.prefab).map(([k, v]) => <tr key={k}><th>{k}</th><td className="mono">{String(v)}</td></tr>) : null}
              {a.asset.theme ? Object.entries(a.asset.theme).map(([k, v]) => <tr key={k}><th>{k}</th><td className="row"><span className="author-dot" style={{ background: v }} />{v}</td></tr>) : null}
            </tbody></table>
          </section>
        </div>
        <aside className="stack">
          <section className="panel stack"><h2 style={{ fontSize: "1.3rem" }}>Anchor</h2><p className="small">{a.anchor.status === "simulated" ? <>Anchored <Simulated /></> : a.anchor.status}</p><p className="hash">{hash}</p></section>
          <section className="panel stack"><h2 style={{ fontSize: "1.3rem" }}>Used by</h2>{data.usedBy.length ? data.usedBy.map((g) => <MechanicCard key={g._id} g={g} />) : <p className="small muted">Not used in a published graph yet.</p>}</section>
        </aside>
      </div>
      <section className="stack" style={{ marginTop: 24 }}>
        <h2>Recommended</h2>
        <div className="cards">{(rec.data?.items ?? []).map((x) => <AssetCard key={x._id} a={x} reason={x.reason} />)}</div>
        {rec.data && !rec.data.items.length ? <p className="small muted">No recommendations yet.</p> : null}
      </section>
    </div>
  );
}
