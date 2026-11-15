import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { payWithTokens } from "@/lib/services/tokens";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
/** License with tokens instead of a wallet: the price is split between the game's creators (Simulated). */
export const POST = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  const body = await readJson<{ handle?: string }>(req);
  const h = String(body.handle ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("NO_HANDLE", "Pick a handle first.", 401);
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No game with that hash.", 404);
  return Response.json({ license: await payWithTokens(store, d, h) }, { status: 201 });
});
