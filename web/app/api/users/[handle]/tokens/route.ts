import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { PLANS, tokenAccount } from "@/lib/services/tokens";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ handle: string }> };
/** Token balance, where it came from, the active AI plan, and the plans on offer. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const h = (await params).handle.toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("BAD_HANDLE", "Unknown handle.");
  return Response.json({ ...(await tokenAccount(await getStore(), h)), plans: PLANS });
});
