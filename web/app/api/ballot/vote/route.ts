import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { SLOTS, unvoteFor, voteFor, type Slot } from "@/lib/services/ballot";
export const dynamic = "force-dynamic";
/** One vote per piece per handle; not for your own piece. Off-chain and Sybil-prone, like episode votes. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ slot: string; id: string; handle: string }>(req);
  if (!SLOTS.includes(body.slot as Slot)) return jsonError("BAD_SLOT", "Vote for a mechanic, a level or a look.");
  const r = await voteFor(await getStore(), body.slot as Slot, String(body.id ?? ""), String(body.handle ?? "").toLowerCase());
  return Response.json({ ok: true, earned: r.earned });
});

/** Take a vote back; the slot's token goes too if it was your only vote there. */
export const DELETE = handle(async (req: Request) => {
  const body = await readJson<{ slot: string; id: string; handle: string }>(req);
  if (!SLOTS.includes(body.slot as Slot)) return jsonError("BAD_SLOT", "Choose a mechanic, a level or a look.");
  const r = await unvoteFor(await getStore(), body.slot as Slot, String(body.id ?? ""), String(body.handle ?? "").toLowerCase());
  return Response.json({ ok: true, lost: r.lost });
});
