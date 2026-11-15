import { getStore, embedNow, isMock, scheduleBackfill } from "@/lib/runtime";
import { handle, readJson } from "@/lib/api";
import { publishGraph } from "@/lib/services/publish";
import { describeGraph } from "@/lib/services/describe";
import { simulateAnchor } from "@/lib/services/anchor-sim";
import { cardGraph, publicGraph } from "@/lib/serialize";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const store = await getStore();
  const kind = u.searchParams.get("kind") === "level" ? "level" : u.searchParams.get("kind") === "all" ? undefined : "mechanic";
  const license = (["free", "paid"] as const).find((x) => x === u.searchParams.get("license"));
  const sort = (["trending", "forks", "new"] as const).find((x) => x === u.searchParams.get("sort")) ?? "trending";
  const list = await store.listGraphs({ q: u.searchParams.get("q") ?? undefined, kind, license, tag: u.searchParams.get("tag") ?? undefined, sort, author: u.searchParams.get("author") ?? undefined });
  return Response.json({ items: list.map(cardGraph) });
});

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ graph: unknown; author: string; thumb?: string }>(req);
  const store = await getStore();
  const doc = await publishGraph({ store, mode: env().FORKLAB_MODE, embedNow, describe: describeGraph }, { draft: body.graph, author: body.author, thumb: body.thumb });
  if (isMock()) simulateAnchor(store, doc._id);
  scheduleBackfill(store);
  return Response.json({ mechanic: publicGraph(doc) }, { status: 201 });
});
