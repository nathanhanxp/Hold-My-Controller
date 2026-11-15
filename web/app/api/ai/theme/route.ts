import { getLimiter, getRouter } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { themeFromImage } from "@/lib/ai/service";
import { MAX_IMAGE_BYTES } from "@/lib/ai/limits";
export const dynamic = "force-dynamic";
/** Image to {sky, ground, accent}. If every provider fails the browser runs its local color extractor. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ image: { mime: string; base64: string } }>(req, 3_500_000);
  const data = Buffer.from(body.image?.base64 ?? "", "base64");
  if (!data.length) return jsonError("NO_IMAGE", "Add an image.");
  if (data.length > MAX_IMAGE_BYTES) return jsonError("TOO_LARGE", "Images are limited to 2 MB.", 413);
  const slot = getLimiter().tryAcquire();
  if (!slot.ok) return jsonError("RATE_LIMITED", slot.reason, 429);
  try {
    return Response.json(await themeFromImage(getRouter(), { mime: body.image.mime, data }));
  } finally {
    slot.release();
  }
});
