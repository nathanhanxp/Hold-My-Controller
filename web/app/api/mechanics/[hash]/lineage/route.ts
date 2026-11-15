import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { cardGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const root = d.rootId || d._id;
  const { ancestors, descendants } = await store.lineage(hash);
  const rootDoc = await store.getGraph(root);
  const tree = rootDoc ? [rootDoc, ...(await store.lineage(root)).descendants] : [d];
  const sources = await Promise.all(d.sources.map((s) => store.getGraph(s)));
  return Response.json({
    current: hash,
    ancestors: ancestors.map(cardGraph),
    descendants: descendants.map(cardGraph),
    tree: tree.map(cardGraph),
    sources: sources.filter(Boolean).map((s) => cardGraph(s!)),
  });
});
