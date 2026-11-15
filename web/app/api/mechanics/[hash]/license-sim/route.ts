import { getStore, isMock } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { recordSimulatedLicense } from "@/lib/services/license";
import { demoWallet } from "@/lib/wallets";
import { chainLive } from "@/lib/services/chain-server";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
/** Simulated license for mock mode or when the program is not deployed. Clearly labelled Simulated. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  if (!isMock() && chainLive()) return jsonError("LIVE_MODE", "Live mode licenses through a devnet transaction.", 409);
  const body = await readJson<{ buyer?: string; buyerHandle?: string }>(req);
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const buyer = body.buyer || demoWallet(body.buyerHandle || "guest");
  return Response.json({ license: await recordSimulatedLicense(store, d, buyer, body.buyerHandle) }, { status: 201 });
});
