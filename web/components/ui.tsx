"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { authorColor, splitColors } from "@/lib/colors";
import { sol } from "@/lib/client";
import type { FriezeVariant } from "./odyssey/Frieze";
import { WindRose } from "./odyssey/WindRose";
import { Shuttle } from "./glyphs";

export function PageHeader({ eyebrow, title, intro, frieze, children }: { eyebrow: string; title: ReactNode; intro?: ReactNode; frieze?: FriezeVariant; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", position: "relative" }}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {intro ? <div className="lede">{intro}</div> : null}
        </div>
        {children ? <div className="row">{children}</div> : null}
      </div>
      
    </header>
  );
}

export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="stats">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SkeletonPanel({ lines = 3, height }: { lines?: number; height?: number }) {
  return (
    <div className="panel stack" aria-hidden="true">
      {height ? <div className="skeleton" style={{ height }} /> : null}
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />)}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading-shuttle" role="status" aria-live="polite">
      <div className="track" aria-hidden="true"><Shuttle size={16} /></div>
      <span className="small">{label}</span>
    </div>
  );
}

export function StatusLine({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" }) {
  const color = tone === "ok" ? "var(--olive)" : tone === "warn" ? "var(--clay)" : "var(--muted)";
  return <p className="small" role="status" aria-live="polite" style={{ color, minHeight: "1.4em" }}>{children}</p>;
}

export function AuthorChip({ handle, bps, link = true }: { handle: string; bps?: number; link?: boolean }) {
  const inner = (
    <>
      <span className="author-dot" style={{ background: authorColor(handle) }} aria-hidden="true" />@{handle}
      {bps !== undefined ? <span className="muted">{(bps / 100).toFixed(bps % 100 ? 2 : 0)}%</span> : null}
    </>
  );
  return link ? <Link className="chip" href={`/u/${handle}`}>{inner}</Link> : <span className="chip">{inner}</span>;
}

export function LicenseChip({ license }: { license: { type: "free" } | { type: "paid"; priceLamports: number } }) {
  if (license.type === "free") return <span className="chip free">Free to fork</span>;
  return <span className="chip paid">{sol(license.priceLamports)}</span>;
}

/** Payout preview per author, drawn as oars: shaft plus a blade whose length is the share. */
export function SplitBars({ shares }: { shares: Array<{ handle: string; bps: number; nodeIds?: string[]; demoWallet?: boolean }> }) {
  const colors = splitColors(shares.map((s) => s.handle));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="split-strip" role="img" aria-label={shares.map((s) => `@${s.handle} ${(s.bps / 100).toFixed(0)}%`).join(", ")}>
        {shares.map((s) => <span key={s.handle} style={{ width: `${s.bps / 100}%`, background: colors.get(s.handle) }} title={`@${s.handle} ${(s.bps / 100).toFixed(2)}%`} />)}
      </div>
      {shares.map((s) => (
        <div key={s.handle} className="oar">
          <Link href={`/u/${s.handle}`} className="small split-name" style={{ fontWeight: 600 }}>
            <span className="split-dot" style={{ background: colors.get(s.handle) }} aria-hidden="true" />@{s.handle}
            {s.demoWallet ? <span className="split-demo">demo wallet</span> : null}
          </Link>
          <div className="row" style={{ gap: 0, flexWrap: "nowrap" }} aria-hidden="true">
            <div className="blade" style={{ width: `${Math.max(2, s.bps / 100)}%`, background: colors.get(s.handle), boxShadow: `0 0 12px ${colors.get(s.handle)}55` }} />
          </div>
          <span className="small" style={{ textAlign: "right", color: colors.get(s.handle), fontWeight: 700 }}>{(s.bps / 100).toFixed(s.bps % 100 ? 2 : 0)}%</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="panel muted" style={{ textAlign: "center", padding: 28 }}>{children}</div>;
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel" role="alert" style={{ background: "linear-gradient(90deg, rgba(224,122,78,0.18), rgba(12,10,18,0.4) 70%)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p>{message}</p>
        {onRetry ? <button className="btn quiet sm" onClick={onRetry}>Retry</button> : null}
      </div>
    </div>
  );
}

export function NotFoundArt({ title, message }: { title: string; message: string }) {
  return (
    <div className="wrap" style={{ padding: "64px 20px", display: "grid", placeItems: "center", textAlign: "center", gap: 18 }}>
      <WindRose size={180} legend={false} />
      <h1>{title}</h1>
      <p className="lede">{message}</p>
      <Link className="btn" href="/">Back to Discover</Link>
    </div>
  );
}

/** Dialogs render straight into <body>, so no animated or transformed ancestor can move them off screen. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; labelId?: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host ? createPortal(<ModalBody {...props} />, host) : null;
}

function ModalBody({ title, onClose, children, labelId = "modal-title" }: { title: string; onClose: () => void; children: ReactNode; labelId?: string }) {
  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 id={labelId}>{title}</h2>
          <button className="btn quiet sm" onClick={onClose} aria-label="Close dialog">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Simulated({ children = "Simulated" }: { children?: ReactNode }) {
  void children;
  return null;
}
