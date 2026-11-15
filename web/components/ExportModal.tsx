"use client";
import { useEffect, useRef, useState } from "react";
import {
  ASSET_SCHEMA, BUILTIN_PREFABS, assetHash, exportAssetFiles, exportCSharpFiles, graphHash, param, slugify, unityProjectFiles, zipFiles, type Asset, type Graph, type PrefabDef,
} from "@forklab/engine";
import { Modal, StatusLine } from "./ui";
import { api } from "@/lib/client";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Prefab assets from the selected Spawn nodes' prefabs, or a theme asset from the graph theme. */
export function assetsFromSelection(graph: Graph, selection: string[], author: string, prefabs: Record<string, PrefabDef> = {}): Asset[] {
  const out: Asset[] = [];
  for (const n of graph.nodes.filter((x) => selection.includes(x.id) && x.type === "Spawn")) {
    const name = String(param(n, "prefab"));
    const def = prefabs[name] ?? BUILTIN_PREFABS[name];
    if (!def) continue;
    out.push({ schema: ASSET_SCHEMA, kind: "prefab", title: `${graph.title} ${def.tag}`.slice(0, 80), tags: [def.tag.replace(/[^a-z0-9-]/g, "-")].filter(Boolean), authorId: author, parent: null, license: { type: "free" }, prefab: { tag: def.tag, w: def.w, h: def.h, vx: def.vx, vy: def.vy, color: def.color } });
  }
  return out;
}

export function themeAsset(graph: Graph, author: string): Asset | null {
  if (!graph.theme) return null;
  return { schema: ASSET_SCHEMA, kind: "theme", title: `${graph.title} theme`.slice(0, 80), tags: ["theme"], authorId: author, parent: null, license: { type: "free" }, theme: graph.theme };
}

export function ExportModal({ graph, hash, selection = [], author, prefabs = {}, onClose }: { graph: Graph; hash?: string; selection?: string[]; author: string | null; prefabs?: Record<string, PrefabDef>; onClose: () => void }) {
  const assets = [...assetsFromSelection(graph, selection, author ?? "guest", prefabs), ...(themeAsset(graph, author ?? "guest") ? [themeAsset(graph, author ?? "guest")!] : [])];
  const [mode, setMode] = useState<"project" | "mechanic" | "asset" | "json">("project");
  const [status, setStatus] = useState("");
  const h = hash ?? graphHash(graph);
  const slug = slugify(graph.title);
  const csharp = exportCSharpFiles(graph, h, prefabs);
  const [busy, setBusy] = useState(false);
  const [packed, setPacked] = useState<{ done: number; total: number } | null>(null);

  // The Unity project carries every 3D model the game uses, converted in the browser. That takes a while, so it
  // starts the moment the dialog opens; by the time you press Download it's usually ready.
  const project = useRef<Promise<Blob> | null>(null);
  const packProject = () => {
    project.current ??= (async () => {
      const { unityExport } = await import("@/lib/three/unity-models");
      const { plan, files } = await unityExport(graph, (done, total) => setPacked({ done, total }));
      const proj: Record<string, string | Uint8Array> = unityProjectFiles(graph, h, prefabs, { plan });
      const root = Object.keys(proj)[0].split("/")[0];
      for (const [f, data] of Object.entries(files)) proj[`${root}/Assets/ForkLab/Resources/ForkLabModels/${f}`] = data;
      return (await zipFiles(proj, "blob")) as Blob;
    })();
    project.current.catch(() => { project.current = null; });
    return project.current;
  };
  useEffect(() => { void packProject().catch(() => undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "project") {
        setStatus("Packing models for Unity");
        download(await packProject(), `${slug}-unity-project.zip`);
      }
      else if (mode === "mechanic") download((await zipFiles(csharp, "blob")) as Blob, `${slug}-unity.zip`);
      else if (mode === "json") download(new Blob([JSON.stringify({ hash: h, graph }, null, 2)], { type: "application/json" }), `${slug}.graph.json`);
      else {
        const files: Record<string, string> = {};
        for (const a of assets) Object.assign(files, exportAssetFiles(a, assetHash(a)));
        download((await zipFiles(files, "blob")) as Blob, `${slug}-assets.zip`);
      }
      setStatus("Download started.");
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const packing = mode === "project" && packed && packed.done < packed.total;

  const saveAssets = async () => {
    if (!author) { setStatus("Pick a handle first (top bar)."); return; }
    setStatus("Publishing to the library");
    try {
      for (const a of assets) await api("/api/assets", { method: "POST", json: { asset: { ...a, authorId: author } } }).catch((e) => { if (!/already/.test((e as Error).message)) throw e; });
      setStatus(`Saved ${assets.length} item${assets.length === 1 ? "" : "s"} to the Library as free to fork.`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const options = [
    { id: "project" as const, label: "Unity project", desc: "Unzip, add the folder in Unity Hub, press Play.", files: ["Assets/", "Packages/", "ProjectSettings/", "README.txt"] },
    { id: "mechanic" as const, label: "Scripts only", desc: "C# to drop into an existing Unity project.", files: Object.keys(csharp) },
    ...(assets.length ? [{ id: "asset" as const, label: "Asset", desc: "A prefab or theme for Unity.", files: ["ForkLabAssets.cs", ...assets.map((a) => `${slugify(a.title)}.asset.json`), "Editor/ForkLabAssetImporter.cs"] }] : []),
    { id: "json" as const, label: "Game file", desc: "The game as JSON.", files: [`${slug}.graph.json`] },
  ];
  return (
    <Modal title="Export" onClose={onClose}>
      <div className="stack">
        <p className="hash">Graph {hash ? h : `${h} (draft, not published)`}</p>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Export format</legend>
          {options.map((o) => (
            <label key={o.id} className="panel tight row" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer", background: mode === o.id ? "linear-gradient(135deg, rgba(217,178,111,0.18), rgba(20,15,24,0.4))" : undefined }}>
              <input type="radio" name="export-mode" checked={mode === o.id} onChange={() => setMode(o.id)} style={{ marginTop: 5 }} />
              <span className="stack" style={{ gap: 2 }}>
                <strong>{o.label}</strong>
                <span className="small muted">{o.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button className="btn" onClick={go} disabled={busy}>{busy ? (mode === "project" && packed ? `Packing models ${packed.done} of ${packed.total}` : "Preparing") : mode === "project" ? "Download Unity project" : "Download"}</button>
          {!busy && packing ? <span className="small muted">Packing models in the background: {packed!.done} of {packed!.total}</span> : null}
          {assets.length ? <button className="btn ghost" onClick={saveAssets}>Save {selection.length ? "selection as prefab" : "theme"} to Library</button> : null}
        </div>

        <StatusLine>{status}</StatusLine>
      </div>
    </Modal>
  );
}
