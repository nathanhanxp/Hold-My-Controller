"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Graph } from "@forklab/engine";
import { Modal, StatusLine } from "../ui";
import { api } from "@/lib/client";

export function PublishModal({ graph, author, onClose, onPublished }: { graph: Graph; author: string | null; onClose: () => void; onPublished?: (hash: string) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(graph.title);
  const [tags, setTags] = useState(graph.tags.join(", "));
  const [kind, setKind] = useState<Graph["kind"]>(graph.kind);
  const [paid, setPaid] = useState(graph.license.type === "paid");
  const [price, setPrice] = useState(graph.license.type === "paid" ? String(graph.license.priceLamports / 1e6) : "50");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const publish = async () => {
    if (!author) { setStatus("Pick a handle first (top bar). It becomes the author of your nodes."); return; }
    const lamports = Math.round(Number(price) * 1e6);
    if (paid && kind === "mechanic" && (!Number.isFinite(lamports) || lamports <= 0)) { setStatus("Enter a price above zero."); return; }
    setBusy(true); setStatus("Publishing");
    try {
      const body = {
        author,
        graph: {
          ...graph, title: title.trim() || "Untitled", kind,
          tags: tags.split(",").map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")).filter(Boolean).slice(0, 8),
          license: paid && kind === "mechanic" ? { type: "paid", priceLamports: lamports } : { type: "free" },
        },
      };
      const r = await api<{ mechanic: { _id: string } }>("/api/mechanics", { method: "POST", json: body });
      setStatus("Published. Anchoring on devnet.");
      onPublished?.(r.mechanic._id);
      router.push(`/m/${r.mechanic._id}`);
    } catch (e) {
      setStatus((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Publish" onClose={onClose}>
      <div className="stack">
        <label className="field">Title<input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">Tags <span className="hint">Comma separated, for example: dodge, one-key</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        <fieldset className="row" style={{ border: 0, padding: 0 }}>
          <legend className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Publish as</legend>
          <label className="row small"><input type="radio" checked={kind === "mechanic"} onChange={() => setKind("mechanic")} />Mechanic</label>
          <label className="row small"><input type="radio" checked={kind === "level"} onChange={() => setKind("level")} />Level (always free)</label>
        </fieldset>
        {kind === "mechanic" ? (
          <fieldset className="stack" style={{ border: 0, padding: 0 }}>
            <legend className="small" style={{ fontWeight: 600, marginBottom: 4 }}>License</legend>
            <label className="row small"><input type="radio" checked={!paid} onChange={() => setPaid(false)} />Free to fork</label>
            <label className="row small"><input type="radio" checked={paid} onChange={() => setPaid(true)} />Paid license</label>
            {paid ? <label className="field">Price in tokens<input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label> : null}
          </fieldset>
        ) : null}

        <div className="row"><button className="btn lg" onClick={publish} disabled={busy}>{busy ? "Publishing" : "Publish"}</button><button className="btn quiet" onClick={onClose}>Cancel</button></div>
        <StatusLine tone={/Published/.test(status) ? "ok" : status && !busy ? "warn" : "muted"}>{status}</StatusLine>
      </div>
    </Modal>
  );
}
