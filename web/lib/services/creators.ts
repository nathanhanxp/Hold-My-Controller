import type { Store } from "../store/types";

export async function creatorSummaries(store: Store) {
  const [graphs, licenses, users, challenges] = await Promise.all([store.listGraphs({ limit: 1000 }), store.allLicenses(), store.listUsers(), store.listChallenges()]);
  const map = new Map<string, { handle: string; mechanics: number; forksReceived: number; plays: number; earnedLamports: number; wins: number; color: number }>();
  const get = (h: string) => {
    if (!map.has(h)) map.set(h, { handle: h, mechanics: 0, forksReceived: 0, plays: 0, earnedLamports: 0, wins: 0, color: users.find((u) => u._id === h)?.color ?? 0 });
    return map.get(h)!;
  };
  for (const u of users) get(u._id);
  for (const g of graphs) {
    const c = get(g.authorId);
    c.mechanics += 1;
    c.forksReceived += g.stats.forks;
    c.plays += g.stats.plays;
  }
  for (const l of licenses) for (const s of l.split) get(s.handle).earnedLamports += s.lamports;
  for (const ch of challenges) for (const p of ch.prize.status === "settled" ? ch.prize.payouts ?? [] : []) {
    if (p.handle) {
      get(p.handle).earnedLamports += Math.floor((ch.prize.poolLamports * p.bps) / 10_000);
      if (p.role !== "contributor") get(p.handle).wins += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.forksReceived - a.forksReceived || b.mechanics - a.mechanics);
}
