import { handle, jsonError } from "@/lib/api";
import { modelFiles } from "@/lib/services/modelsearch";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
/** Where the browser loads a Poly Haven model from: the glTF url and its texture urls. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const f = await modelFiles((await params).id);
  if (!f) return jsonError("NOT_FOUND", "No such model.", 404);
  return Response.json(f, { headers: { "Cache-Control": "public, max-age=86400" } });
});
