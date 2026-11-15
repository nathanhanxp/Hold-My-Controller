"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type ApiErr = { code: string; message: string; attempts?: unknown };
export class FetchError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly body?: unknown) { super(message); }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  } catch {
    throw new FetchError("NETWORK", "Couldn't reach the server. Retrying may help.", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const e = (body as { error?: ApiErr })?.error;
    throw new FetchError(e?.code ?? `HTTP_${res.status}`, e?.message ?? "Something went wrong.", res.status, body);
  }
  return body as T;
}

/** Fetch with loading, error and retry. Optional polling interval. */
export function useFetch<T>(url: string | null, pollMs?: number) {
  // data is tagged with the url it came from, so a page never renders one tab's results as another's
  const [box, setBox] = useState<{ url: string | null; data: T | null }>({ url: null, data: null });
  const data = box.url === url ? box.data : null;
  const setData = useCallback((d: T | null) => setBox({ url, data: d }), [url]);
  const [error, setError] = useState<FetchError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const tick = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!url) return;
    const my = ++tick.current;
    if (!quiet) setLoading(true);
    try {
      const d = await api<T>(url);
      if (my === tick.current) { setBox({ url, data: d }); setError(null); }
    } catch (e) {
      if (my === tick.current) setError(e as FetchError);
    } finally {
      if (my === tick.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setError(null);
    void load();
    if (!pollMs) return;
    const t = setInterval(() => void load(true), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { data, error, loading, reload: () => load(), setData };
}

export function safeStorage() {
  return {
    get(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k: string) { try { window.localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };
}

/** Prices show as tokens. Amounts are stored as 1,000,000 units per token; on devnet a token is worth 0.000001 SOL. */
export const TOKEN_LAMPORTS = 1_000_000;
export const SOL_PER_TOKEN = 0.000001;
export const tokenAmount = (lamports: number) => { const t = lamports / TOKEN_LAMPORTS; return Number.isInteger(t) ? t.toLocaleString("en-US") : t.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); };
export const sol = (lamports: number) => `${tokenAmount(lamports)} tokens`;
export const short = (h?: string, n = 8) => (h ? `${h.slice(0, n)}...` : "");
export const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
export function countdown(to: number) {
  const ms = to - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
