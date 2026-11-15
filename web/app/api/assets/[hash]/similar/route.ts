import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { recommendForAsset } from "@/lib/recommend";
import { publicAsset } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getAsset(hash);
  if (!d) return jsonError("NOT_FOUND", "No asset with that hash.", 404);
  return Response.json({ items: (await recommendForAsset(store, d)).map((r) => ({ ...publicAsset(r.doc), reason: r.reason })) });
});
