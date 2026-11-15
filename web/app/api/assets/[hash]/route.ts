import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { cardGraph, publicAsset } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getAsset(hash);
  if (!d) return jsonError("NOT_FOUND", "No asset with that hash.", 404);
  const usedBy = (await store.listGraphs({ kind: undefined, limit: 500 })).filter((g) => g.assetRefs.includes(hash));
  return Response.json({ asset: publicAsset(d), usedBy: usedBy.map(cardGraph) });
});
