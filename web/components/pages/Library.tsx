"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, SkeletonPanel, ErrorPanel, EmptyState, StatusLine } from "../ui";
import { MechanicCard, MechanicTable, AssetCard } from "../cards";
import { SeaChart, LineageList } from "../LineageMap";
import { Column } from "../glyphs";
import { useFetch } from "@/lib/client";
import type { CardGraph, PublicAsset } from "@/lib/serialize";
import Link from "next/link";

const KINDS = [{ id: "mechanic", label: "Mechanics" }, { id: "level", label: "Levels" }, { id: "prefab", label: "Prefabs" }, { id: "theme", label: "Themes" }] as const;

export function Library() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const kind = (KINDS.find((k) => k.id === sp.get("kind"))?.id ?? "mechanic") as (typeof KINDS)[number]["id"];
  const view = (["cards", "list", "chart"] as const).find((v) => v === sp.get("view")) ?? "cards";
  const sort = sp.get("sort") ?? "trending";
  const tag = sp.get("tag") ?? "";
  const license = sp.get("license") ?? "";
  const q = sp.get("q") ?? "";
  const similar = sp.get("similar") ?? "";
  const author = sp.get("author") ?? "";
  const fitsOnly = sp.get("fits") === "1";
  const [creator, setCreator] = useState(author);
  const mode = sp.get("mode") === "describe" ? "describe" : "keyword";
  const [text, setText] = useState(q);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? n.delete(k) : n.set(k, v));
    router.replace(`${path}?${n.toString()}`, { scroll: false });
  };
  const graphs = kind === "mechanic" || kind === "level";
  const url = mode === "describe" && q
    ? `/api/search?${new URLSearchParams({ q, mode, scope: `${kind}s`, ...(tag ? { tag } : {}), ...(license ? { license } : {}) })}`
    : similar ? `/api/mechanics/${similar}/similar`
    : `/api/library?${new URLSearchParams({ kind, sort, ...(tag ? { tag } : {}), ...(license ? { license } : {}), ...(q ? { q } : {}), ...(author ? { author } : {}), ...(fitsOnly ? { fits: "1" } : {}) })}`;
  const { data, error, loading, reload } = useFetch<{ items: Array<CardGraph | PublicAsset>; notice?: string | null }>(url);
  const items = data?.items ?? [];
  const tags = [...new Set(items.flatMap((i) => i.tags))].slice(0, 12);
  const usedMin = Number(sp.get("used") ?? "0");
  const shown = items.filter((i) => ("uses" in i.stats ? (i.stats as { uses: number }).uses : (i.stats as { forks: number }).forks) >= usedMin);

  return (
    <div className="wrap">
      <PageHeader eyebrow="Library" title="The open-source library" frieze="olive" />
      <div className="tabs" role="tablist" aria-label="Library sections" style={{ marginTop: 18 }}>
        {KINDS.map((k) => <button key={k.id} role="tab" aria-selected={kind === k.id} onClick={() => set({ kind: k.id, view: k.id === "prefab" || k.id === "theme" ? null : view, tag: null })}><Column size={18} />{k.label}</button>)}
      </div>
      <div className="grid library-grid" style={{ marginTop: 16 }}>
        <aside className="panel stack" aria-label="Filters" style={{ alignSelf: "start" }}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); set({ q: text }); }}>
            <label className="field">Search<input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "describe" ? "Describe what you need" : "Title, tag or author"} /></label>
            <div className="row"><button type="button" className="chip" aria-pressed={mode === "keyword"} onClick={() => set({ mode: null })}>Keyword</button><button type="button" className="chip" aria-pressed={mode === "describe"} onClick={() => set({ mode: "describe" })}>Describe it</button></div>
            <button className="btn sm" type="submit">Search</button>
          </form>
          <div><p className="eyebrow">Sort</p><div className="row">{[["trending", "Trending"], ["forks", "Most forked"], ["new", "Newest"]].map(([id, l]) => <button key={id} className="chip" aria-pressed={sort === id} onClick={() => set({ sort: id })}>{l}</button>)}</div></div>
          {kind === "mechanic" ? <div><p className="eyebrow">Fit</p><div className="row"><button className="chip" aria-pressed={fitsOnly} onClick={() => set({ fits: fitsOnly ? null : "1", similar: null })}>Fits next week&apos;s level</button></div></div> : null}
          <form className="stack" onSubmit={(e) => { e.preventDefault(); set({ author: creator.trim().replace(/^@/, "") || null, similar: null }); }}>
            <label className="field">By creator<input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="handle, for example rhea" /></label>
          </form>
          {kind === "mechanic" ? <div><p className="eyebrow">License</p><div className="row">{[["", "Any"], ["free", "Free to fork"], ["paid", "Paid"]].map(([id, l]) => <button key={id} className="chip" aria-pressed={license === id} onClick={() => set({ license: id || null })}>{l}</button>)}</div></div> : null}
          <label className="field">{graphs ? "Forked at least" : "Used at least"}<select className="input" value={String(usedMin)} onChange={(e) => set({ used: e.target.value === "0" ? null : e.target.value })}>{[0, 1, 2, 5].map((n) => <option key={n} value={n}>{n} times</option>)}</select></label>
          {tags.length ? <div><p className="eyebrow">Tags</p><div className="row">{tags.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => set({ tag: tag === t ? null : t })}>#{t}</button>)}</div></div> : null}
        </aside>
        <section className="stack" aria-label="Results">
          {similar ? <div className="row"><span className="chip">Similar to the selected game</span><button className="chip" onClick={() => set({ similar: null })}>Clear</button></div> : null}
          {graphs ? <div className="row">{(["cards", "list", "chart"] as const).map((v) => <button key={v} className="chip" aria-pressed={view === v} onClick={() => set({ view: v === "cards" ? null : v })}>{v === "cards" ? "Cards" : v === "list" ? "List" : "Chart"}</button>)}</div> : null}
          <StatusLine>{loading ? "" : `${shown.length} item${shown.length === 1 ? "" : "s"}`}</StatusLine>
          {loading && !data ? <div className="cards">{[0, 1, 2].map((i) => <SkeletonPanel key={i} height={120} />)}</div> : null}
          {error ? <ErrorPanel message="Couldn't reach the server. Retrying may help." onRetry={reload} /> : null}
          {data && !shown.length ? <EmptyState>{graphs ? <>No mechanics match. Clear a filter or start one in the <Link href="/build">editor</Link>.</> : <>The hall is quiet. Add the first {kind} from the editor.</>}</EmptyState> : null}
          {data && shown.length && graphs && view === "cards" ? <div className="cards">{(shown as CardGraph[]).map((g) => <MechanicCard key={g._id} g={g} />)}</div> : null}
          {data && shown.length && graphs && view === "list" ? <MechanicTable items={shown as CardGraph[]} /> : null}
          {data && shown.length && graphs && view === "chart" ? (
            <div className="stack">
              <SeaChart docs={shown as CardGraph[]} height={520} label="Library lineage chart" />
              <details><summary className="small">Text version</summary><LineageList docs={shown as CardGraph[]} /></details>
            </div>
          ) : null}
          {data && shown.length && !graphs ? <div className="cards">{(shown as PublicAsset[]).map((a) => <AssetCard key={a._id} a={a} />)}</div> : null}
        </section>
      </div>
    </div>
  );
}
