import { diffGraphs, localChangelog } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  const against = new URL(req.url).searchParams.get("against") ?? d?.parentId ?? "";
  const o = against ? await store.getGraph(against) : null;
  if (!d || !o) return jsonError("NOT_FOUND", "Both graphs must exist.", 404);
  const diff = diffGraphs(o.graph, d.graph);
  return Response.json({ diff, text: localChangelog(diff) });
});
