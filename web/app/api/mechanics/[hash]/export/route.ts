import { exportCSharpFiles, prefabRegistry, slugify, zipFiles } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const as = new URL(req.url).searchParams.get("as") ?? "mechanic";
  const slug = slugify(d.title);
  if (as === "json") {
    return new Response(JSON.stringify({ hash, graph: d.graph }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${slug}.graph.json"` } });
  }
  const assets = (await Promise.all(d.assetRefs.map((a) => store.getAsset(a)))).filter(Boolean).map((a) => ({ hash: a!._id, asset: a!.asset }));
  const zip = (await zipFiles(exportCSharpFiles(d.graph, hash, prefabRegistry(assets)))) as Uint8Array;
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-unity.zip"` } });
});
