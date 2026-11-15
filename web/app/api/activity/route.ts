import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const store = await getStore();
  const [items, graphs, licenses] = await Promise.all([store.activity(30), store.listGraphs({ limit: 500 }), store.allLicenses()]);
  const forks = graphs.reduce((s, g) => s + g.stats.forks, 0);
  const paid = licenses.reduce((s, l) => s + l.priceLamports, 0);
  const anchored = graphs.filter((g) => g.anchor.status === "confirmed" || g.anchor.status === "simulated").length;
  return Response.json({ items, stats: { mechanics: graphs.filter((g) => g.kind === "mechanic").length, forks, paidLamports: paid, anchored } });
});
