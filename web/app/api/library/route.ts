import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { cardGraph, publicAsset } from "@/lib/serialize";
import { fits, referenceLevel } from "@/lib/services/finalists";
export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "mechanic";
  const sort = (["trending", "forks", "new"] as const).find((x) => x === u.searchParams.get("sort")) ?? "trending";
  const tag = u.searchParams.get("tag") ?? undefined;
  const q = u.searchParams.get("q") ?? undefined;
  const store = await getStore();
  if (kind === "prefab" || kind === "theme") return Response.json({ kind, items: (await store.listAssets({ kind, sort, tag, q })).map(publicAsset) });
  const author = u.searchParams.get("author")?.toLowerCase() || undefined;
  let items = await store.listGraphs({ kind: kind === "level" ? "level" : "mechanic", license: kind === "mechanic" ? (["free", "paid"] as const).find((x) => x === u.searchParams.get("license")) : undefined, sort, tag, q, author });
  // fits=1: only mechanics that run on next week's reference level
  if (kind === "mechanic" && u.searchParams.get("fits") === "1") {
    const ref = await referenceLevel(store);
    if (ref) items = items.filter((d) => fits(ref.graph, d.graph));
  }
  return Response.json({ kind, items: items.map(cardGraph) });
});
