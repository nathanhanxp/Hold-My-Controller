import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { tokenHistory } from "@/lib/services/tokens";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ handle: string }> };
/** Every token in and out of this handle's balance, newest first. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const h = (await params).handle.toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("BAD_HANDLE", "Pick a handle first.");
  return Response.json({ items: (await tokenHistory(await getStore(), h)).slice(0, 60) });
});
