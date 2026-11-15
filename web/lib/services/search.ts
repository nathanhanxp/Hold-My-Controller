import { env } from "../env";
import { localEmbed, LOCAL_EMBED_MODEL } from "../ai/embed-local";
import { getRouter } from "../runtime";
import { cardGraph, publicAsset } from "../serialize";
import { creatorSummaries } from "./creators";
import type { Store } from "../store/types";

export type SearchScope = "all" | "mechanics" | "levels" | "prefabs" | "themes" | "creators" | "challenges";

/**
 * Keyword search, or "describe it": embed the text and vector-search the semantic field with the filter chips.
 * Gemini embeddings when available; otherwise the local hashed model. If both fail, keyword results with a notice.
 */
export type SearchResult = { mode: string; via?: string; notice: string | null; items: unknown[] };
export async function searchLibrary(store: Store, p: { q: string; scope: SearchScope; mode: "keyword" | "describe"; license?: "free" | "paid"; tag?: string; sort?: "trending" | "forks" | "new" }): Promise<SearchResult> {
  const q = p.q.slice(0, 200);
  if (p.scope === "all") {
    const parts: SearchResult[] = await Promise.all((["mechanics", "levels", "prefabs", "themes"] as const).map((scope) => searchLibrary(store, { ...p, scope, license: scope === "mechanics" ? p.license : undefined })));
    const tagged: Array<Record<string, unknown>> = parts.flatMap((r, i) => (r.items as Array<Record<string, unknown>>).map((it) => ({ ...it, itemType: (["mechanic", "level", "prefab", "theme"] as const)[i] })));
    if (p.mode === "describe" && q.trim()) tagged.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
    return { mode: p.mode, notice: null, items: tagged };
  }
  if (p.scope === "creators") return { mode: "keyword", notice: null, items: (await creatorSummaries(store)).filter((c) => !q || c.handle.includes(q.toLowerCase())) };
  if (p.scope === "challenges") {
    const list = (await store.listChallenges()).filter((c) => !q || `${c.title} ${c.episode}`.toLowerCase().includes(q.toLowerCase()));
    return { mode: "keyword", notice: null, items: list };
  }
  const graphScope = p.scope === "mechanics" || p.scope === "levels";
  const kind = p.scope === "mechanics" ? "mechanic" : p.scope === "levels" ? "level" : p.scope === "prefabs" ? "prefab" : "theme";
  let notice: string | null = null;
  if (p.mode === "describe" && q.trim()) {
    let via = "local";
    let hits: Array<{ hash: string; score: number }> = [];
    try {
      const remote = await getRouter().embed([q]);
      if (remote?.[0]) {
        hits = await store.similar({ scope: graphScope ? "graphs" : "assets", field: "semantic", vector: remote[0], k: 12, filter: { kind, licenseType: graphScope ? p.license : undefined, tags: p.tag ? [p.tag] : undefined }, embedModel: env().EMBED_MODEL ?? "gemini-embedding-001" });
        via = "gemini";
      }
      if (!hits.length) {
        hits = await store.similar({ scope: graphScope ? "graphs" : "assets", field: "semantic", vector: localEmbed(q, env().EMBED_DIM), k: 12, filter: { kind, licenseType: graphScope ? p.license : undefined, tags: p.tag ? [p.tag] : undefined }, embedModel: LOCAL_EMBED_MODEL });
        via = "local";
      }
      const docs = [];
      for (const h of hits.filter((x) => x.score > 0.05)) {
        if (graphScope) { const d = await store.getGraph(h.hash); if (d) docs.push({ ...cardGraph(d), score: h.score }); }
        else { const d = await store.getAsset(h.hash); if (d) docs.push({ ...publicAsset(d), score: h.score }); }
      }
      return { mode: "describe", via, notice: via === "local" ? "Describe search is using the local text model (no AI embeddings available)." : null, items: docs };
    } catch {
      notice = "Describe search unavailable, showing keyword results.";
    }
  }
  if (graphScope) return { mode: "keyword", notice, items: (await store.listGraphs({ q, kind: kind as "mechanic" | "level", license: p.license, tag: p.tag, sort: p.sort ?? "trending" })).map(cardGraph) };
  return { mode: "keyword", notice, items: (await store.listAssets({ q, kind: kind as "prefab" | "theme", tag: p.tag, sort: p.sort ?? "trending" })).map(publicAsset) };
}
