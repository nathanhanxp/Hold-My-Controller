import { getStore } from "@/lib/runtime";
import { handle, readJson } from "@/lib/api";
import { enterChallenge } from "@/lib/services/challenges";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const body = await readJson<{ hash: string; author: string }>(req);
  const r = await enterChallenge(await getStore(), id, String(body.hash), String(body.author ?? "").toLowerCase());
  return Response.json(r, { status: r.ok ? 201 : 422 });
});
