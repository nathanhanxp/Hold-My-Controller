import { getStore, isMock } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { settleChallenge } from "@/lib/services/challenges";
import { chainLive, settleSender } from "@/lib/services/chain-server";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
/** Authority only. In mock mode (or with ALLOW_CHAOS=1 for drills) the admin button may settle with a Simulated receipt. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const body = await readJson<{ adminToken?: string }>(req).catch(() => ({}) as { adminToken?: string });
  const allowed = isMock() || env().ALLOW_CHAOS === "1" || (!!process.env.ADMIN_TOKEN && body.adminToken === process.env.ADMIN_TOKEN);
  if (!allowed) return jsonError("UNAUTHORIZED", "Only the platform authority can settle.", 403);
  const r = await settleChallenge(await getStore(), id, settleSender());
  return Response.json({ ...r, onChain: chainLive() });
});
