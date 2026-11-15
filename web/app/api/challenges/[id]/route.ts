import { RULES } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { playerStandings, projectedPayouts } from "@/lib/services/challenges";
import { cardGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const store = await getStore();
  const c = await store.getChallenge(id);
  if (!c) return jsonError("NOT_FOUND", "No such challenge.", 404);
  const entries = await store.entries(id);
  const entryGraphs = await Promise.all(entries.map(async (e) => ({ ...e, graph: (await store.getGraph(e.graphId)) ? cardGraph((await store.getGraph(e.graphId))!) : null })));
  const rule = c.ruleId ? RULES[c.ruleId] : null;
  return Response.json({
    challenge: c,
    rule: rule ? { id: rule.id, title: rule.title, rule: rule.rule } : null,
    entries: entryGraphs.sort((a, b) => b.votes - a.votes),
    standings: c.kind === "game" ? (await playerStandings(store, id)).map(({ wallet, ...r }) => { void wallet; return r; }) : [],
    projected: c.prize.status === "open" ? await projectedPayouts(store, c) : [],
    snapshot: await store.getSnapshot(id),
  });
});
