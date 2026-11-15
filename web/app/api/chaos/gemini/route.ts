import { env } from "@/lib/env";
import { runtime } from "@/lib/runtime";
import { readJson } from "@/lib/api";
export const dynamic = "force-dynamic";
/** Demo and drill switch: simulate a Gemini outage. 404 unless ALLOW_CHAOS=1. */
export async function POST(req: Request) {
  if (env().ALLOW_CHAOS !== "1") return new Response("Not found", { status: 404 });
  const body = await readJson<{ on?: boolean }>(req).catch(() => ({}) as { on?: boolean });
  runtime().chaosGemini = body.on ?? !runtime().chaosGemini;
  return Response.json({ chaosGemini: runtime().chaosGemini });
}
