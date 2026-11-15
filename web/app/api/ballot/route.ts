import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { ballot, nextGameId, VOTES_PER_SLOT } from "@/lib/services/ballot";
import { weekBounds } from "@/lib/store/seed";
export const dynamic = "force-dynamic";
/** Next week's ballot: nominees per slot (mechanic, level, look) with their votes, and when voting closes. */
export const GET = handle(async (req: Request) => {
  const store = await getStore();
  const b = await ballot(store);
  const { startsAt } = weekBounds(nextGameId(), Date.now());
  // with ?handle=, which pieces this person already voted for (two votes per slot)
  const who = (new URL(req.url).searchParams.get("handle") ?? "").toLowerCase();
  const mine: Record<string, string[]> = { mechanic: [], level: [], look: [] };
  if (/^[a-z0-9_]{1,24}$/.test(who)) for (const v of await store.votesBy(who)) { const slot = v.challengeId.split(":")[2]; if (v.challengeId.startsWith(`finalists:${b.game}:`) && mine[slot]) mine[slot].push(v.graphId); }
  return Response.json({ ...b, closesAt: startsAt, mine, perSlot: VOTES_PER_SLOT });
});
