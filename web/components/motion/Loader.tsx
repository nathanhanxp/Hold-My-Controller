"use client";
import { useEffect, useState } from "react";
import { Colonnade } from "./ColumnArt";

/** Portal loader with a counter, shown once per browser session. Skipped under reduced motion. */
export function Loader() {
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<"hidden" | "show" | "done">("hidden");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("forklab.intro") === "1"; } catch { /* storage unavailable */ }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setState("show");
    const start = performance.now();
    const total = 1900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total);
      setPct(Math.round(100 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        try { sessionStorage.setItem("forklab.intro", "1"); } catch { /* ignore */ }
        setTimeout(() => setState("done"), 250);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (state === "hidden") return null;
  return (
    <div className={`loader${state === "done" ? " done" : ""}`} role="status" aria-label={`Loading ${pct} percent`}>
      <Colonnade className="cols" />
      <div className="portal">
        <span className="wave" /><span className="wave w2" /><span className="wave w3" />
        <span className="disc" />
        <span className="count">/{String(pct).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
