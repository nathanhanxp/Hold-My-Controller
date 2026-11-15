import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { buyPlan, type Tier } from "@/lib/services/tokens";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ handle: string }> };
/** Spend tokens on an AI plan for 7 days. */
export const POST = handle(async (req: Request, { params }: P) => {
  const h = (await params).handle.toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("BAD_HANDLE", "Pick a handle first.");
  const body = await readJson<{ tier: Tier }>(req);
  return Response.json(await buyPlan(await getStore(), h, body.tier));
});
