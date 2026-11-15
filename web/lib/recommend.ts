import type { AssetDoc, GraphDoc, Store } from "./store/types";

export type Reason = "Built the same way" | "Similar idea" | "From the same lineage" | "Teams who forked this also forked";
export type RankedList = { reason: Reason; hashes: string[] };
export type Recommendation = { hash: string; score: number; reason: Reason; reasons: Reason[] };

const K = 60;

/** Reciprocal rank fusion: score = sum over lists of 1 / (60 + rank). Excludes the item and its ancestors. Keeps the top n. */
export function fuseRanks(lists: RankedList[], exclude: Set<string>, n = 8): Recommendation[] {
  const acc = new Map<string, { score: number; best: { reason: Reason; contrib: number }; reasons: Reason[] }>();
  for (const list of lists) {
    list.hashes.forEach((h, i) => {
      if (exclude.has(h)) return;
      const contrib = 1 / (K + i + 1);
      const cur = acc.get(h) ?? { score: 0, best: { reason: list.reason, contrib: 0 }, reasons: [] };
      cur.score += contrib;
      if (!cur.reasons.includes(list.reason)) cur.reasons.push(list.reason);
      if (contrib > cur.best.contrib) cur.best = { reason: list.reason, contrib };
      acc.set(h, cur);
    });
  }
  return [...acc.entries()]
    .map(([hash, v]) => ({ hash, score: v.score, reason: v.best.reason, reasons: v.reasons }))
    .sort((a, b) => b.score - a.score || (a.hash < b.hash ? -1 : 1))
    .slice(0, n);
}

/** Four optional candidate lists; a missing vector or a failed stage just drops that list. */
export async function recommendForGraph(store: Store, doc: GraphDoc, n = 8): Promise<Array<Recommendation & { doc: GraphDoc }>> {
  const lists: RankedList[] = [];
  const safe = async (reason: Reason, f: () => Promise<string[]>) => {
    try { lists.push({ reason, hashes: await f() }); } catch { /* list dropped */ }
  };
  await safe("Built the same way", async () => (await store.similar({ scope: "graphs", field: "structure", vector: doc.structure, k: 20, filter: { kind: doc.kind } })).map((x) => x.hash));
  if (doc.semantic?.length) {
    await safe("Similar idea", async () => (await store.similar({ scope: "graphs", field: "semantic", vector: doc.semantic!, k: 20, filter: { kind: doc.kind }, embedModel: doc.embedModel })).map((x) => x.hash));
  }
  await safe("From the same lineage", async () => (await store.kin(doc._id, 2)).map((x) => x._id));
  await safe("Teams who forked this also forked", async () => {
    const { descendants } = await store.lineage(doc._id);
    const forkers = new Set(descendants.filter((d) => d.parentId === doc._id).map((d) => d.authorId));
    if (!forkers.size) return [];
    const all = await store.listGraphs({ limit: 200 });
    const parents = all.filter((g) => forkers.has(g.authorId) && g.parentId && g.parentId !== doc._id).map((g) => g.parentId!);
    return [...new Set(parents)];
  });
  const { ancestors } = await store.lineage(doc._id);
  const exclude = new Set([doc._id, ...ancestors.map((a) => a._id)]);
  const fused = fuseRanks(lists, exclude, n);
  const out: Array<Recommendation & { doc: GraphDoc }> = [];
  for (const r of fused) {
    const d = await store.getGraph(r.hash);
    if (d) out.push({ ...r, doc: d });
  }
  return out;
}

export async function recommendForAsset(store: Store, doc: AssetDoc, n = 8): Promise<Array<Recommendation & { doc: AssetDoc }>> {
  const lists: RankedList[] = [];
  if (doc.semantic?.length) {
    try {
      lists.push({ reason: "Similar idea", hashes: (await store.similar({ scope: "assets", field: "semantic", vector: doc.semantic, k: 20, filter: { kind: doc.kind }, embedModel: doc.embedModel })).map((x) => x.hash) });
    } catch { /* dropped */ }
  }
  const same = (await store.listAssets({ kind: doc.kind, limit: 50 })).filter((a) => a.tags.some((t) => doc.tags.includes(t)) || a.parentId === doc._id || a._id === doc.parentId);
  lists.push({ reason: "From the same lineage", hashes: same.map((a) => a._id) });
  const fused = fuseRanks(lists, new Set([doc._id]), n);
  const out: Array<Recommendation & { doc: AssetDoc }> = [];
  for (const r of fused) {
    const d = await store.getAsset(r.hash);
    if (d) out.push({ ...r, doc: d });
  }
  return out;
}
