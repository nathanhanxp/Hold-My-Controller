"use client";
import { useEffect, useRef } from "react";
import { safeStorage } from "@/lib/client";

/**
 * A vertical drag handle that sets a width (a CSS variable on its parent) and remembers it on this device.
 * `side` says which way is wider: "left" grows the column on the left as you drag right, "right" the reverse.
 * Double-click puts it back to the default; arrow keys nudge it.
 */
export function Splitter({ name, cssVar, min, max, initial, side = "left", label, scope }: { name: string; cssVar: string; min: number; max: number; initial: number; side?: "left" | "right"; label: string; /** element that holds the variable (a selector for closest()); defaults to the parent */ scope?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useRef(initial);
  const key = `forklab.width.${name}`;
  const set = (w: number) => {
    width.current = Math.round(Math.max(min, Math.min(max, w)));
    const host = scope ? ref.current?.closest(scope) : ref.current?.parentElement;
    (host as HTMLElement | null | undefined)?.style.setProperty(cssVar, `${width.current}px`);
    ref.current?.setAttribute("aria-valuenow", String(width.current));
  };
  useEffect(() => {
    const saved = Number(safeStorage().get(key));
    set(Number.isFinite(saved) && saved > 0 ? saved : initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = () => safeStorage().set(key, String(width.current));
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ }
    const x0 = e.clientX, w0 = width.current;
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => set(w0 + (side === "left" ? ev.clientX - x0 : x0 - ev.clientX));
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); document.body.classList.remove("resizing"); save(); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div
      ref={ref}
      className={`splitter ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={down}
      onDoubleClick={() => { set(initial); save(); }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 60 : 20;
        if (e.key === "ArrowLeft") { e.preventDefault(); set(width.current + (side === "left" ? -step : step)); save(); }
        if (e.key === "ArrowRight") { e.preventDefault(); set(width.current + (side === "left" ? step : -step)); save(); }
      }}
    />
  );
}
