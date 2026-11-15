import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { currentWinner } from "@/lib/services/challenges";
import { publicGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const w = await currentWinner(await getStore());
  if (!w) return jsonError("NONE", "No mechanics yet.", 404);
  return Response.json({ mechanic: publicGraph(w.doc), fromChallenge: w.fromChallenge ? { _id: w.fromChallenge._id, title: w.fromChallenge.title, votes: w.fromChallenge.winner?.votes } : null, fallback: w.fallback });
});
