import { graphSchema } from "@forklab/engine";
import { getRouter, getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { aiChangelog } from "@/lib/ai/service";
export const dynamic = "force-dynamic";
/** Either {hash} (changelog of a published graph against its parent, stored) or {before, after} drafts. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ hash?: string; before?: unknown; after?: unknown }>(req);
  const store = await getStore();
  if (body.hash) {
    const d = await store.getGraph(body.hash);
    if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
    if (!d.parentId) return Response.json({ text: d.changelog ?? "", provider: d.changelogProvider ?? "local", badge: "AI: local" });
    if (d.changelogProvider && d.changelogProvider !== "local") return Response.json({ text: d.changelog, provider: d.changelogProvider, badge: d.changelogProvider === "gemini" ? "AI: Gemini" : d.changelogProvider === "nemotron" ? "AI: Nemotron" : "AI: cached" });
    const p = await store.getGraph(d.parentId);
    if (!p) return jsonError("NOT_FOUND", "Parent is missing.", 404);
    const r = await aiChangelog(getRouter(), p.graph, d.graph);
    await store.updateGraph(d._id, { changelog: r.text, changelogProvider: r.provider });
    return Response.json(r);
  }
  const a = graphSchema.safeParse(body.before);
  const b = graphSchema.safeParse(body.after);
  if (!a.success || !b.success) return jsonError("INVALID_GRAPH", "Send two graphs.");
  return Response.json(await aiChangelog(getRouter(), a.data, b.data));
});
