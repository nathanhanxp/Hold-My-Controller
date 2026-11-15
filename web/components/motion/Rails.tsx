"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV } from "../TopBar";

/** Editorial chrome: faint grid columns, a left rail naming the section, a right rail showing scroll progress. */
export function Rails() {
  const path = usePathname();
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [path]);
  if (path.startsWith("/build")) return null;
  const i = NAV.findIndex((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  const label = i >= 0 ? NAV[i].label : path.startsWith("/m/") ? "Game" : path.startsWith("/u/") ? "Creator" : "Hold My Controller";
  return (
    <div className="rails" aria-hidden="true">
      <div className="rail-grid">{Array.from({ length: 6 }, (_, k) => <span key={k} />)}</div>
      <div className="rail-left"><span className="rail-num">{String(Math.max(0, i) + 1).padStart(2, "0")}</span><span className="rail-line" /><span className="rail-label">{label}</span></div>
      <div className="rail-right"><span className="rail-pct">{String(Math.round(p * 100)).padStart(3, "0")}</span><span className="rail-track"><span style={{ transform: `scaleY(${p})` }} /></span></div>
    </div>
  );
}
