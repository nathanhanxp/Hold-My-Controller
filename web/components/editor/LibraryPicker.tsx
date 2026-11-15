"use client";
import { useState } from "react";
import type { Graph, PrefabDef, Theme } from "@forklab/engine";
import { Modal, StatusLine } from "../ui";
import { api, useFetch } from "@/lib/client";
import type { CardGraph, PublicAsset } from "@/lib/serialize";
import type { SourceGame, PrefabPick } from "./combine";

type Tab = "games" | "things" | "looks";

/**
 * Pick several free games, things and a look from the library to add to the game you're editing. Free games only:
 * their creators stay credited on the blocks you borrow, and are paid for them when your game is licensed.
 */
export function LibraryPicker({ onClose, onAdd, exclude }: { onClose: () => void; onAdd: (games: SourceGame[], prefabs: PrefabPick[], theme: Theme | null) => void; exclude?: string | null }) {
  const [tab, setTab] = useState<Tab>("games");
  const [q, setQ] = useState("");
  const [games, setGames] = useState<Map<string, CardGraph>>(new Map());
  const [things, setThings] = useState<Map<string, PublicAsset>>(new Map());
  const [look, setLook] = useState<PublicAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const enc = encodeURIComponent(q.trim());
  const list = useFetch<{ items: CardGraph[] }>(tab === "games" ? `/api/library?kind=mechanic&license=free&sort=trending${enc ? `&q=${enc}` : ""}` : null);
  const assets = useFetch<{ items: PublicAsset[] }>(tab !== "games" ? `/api/assets?kind=${tab === "things" ? "prefab" : "theme"}${enc ? `&q=${enc}` : ""}` : null);
  const count = games.size + things.size + (look ? 1 : 0);

  const toggle = <T,>(m: Map<string, T>, set: (m: Map<string, T>) => void, id: string, v: T) => { const n = new Map(m); if (n.has(id)) n.delete(id); else n.set(id, v); set(n); };

  const add = async () => {
    setBusy(true); setMsg("");
    try {
      const full = await Promise.all([...games.keys()].map(async (id) => {
        const r = await api<{ mechanic: { graph: Graph; title: string } }>(`/api/mechanics/${id}`);
        return { hash: id, title: r.mechanic.title, graph: r.mechanic.graph } satisfies SourceGame;
      }));
      const prefabs: PrefabPick[] = [...things.values()].filter((a) => a.asset.prefab).map((a) => ({ title: a.title, prefab: { d: a.asset.prefab!.w, ...a.asset.prefab! } as PrefabDef }));
      onAdd(full, prefabs, look?.asset.theme ?? null);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add from the library" onClose={onClose}>
      <div className="stack lp">
        <div className="seg" role="tablist" aria-label="What to add">
          {(["games", "things", "looks"] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "games" ? "Games" : t === "things" ? "Things" : "Looks"}</button>)}
        </div>
        <label className="sr-only" htmlFor="lp-q">Search</label>
        <input id="lp-q" className="input" placeholder={tab === "games" ? "Search free games" : tab === "things" ? "Search things (prefabs)" : "Search looks (themes)"} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="lp-list">
          {tab === "games" ? (list.data?.items ?? []).filter((g) => g._id !== exclude).map((g) => (
            <li key={g._id}>
              <label className={games.has(g._id) ? "on" : ""}>
                <input type="checkbox" checked={games.has(g._id)} onChange={() => toggle(games, setGames, g._id, g)} />
                <span className="lp-title">{g.title}</span>
                <span className="lp-meta">{g.shares.length > 1 ? `${g.shares.length} creators` : `@${g.authorId}`} · {g.stats.plays} plays</span>
              </label>
            </li>
          )) : (assets.data?.items ?? []).map((a) => (
            <li key={a._id}>
              <label className={(tab === "things" ? things.has(a._id) : look?._id === a._id) ? "on" : ""}>
                <input type={tab === "things" ? "checkbox" : "radio"} name="lp-look" checked={tab === "things" ? things.has(a._id) : look?._id === a._id} onChange={() => (tab === "things" ? toggle(things, setThings, a._id, a) : setLook(look?._id === a._id ? null : a))} />
                {a.asset.theme ? <span className="lp-swatch" aria-hidden="true">{[a.asset.theme.sky, a.asset.theme.ground, a.asset.theme.accent].map((c) => <span key={c} style={{ background: c }} />)}</span> : a.asset.prefab ? <span className="lp-swatch" aria-hidden="true"><span style={{ background: a.asset.prefab.color }} /></span> : null}
                <span className="lp-title">{a.title}</span>
                <span className="lp-meta">@{a.authorId}</span>
              </label>
            </li>
          ))}
          {tab === "games" && list.data && !list.data.items.length ? <li className="small muted">No free games match.</li> : null}
          {tab !== "games" && assets.data && !assets.data.items.length ? <li className="small muted">Nothing matches.</li> : null}
        </ul>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted">{count ? `${games.size} game${games.size === 1 ? "" : "s"}, ${things.size} thing${things.size === 1 ? "" : "s"}${look ? ", 1 look" : ""}` : "Pick as many as you like"}</span>
          <button className="btn" onClick={add} disabled={!count || busy}>{busy ? "Adding" : "Add to my game"}</button>
        </div>
        <StatusLine tone="warn">{msg}</StatusLine>
      </div>
    </Modal>
  );
}
