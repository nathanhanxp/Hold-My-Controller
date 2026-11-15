import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { demoGetPaid, paidGames } from "@/lib/services/tokens";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ handle: string }> };
const ok = (h: string) => /^[a-z0-9_]{1,24}$/.test(h);
/** The games a demo sale can pay you for: every game with your blocks in it. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const h = (await params).handle.toLowerCase();
  if (!ok(h)) return jsonError("BAD_HANDLE", "Pick a handle first.");
  return Response.json({ items: await paidGames(await getStore(), h) });
});
/** Demo: a seeded player licenses the game you pick (Simulated), and every creator is paid their share. */
export const POST = handle(async (req: Request, { params }: P) => {
  const h = (await params).handle.toLowerCase();
  if (!ok(h)) return jsonError("BAD_HANDLE", "Pick a handle first.");
  const body = await readJson<{ graphId?: string }>(req).catch(() => ({} as { graphId?: string }));
  return Response.json(await demoGetPaid(await getStore(), h, body.graphId ? String(body.graphId) : undefined), { status: 201 });
});
