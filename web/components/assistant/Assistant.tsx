"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { emptyGraph, type Graph, type Theme } from "@forklab/engine";
import { AIPanel, type Proposal } from "../editor/AIPanel";
import { useIdentity } from "../identity";
import { safeStorage } from "@/lib/client";

/** What the editor hands the assistant while it is open, so proposals apply to the live graph. */
export type EditorBridge = {
  graph: Graph;
  editor: string;
  proposal: Proposal | null;
  onProposal: (p: Proposal) => void;
  onApply: () => void;
  onDiscard: () => void;
  onTheme: (t: Theme, source: string) => void;
  onTemplate: (name: string) => void;
};

type Ctx = { bridge: EditorBridge | null; register: (b: EditorBridge | null) => void; open: boolean; setOpen: (v: boolean) => void };
const AssistantCtx = createContext<Ctx>({ bridge: null, register: () => undefined, open: false, setOpen: () => undefined });
export const useAssistant = () => useContext(AssistantCtx);
export const PENDING_KEY = "forklab.pendingProposal";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [bridge, setBridge] = useState<EditorBridge | null>(null);
  const [open, setOpen] = useState(false);
  const register = useCallback((b: EditorBridge | null) => setBridge(b), []);
  return <AssistantCtx.Provider value={{ bridge, register, open, setOpen }}>{children}<AssistantOrb /></AssistantCtx.Provider>;
}

/** Athena's owl as a line drawing, used for the assistant orb. */
function Owl({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6 L11 10 M24 6 L21 10" />
      <path d="M7 14 C7 8, 25 8, 25 14 L25 21 C25 26, 7 26, 7 21 Z" />
      <circle cx="12" cy="15" r="3.2" /><circle cx="20" cy="15" r="3.2" />
      <circle cx="12" cy="15" r="1" fill="currentColor" /><circle cx="20" cy="15" r="1" fill="currentColor" />
      <path d="M16 17 L15 19.5 L17 19.5 Z" fill="currentColor" />
      <path d="M11 23 C13 22, 19 22, 21 23" />
    </svg>
  );
}

const POS_KEY = "forklab.orbPos";
const PANEL_KEY = "forklab.panelPos";
const ORB = 64;
const PANEL_W = 400;

type XY = { x: number; y: number };
const clampTo = (p: XY, w: number, h: number): XY => ({ x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8) });
function readPos(key: string): XY | null {
  try { const raw = safeStorage().get(key); return raw ? (JSON.parse(raw) as XY) : null; } catch { return null; }
}

/** Pointer drag with a click threshold; returns handlers for the dragged element. */
function useDraggable(pos: XY | null, setPos: (p: XY) => void, size: () => { w: number; h: number }, storeKey: string, onClick?: () => void) {
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (!pos || (e.target as HTMLElement).closest("textarea, input, button:not([data-drag-handle])")) return;
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) { d.moved = true; setDragging(true); }
        if (d.moved) { const { w, h } = size(); setPos(clampTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, w, h)); }
      },
      onPointerUp: (e: React.PointerEvent) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (d?.moved) safeStorage().set(storeKey, JSON.stringify({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
        else if (d) onClick?.();
      },
    },
  };
}

/**
 * Floating assistant. The owl and the chat box are both draggable and remember where you left them.
 * In the editor it proposes changes to the live graph; elsewhere it drafts a game and opens it in the editor.
 */
function AssistantOrb() {
  const { bridge, open, setOpen } = useAssistant();
  const { handle } = useIdentity();
  const router = useRouter();
  const path = usePathname();
  const [orb, setOrb] = useState<XY | null>(null);
  const [panel, setPanel] = useState<XY | null>(null);
  const [fallbackProposal, setFallbackProposal] = useState<Proposal | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const o = readPos(POS_KEY) ?? { x: window.innerWidth - ORB - 28, y: window.innerHeight - ORB - 28 };
    setOrb(clampTo(o, ORB, ORB));
    const onResize = () => setOrb((p) => (p ? clampTo(p, ORB, ORB) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!open || !orb) return;
    const saved = readPos(PANEL_KEY);
    const w = Math.min(PANEL_W, window.innerWidth - 16);
    const guess = { x: orb.x + ORB / 2 > window.innerWidth / 2 ? orb.x - w - 14 : orb.x + ORB + 14, y: orb.y - 220 };
    setPanel(clampTo(saved ?? guess, w, 300));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [setOpen]);

  const orbDrag = useDraggable(orb, setOrb, () => ({ w: ORB, h: ORB }), POS_KEY, () => setOpen(!open));
  const panelDrag = useDraggable(panel, setPanel, () => ({ w: panelRef.current?.offsetWidth ?? PANEL_W, h: panelRef.current?.offsetHeight ?? 300 }), PANEL_KEY);
  if (!orb) return null;
  const editing = !!bridge && path.startsWith("/build");

  const genericProps = {
    graph: emptyGraph(handle ?? "guest"),
    editor: handle ?? "guest",
    proposal: fallbackProposal,
    onProposal: (p: Proposal) => setFallbackProposal(p),
    onApply: () => {
      if (!fallbackProposal) return;
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(fallbackProposal)); } catch { /* storage unavailable */ }
      setFallbackProposal(null);
      setOpen(false);
      router.push("/build?proposal=1");
    },
    onDiscard: () => setFallbackProposal(null),
    onTheme: () => undefined,
  };

  return (
    <>
      <button
        type="button"
        className={`orb${open ? " open" : ""}${orbDrag.dragging ? " dragging" : ""}`}
        style={{ left: orb.x, top: orb.y }}
        {...orbDrag.handlers}
        data-drag-handle
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? "Close the assistant" : "Open the assistant"}
      >
        <span className="orb-ring" aria-hidden="true" />
        <Owl />
      </button>
      {open && panel ? (
        <div ref={panelRef} id="assistant-panel" role="dialog" aria-label="Assistant" className={`assistant-pop${panelDrag.dragging ? " dragging" : ""}`} style={{ left: panel.x, top: panel.y, width: Math.min(PANEL_W, typeof window === "undefined" ? PANEL_W : window.innerWidth - 16), maxHeight: `max(260px, calc(100vh - ${Math.max(0, panel.y) + 16}px))` }} {...panelDrag.handlers}>
          <div className="assistant-grip" aria-hidden="true"><span /></div>
          <button className="assistant-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          {editing && bridge ? <AIPanel {...bridge} /> : <AIPanel {...genericProps} />}
        </div>
      ) : null}
    </>
  );
}
