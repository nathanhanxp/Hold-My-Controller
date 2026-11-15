import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { recommendForGraph } from "@/lib/recommend";
import { cardGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const recs = await recommendForGraph(store, d);
  return Response.json({ items: recs.map((r) => ({ ...cardGraph(r.doc), reason: r.reason, reasons: r.reasons, score: r.score })) });
});
