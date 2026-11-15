import { z } from "zod";
import { getLimiter, getRouter } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { explainEdit } from "@/lib/ai/service";
export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["connect", "disconnect", "detach"]),
  what: z.string().max(400),
  problem: z.string().max(400).optional(),
  affected: z.array(z.string().max(120)).max(20).default([]),
});

/** Plain-English explanation of an edit the editor flagged: why a wire is rejected, or what a disconnection stops. */
export const POST = handle(async (req: Request) => {
  const body = input.safeParse(await readJson(req));
  if (!body.success) return jsonError("BAD_INPUT", "Describe the edit to explain.");
  const slot = getLimiter().tryAcquire();
  if (!slot.ok) return jsonError("RATE_LIMITED", slot.reason, 429);
  try {
    return Response.json(await explainEdit(getRouter(), body.data));
  } finally {
    slot.release();
  }
});
