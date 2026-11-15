import { env, EMBED_DEFAULT_MODEL } from "../env";
import { describeGraph } from "./describe";
import type { Store } from "../store/types";
import type { AiRouter } from "../ai/router";
import { safeLog } from "../ai/redact";

/**
 * Adds Gemini embeddings to graphs and assets that only have the local fallback vector.
 * Runs in the background after start-up and after each publish; never blocks a request.
 * Vectors from different models are never mixed: the document's embedModel says which one it holds.
 */
export async function backfillEmbeddings(store: Store, router: AiRouter, limit = 64): Promise<number> {
  const model = env().EMBED_MODEL ?? EMBED_DEFAULT_MODEL;
  if (!env().GEMINI_API_KEY) return 0;
  let done = 0;
  const graphs = (await store.listGraphs({ limit: 500 })).filter((g) => g.embedModel !== model).slice(0, limit);
  for (let i = 0; i < graphs.length; i += 16) {
    const batch = graphs.slice(i, i + 16);
    const vecs = await router.embed(batch.map((g) => describeGraph(g.graph, g.changelog)));
    if (!vecs) break;
    for (const [j, g] of batch.entries()) { await store.updateGraph(g._id, { semantic: vecs[j], embedModel: model }); done += 1; }
  }
  const assets = (await store.listAssets({ limit: 500 })).filter((a) => a.embedModel !== model).slice(0, limit);
  if (assets.length) {
    const vecs = await router.embed(assets.map((a) => `${a.title}. ${a.tags.join(" ")}. ${a.kind}${a.asset.prefab ? ` tag ${a.asset.prefab.tag}` : ""}`));
    if (vecs) for (const [j, a] of assets.entries()) { await store.updateAsset(a._id, { semantic: vecs[j], embedModel: model }); done += 1; }
  }
  if (done) safeLog(`[forklab] embedded ${done} library item(s) with ${model}`);
  return done;
}
