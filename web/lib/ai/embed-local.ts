import { sha256Hex } from "@forklab/engine";

export const LOCAL_EMBED_MODEL = "local-hash-v1";

const STOP = new Set(["a", "an", "the", "with", "and", "or", "of", "to", "in", "on", "for", "by", "it", "is", "that", "you", "my", "me", "one", "game"]);
const SYN: Record<string, string> = { rocks: "rock", falling: "fall", falls: "fall", dodging: "dodge", avoid: "dodge", coins: "coin", collect: "coin", collecting: "coin", jumping: "jump", hop: "jump", key: "key", button: "key", enemies: "enemy", runner: "run", running: "run" };

/** Non-AI fallback embedding: hashed bag of words and bigrams, L2-normalised. Stored under its own model name, never mixed with Gemini vectors. */
export function localEmbed(text: string, dim: number): number[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !STOP.has(w)).map((w) => SYN[w] ?? w.replace(/s$/, ""));
  const v = new Array<number>(dim).fill(0);
  const add = (tok: string, w: number) => {
    const h = sha256Hex(tok);
    const i = parseInt(h.slice(0, 8), 16) % dim;
    const sign = parseInt(h.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
    v[i] += sign * w;
  };
  words.forEach((w, i) => {
    add(w, 1);
    if (i > 0) add(`${words[i - 1]}_${w}`, 0.5);
  });
  const n = Math.hypot(...v);
  return n === 0 ? v : v.map((x) => x / n);
}
