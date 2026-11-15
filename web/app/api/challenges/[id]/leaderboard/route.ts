import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { contributorsOf, loadMinigame, playerStandings } from "@/lib/services/challenges";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
export const GET = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "players";
  const store = await getStore();
  const c = await store.getChallenge(id);
  if (!c) return jsonError("NOT_FOUND", "No such challenge.", 404);
  if (kind === "players") return Response.json({ items: (await playerStandings(store, id)).map(({ wallet, ...r }) => { void wallet; return r; }) });
  if (kind === "contributors" && c.minigame) return Response.json({ items: await contributorsOf(store, (await loadMinigame(store, c.minigame)).mech) });
  if (kind === "teams") {
    const standings = await playerStandings(store, id);
    const teams = await store.teams();
    return Response.json({ items: teams.map((t) => ({ ...t, points: standings.filter((s) => t.members.includes(s.player)).reduce((a, b) => a + b.score, 0) })).sort((a, b) => b.points - a.points) });
  }
  return Response.json({ items: (await store.entries(id)).sort((a, b) => b.votes - a.votes) });
});
