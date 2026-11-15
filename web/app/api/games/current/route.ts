import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { ensureWeeklyGame, loadMinigame, playerStandings, projectedPayouts } from "@/lib/services/challenges";
import { publicGraph } from "@/lib/serialize";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const store = await getStore();
  // Opens this week's game on first read if the weekly job has not yet (idempotent by week id).
  const { challenge } = await ensureWeeklyGame(store, new Date(), env().WEEKLY_POOL_LAMPORTS);
  if (!challenge.minigame) return jsonError("NO_GAME", "This week's game is not composed.", 500);
  const { level, mech } = await loadMinigame(store, challenge.minigame);
  return Response.json({
    challenge,
    level: publicGraph(level),
    mechanic: publicGraph(mech),
    standings: (await playerStandings(store, challenge._id)).map(({ wallet, ...r }) => { void wallet; return r; }),
    projected: await projectedPayouts(store, challenge),
  });
});
