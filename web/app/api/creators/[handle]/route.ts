import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { creatorSummaries } from "@/lib/services/creators";
import { cardGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ handle: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { handle: h } = await params;
  const store = await getStore();
  const summary = (await creatorSummaries(store)).find((c) => c.handle === h) ?? { handle: h, mechanics: 0, forksReceived: 0, plays: 0, earnedLamports: 0, wins: 0, color: 0 };
  const graphs = await store.listGraphs({ author: h, kind: undefined, sort: "new", limit: 100 });
  const contributed = (await store.listGraphs({ limit: 300 })).filter((g) => g.authorId !== h && g.shares.some((s) => s.handle === h));
  return Response.json({ creator: summary, user: await store.getUser(h), graphs: graphs.map(cardGraph), contributed: contributed.map(cardGraph) });
});
