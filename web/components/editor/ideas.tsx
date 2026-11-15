"use client";
import { useEffect, useRef, useState } from "react";
import type { Graph } from "@forklab/engine";
import { api, FetchError, safeStorage } from "@/lib/client";
import type { Proposal } from "./AIPanel";

const AVG_KEY = "forklab.aiAvgMs";
const DEFAULT_MS = 20_000;

/** Estimated wait for an AI request: a running average of how long the last ones took on this device. */
export function useAiEta() {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const estimate = useRef(DEFAULT_MS);
  useEffect(() => {
    const v = Number(safeStorage().get(AVG_KEY));
    if (Number.isFinite(v) && v > 2000) estimate.current = v;
  }, []);
  useEffect(() => {
    if (start === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [start]);
  return {
    busy: start !== null,
    elapsed: start === null ? 0 : Math.max(0, now - start),
    estimate: estimate.current,
    begin() { const t = Date.now(); setStart(t); setNow(t); },
    end(ok: boolean) {
      if (start !== null && ok) {
        const took = Date.now() - start;
        estimate.current = Math.round(estimate.current * 0.6 + took * 0.4);
        safeStorage().set(AVG_KEY, String(estimate.current));
      }
      setStart(null);
    },
  };
}

/** A thin progress line with the time left, for any AI wait. */
export function AiEta({ elapsed, estimate }: { elapsed: number; estimate: number }) {
  const left = Math.ceil((estimate - elapsed) / 1000);
  const pct = Math.min(96, (elapsed / estimate) * 100);
  return (
    <div className="ai-eta" role="status" aria-live="polite">
      <div className="ai-eta-track"><div className="ai-eta-bar" style={{ width: `${pct}%` }} /></div>
      <span>{left > 0 ? `About ${left} s left` : "Almost done"}<em>{Math.floor(elapsed / 1000)} s</em></span>
    </div>
  );
}

export type Idea = { id: string; text: string; x: number; y: number };

export const newIdea = (x: number, y: number): Idea => ({ id: Math.random().toString(36).slice(2, 8), text: "", x, y });

/** Ask the assistant to add an idea to the game; the answer is a proposal the user applies or discards. */
export async function buildIdea(text: string, graph: Graph, author: string): Promise<Proposal> {
  const prompt = `Add this to the current game: ${text.trim()}\nKeep every existing node, id, param and connection unless this asks to change or remove them. Add the nodes this needs and connect them to the existing ones where they belong.`;
  return api<Proposal>("/api/ai/graph", { method: "POST", json: { prompt, editor: author, current: graph.nodes.length ? graph : null } });
}

/** The idea card: write anything, press Build. Used as a node in Nodes and a floating card in Blocks. */
export function IdeaCard({ idea, graph, author, onText, onRemove, onProposal, dragHandle }: {
  idea: Idea; graph: Graph; author: string;
  onText: (t: string) => void; onRemove: () => void; onProposal: (p: Proposal) => void;
  dragHandle?: (e: React.PointerEvent) => void;
}) {
  const eta = useAiEta();
  const [error, setError] = useState("");
  const build = async () => {
    if (!idea.text.trim() || eta.busy) return;
    setError("");
    eta.begin();
    try {
      const p = await buildIdea(idea.text, graph, author);
      eta.end(true);
      onProposal(p);
    } catch (e) {
      eta.end(false);
      const fe = e as FetchError;
      setError(fe.code === "RATE_LIMITED" ? "Busy, try again in a moment." : "Couldn't build that. Try rewording it.");
    }
  };
  return (
    <div className={`idea${eta.busy ? " busy" : ""}${dragHandle ? " movable" : ""}`} onPointerDown={(e) => { if (dragHandle && !(e.target as HTMLElement).closest("textarea, button")) dragHandle(e); }}>
      <div className="idea-head">
        <span>Idea</span>
        <button className="idea-x nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} aria-label="Remove idea">×</button>
      </div>
      <textarea
        className="nodrag nowheel"
        value={idea.text}
        placeholder="Type anything, for example: enemies that chase the player and get faster"
        onChange={(e) => onText(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void build(); }}
        rows={3}
        maxLength={600}
        disabled={eta.busy}
        autoFocus
      />
      {eta.busy ? <AiEta elapsed={eta.elapsed} estimate={eta.estimate} /> : null}
      <div className="idea-foot">
        {error ? <span className="idea-err">{error}</span> : <span className="idea-tip">Cmd or Ctrl + Enter</span>}
        <button className="btn sm nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={build} disabled={eta.busy || !idea.text.trim()}>{eta.busy ? <span className="ai-spin" aria-hidden="true" /> : null}Build</button>
      </div>
    </div>
  );
}
