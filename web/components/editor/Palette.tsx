"use client";
import { useMemo, useRef, useState } from "react";
import { CATALOG, NODE_TYPES, type NodeType } from "@forklab/engine";

/** Searchable node palette. Drag onto the canvas, or focus an item and press Enter to add at the center. Arrow keys move. */
export function Palette({ onAdd }: { onAdd: (t: NodeType) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => NODE_TYPES.filter((t) => !q || `${t} ${CATALOG[t].label} ${CATALOG[t].help}`.toLowerCase().includes(q.toLowerCase())), [q]);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const groups = ["Events", "Actions", "Logic", "Values"] as const;
  let idx = -1;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="sr-only" htmlFor="pal-q">Search nodes</label>
      <input id="pal-q" className="input" placeholder="Search nodes" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => {
        const items = list.filter((t) => CATALOG[t].group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <p className="eyebrow" style={{ margin: "6px 0 4px" }}>{g}</p>
            {items.map((t) => {
              idx += 1;
              const my = idx;
              return (
                <button
                  key={t}
                  ref={(el) => { refs.current[my] = el; }}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/forklab-node", t)}
                  onClick={() => onAdd(t)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); refs.current[my + 1]?.focus(); }
                    if (e.key === "ArrowUp") { e.preventDefault(); refs.current[my - 1]?.focus(); }
                  }}
                  title={CATALOG[t].help}
                >
                  <span className="author-dot" style={{ background: g === "Events" ? "var(--figure)" : g === "Values" ? "var(--vase)" : g === "Logic" ? "var(--aegean)" : "var(--olive)" }} aria-hidden="true" />
                  {CATALOG[t].label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
