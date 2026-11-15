import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const POST = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const d = await (await getStore()).getAsset(hash);
  if (!d) return jsonError("NOT_FOUND", "No asset with that hash.", 404);
  return Response.json({ draft: { ...d.asset, parent: hash, title: `${d.asset.title} (fork)`.slice(0, 80) } });
});
