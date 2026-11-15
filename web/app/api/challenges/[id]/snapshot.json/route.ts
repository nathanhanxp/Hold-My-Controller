import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
/** The published results body. Its sha256 (canonical JSON) is anchored in the settle transaction. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const s = await (await getStore()).getSnapshot(id);
  if (!s) return jsonError("NOT_FOUND", "No snapshot yet. It is written when the challenge settles.", 404);
  return new Response(JSON.stringify(s.body, null, 2), { headers: { "Content-Type": "application/json", "X-Snapshot-Hash": s.hash, "Content-Disposition": `inline; filename="${id}-snapshot.json"` } });
});
