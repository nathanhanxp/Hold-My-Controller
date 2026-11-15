import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { nominate, SLOTS, type Slot } from "@/lib/services/ballot";
export const dynamic = "force-dynamic";
/** Put a free library piece on next week's ballot. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ slot: string; id: string; handle: string }>(req);
  const who = String(body.handle ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(who)) return jsonError("NO_HANDLE", "Pick a handle first.", 401);
  if (!SLOTS.includes(body.slot as Slot)) return jsonError("BAD_SLOT", "Nominate a mechanic, a level or a look.");
  const entry = await nominate(await getStore(), body.slot as Slot, String(body.id ?? ""), who);
  return Response.json({ ok: true, entry });
});
