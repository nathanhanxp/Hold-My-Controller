"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Ship, Beacon } from "./glyphs";
import { useIdentity } from "./identity";
import { ago, api, SOL_PER_TOKEN, useFetch } from "@/lib/client";
import { authorColor } from "@/lib/colors";
import { Modal } from "./ui";

const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), { ssr: false });

export const NAV = [
  { href: "/", label: "Discover" },
  { href: "/build", label: "Editor" },
  { href: "/library", label: "Library" },
  { href: "/community", label: "Community" },
  { href: "/status", label: "Status" },
] as const;

type Health = { mode: "live" | "mock"; store: string; rpc: boolean; gemini: boolean; message: string };

export function ModeBadge() {
  const { data, error } = useFetch<Health>("/api/health", 15_000);
  const ok = data && !error && (data.mode === "mock" || data.rpc);
  const text = error ? "Couldn't reach the server. Retrying." : data ? data.message : "Checking";
  return (
    <Link href="/status" className="statusline" style={{ textDecoration: "none" }} aria-live="polite">
      <span style={{ color: ok ? "var(--olive)" : "var(--clay)" }}><Beacon size={16} lit={!!ok} /></span>
      <span>{text}</span>
    </Link>
  );
}

export function HandleButton() {
  const { handle, setHandle, ready } = useIdentity();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const wallet = useWallet();
  useEffect(() => { if (open) setValue(handle ?? ""); }, [open, handle]);
  if (!ready) return <span className="chip">...</span>;
  const save = async (link: boolean) => {
    const h = value.trim().toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(h)) { setMsg("Use 1 to 24 lowercase letters, digits or underscores."); return; }
    try {
      let pubkey: string | undefined;
      let signature: string | undefined;
      if (link && wallet.publicKey) {
        pubkey = wallet.publicKey.toBase58();
        if (wallet.signMessage) {
          const sig = await wallet.signMessage(new TextEncoder().encode(`Hold My Controller devnet: link wallet ${pubkey} to @${h}`));
          signature = bs58.encode(sig);
        }
      }
      const r = await api<{ simulated: boolean }>("/api/users", { method: "POST", json: { handle: h, pubkey, signature } });
      setHandle(h);
      setMsg(link && pubkey ? (r.simulated ? "Saved. Wallet linked without a signature (mock mode)." : "Saved and wallet linked.") : "Saved.");
      setTimeout(() => setOpen(false), 600);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      <button className="chip" style={{ minHeight: 40 }} onClick={() => setOpen(true)}>
        {handle ? (<><span className="author-dot" style={{ background: authorColor(handle) }} aria-hidden="true" />@{handle}</>) : "Pick a handle"}
      </button>
      {open ? (
        <Modal title="Your handle" onClose={() => setOpen(false)}>
          <div className="stack">

            <label className="field">Handle<input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="for example ana" autoFocus /></label>
            <div className="row">
              <button className="btn" onClick={() => save(false)}>Save handle</button>
              <button className="btn ghost" onClick={() => save(true)} disabled={!wallet.publicKey}>Save and link wallet</button>
              {!wallet.publicKey ? <span className="small muted">Connect a wallet to link it.</span> : null}
            </div>
            <p className="small" role="status" aria-live="polite">{msg}</p>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** Floating glass pill: a highlight slides to the hovered link and settles on the current page; the divider bends into a wave on hover. */
function NavPill({ current }: { current: (href: string) => boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [glow, setGlow] = useState<{ left: number; width: number; on: boolean }>({ left: 0, width: 0, on: false });
  const [hover, setHover] = useState(false);
  const place = useCallback((el: HTMLElement | null) => {
    if (!el || !ref.current) { setGlow((g) => ({ ...g, on: false })); return; }
    const p = ref.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setGlow({ left: r.left - p.left, width: r.width, on: true });
  }, []);
  const settle = useCallback(() => place(ref.current?.querySelector<HTMLElement>('a[aria-current="page"]') ?? null), [place]);
  const path = usePathname();
  useEffect(() => { const t = setTimeout(settle, 60); window.addEventListener("resize", settle); return () => { clearTimeout(t); window.removeEventListener("resize", settle); }; }, [settle, path]);
  const links = NAV.map((n) => (
    <Link key={n.href} href={n.href} aria-current={current(n.href) ? "page" : undefined} onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>{n.label}</Link>
  ));
  return (
    <nav ref={ref} className="nav-pill" aria-label="Main" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); settle(); }}>
      <span className="nav-glow" aria-hidden="true" style={{ left: glow.left, width: glow.width, opacity: glow.on ? 1 : 0 }} />
      {links.slice(0, 3)}
      <svg className="nav-wave" viewBox="0 0 34 12" aria-hidden="true">
        <path d={hover ? "M1 6 C 6 0, 11 0, 17 6 S 28 12, 33 6" : "M1 6 C 6 6, 11 6, 17 6 S 28 6, 33 6"} fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      {links.slice(3)}
    </nav>
  );
}

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className={`topbar${scrolled ? " scrolled" : ""}`}>
      <div className="wrap topbar-inner">
        <Link href="/" className="brand" aria-label="Hold My Controller home">
          <Ship size={24} />
          Hold My Controller
        </Link>
        <NavPill current={current} />
        <form className="topbar-search" role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/?q=${encodeURIComponent(q)}`); }}>
          <label className="sr-only" htmlFor="top-q">Search mechanics</label>
          <input id="top-q" className="input" placeholder="Search mechanics" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="topbar-right">
          <TokenPill />
          <HandleButton />
          {mounted ? <WalletButton /> : <span className="btn quiet" aria-hidden="true">Wallet</span>}
        </div>
      </div>
    </div>
  );
}


type Account = { tokens: number; earnedTokens: number; spentTokens: number; voteTokens: number; votes: { ballots: number; wins: number }; grantTokens: number; plan: { tier: "standard" | "pro" | "max"; until: number | null; label: string; model: string }; plans: Record<"standard" | "pro" | "max", { label: string; tokens: number; model: string; detail: string }> };

/** The wallet button without the address: "Wallet connected" once one is, the usual labels before. */
function WalletButton() {
  const { publicKey } = useWallet();
  return <WalletMultiButton>{publicKey ? "Wallet connected" : undefined}</WalletMultiButton>;
}

/** Token balance, top right. Opens the AI plans: spend tokens on a stronger model for a week. */
export function TokenPill() {
  const { handle } = useIdentity();
  const { data, reload } = useFetch<Account>(handle ? `/api/users/${handle}/tokens` : null, 30_000);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const history = useFetch<{ items: Array<{ at: number; tokens: number; what: string }> }>(handle && open ? `/api/users/${handle}/history` : null);
  const games = useFetch<{ items: Array<{ id: string; title: string; bps: number; creators: number; priceTokens: number }> }>(handle && open ? `/api/users/${handle}/demo-payout` : null);
  const [pick, setPick] = useState("");
  const demoPaid = async () => {
    setMsg("");
    try {
      const r = await api<{ title: string; license: { priceLamports: number; split: Array<{ handle: string; lamports: number }> } }>(`/api/users/${handle}/demo-payout`, { method: "POST", json: { graphId: pick || games.data?.items[0]?.id } });
      const me = r.license.split.find((x) => x.handle === handle);
      setMsg(`Demo: someone licensed ${r.title} for ${Math.round(r.license.priceLamports / 1e6)} tokens. ${r.license.split.length} creator${r.license.split.length === 1 ? "" : "s"} paid${me ? `, you got ${Math.round(me.lamports / 1e4) / 100}` : ""}.`);
      reload(); history.reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  useEffect(() => {
    const r = () => { reload(); history.reload(); };
    window.addEventListener("forklab:tokens", r);
    return () => window.removeEventListener("forklab:tokens", r);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, history.reload]);
  if (!handle || !data) return null;
  const buy = async (tier: "pro" | "max") => {
    setMsg("");
    try { await api(`/api/users/${handle}/plan`, { method: "POST", json: { tier } }); reload(); setMsg(`${data.plans[tier].label} is on for 7 days.`); } catch (e) { setMsg((e as Error).message); }
  };
  const days = data.plan.until ? Math.max(1, Math.ceil((data.plan.until - Date.now()) / 86_400_000)) : 0;
  return (
    <>
      <button className="token-pill" onClick={() => setOpen(true)} aria-label={`${data.tokens} tokens, ${data.plan.label} plan`}>
        <span className="token-coin" aria-hidden="true" />
        <strong>{data.tokens.toLocaleString("en-US")}</strong>
        <span className="token-unit">tokens</span>
        {data.plan.tier !== "standard" ? <span className="token-plan">{data.plan.label}</span> : null}
      </button>
      {open ? (
        <Modal title="Tokens" onClose={() => setOpen(false)}>
          <div className="stack">
            <dl className="token-facts">
              <div><dt>Balance</dt><dd>{data.tokens.toLocaleString("en-US")}</dd></div>
              <div><dt>Earned</dt><dd>{data.earnedTokens.toLocaleString("en-US")}</dd></div>
              <div><dt>Spent</dt><dd>{data.spentTokens.toLocaleString("en-US")}</dd></div>
              <div><dt>Worth</dt><dd>{(data.tokens * SOL_PER_TOKEN).toFixed(6).replace(/\.?0+$/, "")} devnet SOL</dd></div>
              <div><dt>AI model</dt><dd>{data.plan.model}{days ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}</dd></div>
            </dl>
            <div className="plans">
              {(["standard", "pro", "max"] as const).map((t) => {
                const p = data.plans[t];
                const on = data.plan.tier === t;
                return (
                  <div key={t} className={`plan${on ? " on" : ""}`}>
                    <div className="plan-top"><strong>{p.label}</strong><span>{p.tokens ? `${p.tokens} tokens / week` : "Free"}</span></div>
                    <p className="plan-model">{p.model}</p>
                    <p className="plan-detail">{p.detail}</p>
                    {t === "standard" ? <span className="plan-state">{on ? "Current" : ""}</span> : <button className="btn sm" onClick={() => buy(t)} disabled={data.tokens < p.tokens}>{on ? "Add a week" : "Use for a week"}</button>}
                  </div>
                );
              })}
            </div>
            {msg ? <p className="small" role="status">{msg}</p> : null}
            <div className="token-history">
              <h3>History</h3>
              <div className="demo-pay">
                {games.data?.items.length ? (
                  <>
                    <label className="sr-only" htmlFor="demo-game">Game to get paid for</label>
                    <select id="demo-game" className="input" value={pick || games.data.items[0].id} onChange={(e) => setPick(e.target.value)}>
                      {games.data.items.map((g) => <option key={g.id} value={g.id}>{g.title} · your share {(g.bps / 100).toFixed(0)}% of {g.priceTokens} tokens</option>)}
                    </select>
                    <button className="btn sm" onClick={demoPaid} title="A seeded player licenses this game (Simulated) and every creator is paid their share">Demo: get paid</button>
                  </>
                ) : <p className="small muted">Fork a game, add a block and publish it; then a demo sale can pay you here.</p>}
              </div>
              <ul>
                {(history.data?.items ?? []).slice(0, 12).map((r, i) => (
                  <li key={i}><span className="th-what">{r.what}</span><span className="th-when">{ago(r.at)}</span><b className={r.tokens < 0 ? "minus" : "plus"}>{r.tokens > 0 ? "+" : ""}{Number.isInteger(r.tokens) ? r.tokens : r.tokens.toFixed(2)}</b></li>
                ))}
              </ul>
            </div>
            <div className="token-ways">
              <div>
                <h3>Earn</h3>
                <ul>
                  <li><span>Vote on next week's game</span><b>1 per slot</b></li>
                  <li><span>Your pick wins its slot</span><b>+1</b></li>
                  <li><span>Someone licenses a game you helped make</span><b>your share</b></li>
                  <li><span>Top 3 in the weekly game, or your blocks are in it</span><b>prize share</b></li>
                </ul>
                <p className="small muted">From votes so far: {data.voteTokens} ({data.votes.ballots} slot{data.votes.ballots === 1 ? "" : "s"} voted, {data.votes.wins} won)</p>
              </div>
              <div>
                <h3>Spend</h3>
                <ul>
                  <li><span>A stronger AI model for 7 days</span><b>150 or 400</b></li>
                  <li><span>Nominate a game for next week's ballot</span><b>20</b></li>
                  <li><span>License a paid game to fork it</span><b>its price</b></li>
                </ul>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
