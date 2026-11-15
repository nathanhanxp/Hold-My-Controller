import { forkGraph } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
/** Returns a draft with parent set and authorship preserved. Nothing is stored until it is published. */
export const POST = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const d = await (await getStore()).getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  return Response.json({ draft: forkGraph(d.graph, d._id), parentTitle: d.title });
});
