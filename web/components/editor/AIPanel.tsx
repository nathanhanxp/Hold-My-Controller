"use client";
import { useRef, useState } from "react";
import type { Graph, Theme } from "@forklab/engine";
import { api, FetchError } from "@/lib/client";
import { AiEta, useAiEta } from "./ideas";
import { looksLikeQuestion } from "@/lib/ai/question";

export type Proposal = { graph: Graph; grafts: Array<{ graph: string; title: string; author: string; nodes: string[] }>; explanation: string; provider: string; badge: string; attempts: Array<{ provider: string; outcome: string; ms: number }> };

/** Local palette extractor (k-means over pixels), used when no AI provider can read the image. */
export async function localTheme(file: File): Promise<Theme> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    const px: number[][] = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    let cents = [px[0], px[Math.floor(px.length / 2)], px[px.length - 1]];
    for (let it = 0; it < 8; it += 1) {
      const sums = cents.map(() => [0, 0, 0, 0]);
      for (const p of px) {
        let best = 0, bd = Infinity;
        cents.forEach((c2, k) => { const dd = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
        sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3] += 1;
      }
      cents = sums.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[k]));
    }
    const lum = (c2: number[]) => 0.2126 * c2[0] + 0.7152 * c2[1] + 0.0722 * c2[2];
    const sorted = [...cents].sort((a, b) => lum(a) - lum(b));
    const hex = (c2: number[]) => `#${c2.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    return { sky: hex(sorted[0]), ground: hex(sorted[2]), accent: hex(sorted[1]) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToB64(f: File): Promise<{ mime: string; base64: string }> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
  return { mime: f.type, base64: btoa(s) };
}

/** The assistant: one text box, an image button and a send button. Proposals show as Apply or Discard. */
export function AIPanel({ graph, editor, proposal, onProposal, onApply, onDiscard, onTheme }: {
  graph: Graph; editor: string; proposal: Proposal | null;
  onProposal: (p: Proposal) => void; onApply: () => void; onDiscard: () => void; onTheme: (t: Theme, source: string) => void; onTemplate?: (name: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const eta = useAiEta();
  // Change edits the game (a proposal to apply); Ask answers questions and never touches it.
  // Typing a question switches to Ask on its own until you pick a mode yourself.
  const [mode, setMode] = useState<"change" | "ask">("change");
  const [picked, setPicked] = useState(false);
  const [answer, setAnswer] = useState<{ question: string; answer: string; suggestions: Array<{ label: string; prompt: string }>; badge: string } | null>(null);
  const type = (v: string) => {
    setPrompt(v);
    if (!picked) setMode(v.trim() && looksLikeQuestion(v) ? "ask" : "change");
    if (!v.trim()) setPicked(false);
  };

  const ask = async () => {
    const question = prompt.trim();
    if (!question) return;
    setBusy(true); setError("");
    eta.begin();
    try {
      const r = await api<{ answer: string; suggestions: Array<{ label: string; prompt: string }>; badge: string }>("/api/ai/ask", { method: "POST", json: { question, editor, current: graph.nodes.length ? graph : null } });
      eta.end(true);
      setAnswer({ question, ...r });
      setPrompt(""); setPicked(false); setMode("change");
    } catch (e) {
      eta.end(false);
      const fe = e as FetchError;
      setError(fe.code === "RATE_LIMITED" ? "One moment, still working on the last request." : fe.code === "AI_UNAVAILABLE" ? "Couldn't reach the assistant. Try again." : fe.message);
    } finally {
      setBusy(false);
    }
  };

  /** A suggestion's prompt goes through the normal change path, so it comes back as a proposal to apply. */
  const change = async (text: string) => {
    setBusy(true); setError("");
    eta.begin();
    try {
      const r = await api<Proposal>("/api/ai/graph", { method: "POST", json: { prompt: text, editor, current: graph.nodes.length ? graph : null } });
      eta.end(true);
      onProposal(r);
      setAnswer(null);
    } catch (e) {
      eta.end(false);
      const fe = e as FetchError;
      setError(fe.code === "RATE_LIMITED" ? "One moment, still working on the last request." : fe.code === "AI_UNAVAILABLE" ? "Couldn't reach the assistant. Try again." : fe.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (mode === "ask" && !image) return ask();
    if (!prompt.trim() && !image) return;
    setBusy(true); setError("");
    try {
      const img = image ? await fileToB64(image) : undefined;
      if (image) {
        // the image sets the palette; it also goes to the model as inspiration
        api<{ theme: Theme }>("/api/ai/theme", { method: "POST", json: { image: img } })
          .then((r) => onTheme(r.theme, "ai"))
          .catch(async () => onTheme(await localTheme(image), "local"));
      }
      if (prompt.trim()) {
        eta.begin();
        const r = await api<Proposal>("/api/ai/graph", { method: "POST", json: { prompt, editor, current: graph.nodes.length ? graph : null, image: img } });
        eta.end(true);
        onProposal(r);
        setPrompt(""); setPicked(false); setMode("change");
      }
      setImage(null);
    } catch (e) {
      eta.end(false);
      const fe = e as FetchError;
      setError(fe.code === "RATE_LIMITED" ? "One moment, still working on the last request." : fe.code === "AI_UNAVAILABLE" ? "Couldn't reach the assistant. Try again." : fe.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai">
      {proposal ? (
        <div className="ai-proposal">
          <p className="ai-proposal-title">{proposal.graph.title}</p>
          {proposal.explanation ? <p className="ai-proposal-text">{proposal.explanation.replace(/\s*\(\d+ invalid connections? (was|were) removed\.\)/, "")}</p> : null}
          <div className="row">
            <button className="btn sm" onClick={onApply}>Apply</button>
            <button className="btn quiet sm" onClick={onDiscard}>Discard</button>
          </div>
        </div>
      ) : null}
      {answer && !proposal ? (
        <div className="ai-answer" aria-live="polite">
          <p className="ai-answer-q">{answer.question}</p>
          <p className="ai-answer-text">{answer.answer}</p>
          {answer.suggestions.length ? (
            <div className="ai-suggest">
              {answer.suggestions.map((s) => (
                <button key={s.label} className="ai-chip" onClick={() => change(s.prompt)} disabled={busy} title={s.prompt}>{s.label}</button>
              ))}
            </div>
          ) : null}
          <button className="ai-answer-x" onClick={() => setAnswer(null)} aria-label="Dismiss the answer">×</button>
        </div>
      ) : null}
      <div className="ai-mode" role="radiogroup" aria-label="Assistant mode">
        <button role="radio" aria-checked={mode === "change"} className={mode === "change" ? "on" : ""} onClick={() => { setMode("change"); setPicked(true); }}>Change</button>
        <button role="radio" aria-checked={mode === "ask"} className={mode === "ask" ? "on" : ""} onClick={() => { setMode("ask"); setPicked(true); }}>Ask</button>
      </div>
      <div className={`ai-box${busy ? " busy" : ""}`}>
        <label className="sr-only" htmlFor="ai-prompt">Message</label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={mode === "ask" ? "Ask about your game" : "Describe a game or a change"}
          rows={3}
          maxLength={2000}
          disabled={busy}
        />
        <div className="ai-actions">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          <button type="button" className="ai-icon" onClick={() => fileRef.current?.click()} aria-label={image ? `Image attached: ${image.name}` : "Attach an image"} title={image ? image.name : "Attach an image"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
            {image ? <span className="ai-dot" /> : null}
          </button>
          <button type="button" className="ai-send" onClick={send} disabled={busy || (!prompt.trim() && !image)} aria-label={mode === "ask" ? "Ask" : "Send"}>
            {busy ? <span className="ai-spin" aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
          </button>
        </div>
      </div>
      {eta.busy ? <AiEta elapsed={eta.elapsed} estimate={eta.estimate} /> : null}
      {error ? <p className="ai-error" role="alert">{error}</p> : null}
    </div>
  );
}
