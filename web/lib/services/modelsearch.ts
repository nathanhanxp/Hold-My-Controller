/*
 * Finding models on the internet: Poly Haven's public API (CC0 models, real-world scale in metres).
 * The index of all models is fetched once and cached; searches score name, tags and categories.
 * Ids are "ph:<poly haven id>"; the browser loads the glTF straight from dl.polyhaven.org (CORS open).
 */

type Entry = { id: string; name: string; tags: string[]; categories: string[] };
const API = "https://api.polyhaven.com";
const HEADERS = { "User-Agent": "ForkLab game editor" };
const DAY = 86_400_000;
const g = globalThis as unknown as { __phIndex?: { at: number; items: Entry[] }; __phFiles?: Map<string, unknown> };

async function index(): Promise<Entry[]> {
  if (g.__phIndex && Date.now() - g.__phIndex.at < DAY) return g.__phIndex.items;
  const res = await fetch(`${API}/assets?t=models`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Poly Haven answered ${res.status}`);
  const json = (await res.json()) as Record<string, { name?: string; tags?: string[]; categories?: string[] }>;
  const items = Object.entries(json).map(([id, v]) => ({ id, name: v.name ?? id, tags: v.tags ?? [], categories: v.categories ?? [] }));
  g.__phIndex = { at: Date.now(), items };
  return items;
}

const STOP = new Set(["a", "an", "the", "and", "or", "with", "of", "to", "in", "on", "at", "for", "make", "add", "some", "it", "game", "my", "me", "more", "less", "theme", "look", "like", "lots", "around", "all", "can", "now", "please", "change", "into", "that", "this", "colors", "colours", "style"]);
export const words = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1"));

/** Best Poly Haven models for some words. Empty when nothing matches or the API is unreachable. */
export async function searchModels(q: string, limit = 8): Promise<Array<{ id: string; name: string; tags: string[] }>> {
  const ws = words(q);
  if (!ws.length) return [];
  let items: Entry[];
  try { items = await index(); } catch { return []; }
  const scored = items.map((e) => {
    const hay = { name: e.name.toLowerCase(), id: e.id.toLowerCase(), tags: e.tags.map((t) => t.toLowerCase()), cats: e.categories.map((c) => c.toLowerCase()) };
    let s = 0;
    for (const w of ws) {
      if (hay.name.includes(w) || hay.id.includes(w)) s += 3;
      if (hay.tags.some((t) => t === w || t.startsWith(w))) s += 2;
      if (hay.cats.some((c) => c.includes(w))) s += 1;
    }
    return { e, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(({ e }) => ({ id: `ph:${e.id}`, name: e.name, tags: e.tags.slice(0, 5) }));
}

/** The glTF file and its textures for one model, at 1k resolution (cached). */
export async function modelFiles(id: string): Promise<{ url: string; include: Record<string, string> } | null> {
  if (!/^[A-Za-z0-9_]{1,80}$/.test(id)) return null;
  g.__phFiles ??= new Map();
  if (g.__phFiles.has(id)) return g.__phFiles.get(id) as { url: string; include: Record<string, string> };
  const res = await fetch(`${API}/files/${id}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { gltf?: Record<string, { gltf?: { url: string; include?: Record<string, { url: string }> } }> };
  const pick = json.gltf?.["1k"]?.gltf ?? json.gltf?.["2k"]?.gltf;
  if (!pick) return null;
  const out = { url: pick.url, include: Object.fromEntries(Object.entries(pick.include ?? {}).map(([k, v]) => [k, v.url])) };
  g.__phFiles.set(id, out);
  return out;
}
