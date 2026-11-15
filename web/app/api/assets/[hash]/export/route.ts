import { exportAssetFiles, slugify, zipFiles } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  const d = await (await getStore()).getAsset(hash);
  if (!d) return jsonError("NOT_FOUND", "No asset with that hash.", 404);
  if (new URL(req.url).searchParams.get("as") === "json") {
    return new Response(JSON.stringify({ hash, asset: d.asset }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${slugify(d.title)}.asset.json"` } });
  }
  const zip = (await zipFiles(exportAssetFiles(d.asset, hash))) as Uint8Array;
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slugify(d.title)}-asset.zip"` } });
});
