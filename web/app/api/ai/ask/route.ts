import { graphSchema } from "@forklab/engine";
import { getLimiter, getRouter, getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { askAboutGraph } from "@/lib/ai/service";
export const dynamic = "force-dynamic";
/**
 * A question about the game in the editor. Returns an answer and up to three suggestions with ready prompts;
 * nothing changes the game here. A suggestion goes to /api/ai/graph and comes back as a normal proposal.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ question: string; editor?: string; current?: unknown }>(req, 1_500_000);
  const question = String(body.question ?? "").trim();
  if (!question) return jsonError("EMPTY_QUESTION", "Ask a question about your game.");
  const editor = /^[a-z0-9_]{1,24}$/.test(String(body.editor ?? "")) ? String(body.editor) : "guest";
  const current = body.current ? graphSchema.safeParse(body.current) : null;
  const slot = getLimiter().tryAcquire();
  if (!slot.ok) return jsonError("RATE_LIMITED", slot.reason, 429);
  try {
    return Response.json(await askAboutGraph(await getStore(), getRouter(), { question, editor, current: current?.success ? current.data : null }));
  } finally {
    slot.release();
  }
});
