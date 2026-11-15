import { getStore, embedNow, isMock } from "@/lib/runtime";
import { handle, readJson } from "@/lib/api";
import { publishAsset } from "@/lib/services/publish";
import { simulateAnchor } from "@/lib/services/anchor-sim";
import { publicAsset } from "@/lib/serialize";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const kind = (["prefab", "theme"] as const).find((x) => x === u.searchParams.get("kind"));
  return Response.json({ items: (await (await getStore()).listAssets({ kind, q: u.searchParams.get("q") ?? undefined, sort: "new" })).map(publicAsset) });
});
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ asset: unknown }>(req);
  const store = await getStore();
  const doc = await publishAsset({ store, mode: env().FORKLAB_MODE, embedNow }, body);
  if (isMock()) simulateAnchor(store, doc._id, "asset");
  return Response.json({ asset: publicAsset(doc) }, { status: 201 });
});
