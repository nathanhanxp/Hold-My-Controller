import { checkRule, graphSchema } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
/** Server-side rule check for a draft or a published mechanic. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const store = await getStore();
  const c = await store.getChallenge(id);
  if (!c?.ruleId) return jsonError("NOT_FOUND", "No rule for this challenge.", 404);
  const body = await readJson<{ hash?: string; graph?: unknown }>(req);
  const g = body.hash ? (await store.getGraph(body.hash))?.graph : graphSchema.safeParse(body.graph).data;
  if (!g) return jsonError("INVALID_GRAPH", "Send a mechanic.");
  return Response.json(checkRule(c.ruleId, g));
});
