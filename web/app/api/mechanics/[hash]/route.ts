import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { publicGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const d = await (await getStore()).getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  return Response.json({ mechanic: publicGraph(d) });
});
