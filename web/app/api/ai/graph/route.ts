import { graphSchema } from "@forklab/engine";
import { getLimiter, getRouter, getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { proposeGraph } from "@/lib/ai/service";
import { MAX_IMAGE_BYTES } from "@/lib/ai/limits";
export const dynamic = "force-dynamic";
/** Text (and optional image) to a proposal. Nothing is applied until the user presses Apply. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ prompt: string; editor?: string; current?: unknown; image?: { mime: string; base64: string } }>(req, 3_500_000);
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return jsonError("EMPTY_PROMPT", "Describe the mechanic you want.");
  const editor = /^[a-z0-9_]{1,24}$/.test(String(body.editor ?? "")) ? String(body.editor) : "guest";
  const current = body.current ? graphSchema.safeParse(body.current) : null;
  let image: { mime: string; data: Uint8Array } | undefined;
  if (body.image?.base64) {
    const data = Buffer.from(body.image.base64, "base64");
    if (data.length > MAX_IMAGE_BYTES) return jsonError("TOO_LARGE", "Images are limited to 2 MB.", 413);
    if (!/^image\/(png|jpeg|webp)$/.test(body.image.mime)) return jsonError("BAD_IMAGE", "Use a PNG, JPEG or WebP image.");
    image = { mime: body.image.mime, data };
  }
  const slot = getLimiter().tryAcquire();
  if (!slot.ok) return jsonError("RATE_LIMITED", slot.reason, 429);
  try {
    const r = await proposeGraph(await getStore(), getRouter(), { prompt, editor, current: current?.success ? current.data : null, image });
    return Response.json(r);
  } finally {
    slot.release();
  }
});
