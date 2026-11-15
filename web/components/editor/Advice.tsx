"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { AiEta, useAiEta } from "./ideas";
import { nodeWords } from "./words";
export { nodeWords };

export type Advice = { action: "connect" | "disconnect" | "detach"; title: string; what: string; problem?: string; affected: string[]; tone: "warn" | "info" };

/** Shows what an edit breaks, with an optional plain-English explanation from the assistant. */
export function AdvicePop({ advice, onClose }: { advice: Advice; onClose: () => void }) {
  const [text, setText] = useState("");
  const eta = useAiEta();
  useEffect(() => { setText(""); }, [advice]);
  useEffect(() => {
    if (text || eta.busy) return;
    const t = setTimeout(onClose, 14000);
    return () => clearTimeout(t);
  }, [advice, text, eta.busy, onClose]);
  const explain = async () => {
    eta.begin();
    try {
      const r = await api<{ text: string }>("/api/ai/explain", { method: "POST", json: { action: advice.action, what: advice.what, problem: advice.problem, affected: advice.affected } });
      eta.end(true);
      setText(r.text);
    } catch {
      eta.end(false);
      setText("Couldn't reach the assistant. Try again in a moment.");
    }
  };
  return (
    <div className={`advice ${advice.tone}`} role="alert">
      <div className="advice-head">
        <strong>{advice.title}</strong>
        <button className="idea-x" onClick={onClose} aria-label="Dismiss">×</button>
      </div>
      {advice.problem ? <p>{advice.problem}</p> : null}
      {advice.affected.length ? (
        <p>Stops running: {advice.affected.slice(0, 5).join(", ")}{advice.affected.length > 5 ? ` and ${advice.affected.length - 5} more` : ""}.</p>
      ) : null}
      {text ? <p className="advice-ai">{text}</p> : eta.busy ? <AiEta elapsed={eta.elapsed} estimate={Math.min(eta.estimate, 12000)} /> : (
        <button className="btn quiet sm" onClick={explain}>Explain what this does</button>
      )}
    </div>
  );
}

/** Before a connect or disconnect happens: what it will do, Accept or Deny, and an optional explanation. */
export function ChangeConfirm({ change, onAccept, onDeny }: { change: import("./changes").Change; onAccept: () => void; onDeny: () => void }) {
  const [text, setText] = useState("");
  const eta = useAiEta();
  useEffect(() => { setText(""); }, [change]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onAccept(); } if (e.key === "Escape") { e.preventDefault(); onDeny(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onAccept, onDeny]);
  const explain = async () => {
    eta.begin();
    try {
      const r = await api<{ text: string }>("/api/ai/explain", { method: "POST", json: { action: change.kind === "disconnect" ? "disconnect" : "connect", what: change.what.slice(0, 400), affected: change.stops.slice(0, 20) } });
      eta.end(true);
      setText(r.text);
    } catch {
      eta.end(false);
      setText("Couldn't reach the assistant.");
    }
  };
  return (
    <div className={`advice confirm ${change.stops.length ? "warn" : "info"}`} role="alertdialog" aria-label={change.title}>
      <div className="advice-head"><strong>{change.title}</strong></div>
      <ul className="confirm-lines">{change.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {change.starts.length ? <p className="confirm-good">Starts running: {change.starts.slice(0, 5).join(", ")}</p> : null}
      {change.stops.length ? <p className="confirm-bad">Stops running: {change.stops.slice(0, 5).join(", ")}</p> : null}
      {text ? <p className="advice-ai">{text}</p> : eta.busy ? <AiEta elapsed={eta.elapsed} estimate={Math.min(eta.estimate, 15000)} /> : null}
      <div className="confirm-actions">
        <button className="btn sm" onClick={onAccept}>Accept</button>
        <button className="btn quiet sm" onClick={onDeny}>Deny</button>
        {!text && !eta.busy ? <button className="btn ghost sm" onClick={explain}>Explain</button> : null}
      </div>
    </div>
  );
}
