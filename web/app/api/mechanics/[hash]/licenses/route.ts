import { getStore, isMock } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { recordDevnetLicense } from "@/lib/services/license";
import { fetchConfig } from "@/lib/solana";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  return Response.json({ items: await (await getStore()).licensesFor(hash) });
});
export const POST = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  const body = await readJson<{ sig: string; buyer: string; buyerHandle?: string }>(req);
  if (isMock()) return jsonError("MOCK_MODE", "Mock mode records Simulated licenses through license-sim.", 409);
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const cfg = await fetchConfig();
  const lic = await recordDevnetLicense(store, d, body.buyer, body.sig, cfg?.feeBps ?? 0, body.buyerHandle);
  return Response.json({ license: lic }, { status: 201 });
});
