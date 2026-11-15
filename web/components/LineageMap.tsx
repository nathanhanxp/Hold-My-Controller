"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import type { CardGraph } from "@/lib/serialize";
import { authorColor } from "@/lib/colors";
import { WindRose } from "./odyssey/WindRose";

type TreeNode = { doc: CardGraph; children: TreeNode[] };

export function buildForest(docs: CardGraph[]): TreeNode[] {
  const byId = new Map(docs.map((d) => [d._id, { doc: d, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const n of byId.values()) {
    const p = n.doc.parentId ? byId.get(n.doc.parentId) : null;
    if (p) p.children.push(n);
    else roots.push(n);
  }
  const sort = (n: TreeNode) => { n.children.sort((a, b) => a.doc.createdAt - b.doc.createdAt); n.children.forEach(sort); };
  roots.forEach(sort);
  return roots.sort((a, b) => a.doc.createdAt - b.doc.createdAt);
}

/**
 * Sea chart: each mechanic is an island with an author-colored rim, forks are dashed routes,
 * borrowed sources are dotted routes, the current mechanic carries the ship. Pan and zoom with d3-zoom.
 */
export function SeaChart({ docs, current, sources = [], height = 440, label = "Lineage map" }: { docs: CardGraph[]; current?: string; sources?: CardGraph[]; height?: number; label?: string }) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [hover, setHover] = useState<CardGraph | null>(null);
  const layout = useMemo(() => {
    const forest = buildForest(docs);
    const fake: TreeNode = { doc: { _id: "__sea__" } as CardGraph, children: forest };
    const root = hierarchy<TreeNode>(fake, (d) => d.children);
    d3tree<TreeNode>().nodeSize([150, 190])(root);
    const nodes = root.descendants().filter((d) => d.data.doc._id !== "__sea__");
    const links = root.links().filter((l) => l.source.data.doc._id !== "__sea__");
    const pos = new Map(nodes.map((n) => [n.data.doc._id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    return { nodes, links, pos };
  }, [docs]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const z = d3zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 2.5]).on("zoom", (e) => g.attr("transform", e.transform.toString()));
    svg.call(z);
    const xs = layout.nodes.map((n) => n.x ?? 0);
    const ys = layout.nodes.map((n) => n.y ?? 0);
    const w = svgRef.current.clientWidth || 800;
    const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 0), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
    const k = Math.min(1.2, Math.max(0.35, Math.min(w / (maxX - minX + 260), height / (maxY - minY + 200))));
    svg.call(z.transform, zoomIdentity.translate(w / 2 - ((minX + maxX) / 2) * k, 70 - minY * k + (height - 140 - (maxY - minY) * k) / 2).scale(k));
    return () => { svg.on(".zoom", null); };
  }, [layout, height]);

  const island = (cx: number, cy: number) => `M${cx - 58} ${cy} C ${cx - 60} ${cy - 30}, ${cx - 20} ${cy - 34}, ${cx} ${cy - 30} C ${cx + 30} ${cy - 36}, ${cx + 64} ${cy - 22}, ${cx + 58} ${cy} C ${cx + 62} ${cy + 26}, ${cx + 20} ${cy + 32}, ${cx - 4} ${cy + 28} C ${cx - 34} ${cy + 32}, ${cx - 62} ${cy + 22}, ${cx - 58} ${cy} Z`;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <svg ref={svgRef} className="seachart" style={{ height }} role="img" aria-label={`${label}. ${docs.length} mechanics. Use the list view for a text version.`}>
        <defs>
          <pattern id="sea-waves" width="60" height="24" patternUnits="userSpaceOnUse">
            <path d="M0 12 q15 -8 30 0 t30 0" fill="none" stroke="rgba(95,195,228,0.12)" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sea-waves)" />
        <g ref={gRef}>
          {layout.links.map((l) => (
            <path key={`${l.source.data.doc._id}-${l.target.data.doc._id}`} d={`M${l.source.x} ${(l.source.y ?? 0) + 30} C ${l.source.x} ${(l.source.y! + l.target.y!) / 2}, ${l.target.x} ${(l.source.y! + l.target.y!) / 2}, ${l.target.x} ${(l.target.y ?? 0) - 30}`} fill="none" stroke="var(--figure)" strokeWidth="1.8" strokeDasharray="7 5" />
          ))}
          {current ? sources.map((s) => {
            const a = layout.pos.get(s._id);
            const b = layout.pos.get(current);
            if (!a || !b) return null;
            return <path key={`src-${s._id}`} d={`M${a.x + 50} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 60}, ${b.x - 50} ${b.y}`} fill="none" stroke="var(--clay)" strokeWidth="2.2" strokeDasharray="1 6" strokeLinecap="round" />;
          }) : null}
          {layout.nodes.map((n) => {
            const d = n.data.doc;
            const x = n.x ?? 0, y = n.y ?? 0;
            const isCur = d._id === current;
            const anchored = d.anchor?.status === "confirmed" || d.anchor?.status === "simulated";
            return (
              <g key={d._id} tabIndex={0} role="link" aria-label={`${d.title} by @${d.authorId}`} style={{ cursor: "pointer" }}
                onClick={() => router.push(`/m/${d._id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/m/${d._id}`)}
                onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d)} onBlur={() => setHover(null)}>
                <path d={island(x, y)} fill={isCur ? "rgba(95,195,228,0.14)" : "rgba(236,230,216,0.06)"} stroke={authorColor(d.authorId)} strokeWidth={isCur ? 4 : 2.5} />
                <path d={island(x, y)} fill="none" stroke="var(--figure)" strokeWidth="0.8" transform={`translate(${x} ${y}) scale(0.82) translate(${-x} ${-y})`} opacity="0.35" />
                <text x={x} y={y - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)" style={{ fontFamily: "var(--font-head)" }}>{d.title.length > 16 ? `${d.title.slice(0, 15)}...` : d.title}</text>
                <text x={x} y={y + 15} textAnchor="middle" fontSize="11" fill="var(--muted)">@{d.authorId}</text>
                {anchored ? <circle cx={x + 50} cy={y - 18} r="5" fill="var(--olive)"><title>Anchored</title></circle> : null}
                {isCur ? (
                  <g transform={`translate(${x - 18} ${y - 64})`} aria-hidden="true">
                    <path d="M4 26 h30 l-4 6 h-22 z" fill="var(--figure)" />
                    <path d="M19 26 V4 M19 6 l11 16 h-11 M19 9 l-9 13 h9" fill="none" stroke="var(--figure)" strokeWidth="2" />
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <WindRose size={120} />
        <p className="small muted" role="status" aria-live="polite" style={{ minWidth: 220 }}>
          {hover ? `${hover.title} by @${hover.authorId}: ${hover.stats.plays} plays, ${hover.stats.forks} forks, ${hover.stats.licenses} licenses.` : "Drag to pan, scroll to zoom, click an island to open it."}
        </p>
      </div>
    </div>
  );
}

export function LineageList({ docs, current }: { docs: CardGraph[]; current?: string }) {
  const forest = buildForest(docs);
  const render = (n: TreeNode): React.ReactNode => (
    <li key={n.doc._id}>
      {n.doc._id === current ? <strong>{n.doc.title} (this mechanic)</strong> : <Link href={`/m/${n.doc._id}`}>{n.doc.title}</Link>} <span className="muted small">by @{n.doc.authorId}, {n.doc.stats.forks} forks</span>
      {n.children.length ? <ul>{n.children.map(render)}</ul> : null}
    </li>
  );
  return <ul className="small" style={{ lineHeight: 1.8 }}>{forest.map(render)}</ul>;
}
