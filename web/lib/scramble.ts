// Text decode effect (Active Theory style). Mutates the existing text node's value so React keeps its node,
// then restores the exact original text. Glyphs are neutral symbols, never letters from another script.
const GLYPHS = "/\\|-_=+<>#*:;.";
const running = new WeakMap<Element, number>();

export function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function scramble(el: Element, duration = 520): void {
  if (prefersReducedMotion()) return;
  if (el.childNodes.length !== 1 || el.firstChild?.nodeType !== Node.TEXT_NODE) return;
  const node = el.firstChild as Text;
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  const original = (el as HTMLElement).dataset.scrambleText ?? node.nodeValue ?? "";
  (el as HTMLElement).dataset.scrambleText = original;
  if (original.length > 60) return;
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const settled = Math.floor(p * original.length);
    let out = "";
    for (let i = 0; i < original.length; i += 1) {
      const ch = original[i];
      out += i < settled || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    node.nodeValue = out;
    if (p < 1) running.set(el, requestAnimationFrame(step));
    else {
      node.nodeValue = original;
      running.delete(el);
      delete (el as HTMLElement).dataset.scrambleText;
    }
  };
  running.set(el, requestAnimationFrame(step));
}
