"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { prefersReducedMotion, scramble } from "@/lib/scramble";

/** Run after React has hydrated the server HTML (Suspense boundaries included), so we never touch markup mid-hydration. */
function afterHydration(cb: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = () => { t = setTimeout(cb, 350); };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => { if (t) clearTimeout(t); window.removeEventListener("load", run); };
}

const REVEAL = ".panel, .card, .stats, .page-header, section > h2, .cards > *, table.data tbody tr, .frieze, .notice, .stage, .seachart";
const SCRAMBLE_HOVER = ".nav-pill a, .btn, .chip, .tabs button, .tabs a, .eyebrow, .hero .lookfor a";

/**
 * One controller for the site-wide motion so every page gets it without per-component wiring:
 * scroll reveals (blur and rise, staggered), 3D tilt with glare on cards, cursor spotlight on buttons,
 * label scramble on hover, a glitch on page titles and a light veil sweep on navigation.
 */
export function MotionController() {
  const path = usePathname();
  const veil = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // reveals
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver((entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.setProperty("--rv-delay", `${Math.min(i++ * 70, 420)}ms`);
        el.classList.add("in");
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    const seen = new WeakSet<Element>();
    const scan = (root: ParentNode, skipVisible: boolean) => {
      root.querySelectorAll(REVEAL).forEach((el) => {
        if (seen.has(el) || el.closest(".modal, .topbar, .react-flow, [data-norv]")) return;
        seen.add(el);
        // already on screen at first load: leave it (the page entrance animates it) to avoid a flash
        if (skipVisible && el.getBoundingClientRect().top < window.innerHeight) return;
        el.classList.add("rv");
        io.observe(el);
      });
    };
    const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { scan(n as Element, false); if ((n as Element).matches?.(REVEAL)) scan((n as Element).parentElement ?? document, false); } }); });
    const cancel = afterHydration(() => {
      scan(document, true);
      mo.observe(document.body, { childList: true, subtree: true });
    });
    return () => { cancel(); io.disconnect(); mo.disconnect(); };
  }, []);

  // tilt + glare on cards, spotlight on buttons, scramble on hover
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    let active: HTMLElement | null = null;
    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const t = e.target as HTMLElement;
      // no tilt or scramble on hover: they read as blur
      const btn = t.closest?.(".btn") as HTMLElement | null;
      if (btn) {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--mx", `${e.clientX - r.left}px`);
        btn.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
    };
    const move = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(apply); };
    const over = (e: PointerEvent) => {
      void e;
    };
    const leave = () => { if (active) { active.style.setProperty("--rx", "0deg"); active.style.setProperty("--ry", "0deg"); active.classList.remove("tilting"); active = null; } };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); document.removeEventListener("pointerover", over); document.removeEventListener("pointerleave", leave); };
  }, []);

  // on each route: veil sweep, glitch the page title, decode eyebrows
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!first.current && veil.current) {
      veil.current.classList.remove("go");
      void veil.current.offsetWidth;
      veil.current.classList.add("go");
    }
    first.current = false;
  }, [path]);

  return <div ref={veil} className="veil" aria-hidden="true" />;
}
