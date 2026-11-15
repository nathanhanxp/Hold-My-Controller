import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { feeds } from "@/lib/services/finalists";
import { cardGraph } from "@/lib/serialize";
export const dynamic = "force-dynamic";
/** Trending, Rising, and Fits next week's level: three short rows instead of one giant list. */
export const GET = handle(async () => {
  const f = await feeds(await getStore());
  return Response.json({ trending: f.trending.map(cardGraph), rising: f.rising.map(cardGraph), fits: f.fits.map(cardGraph), levelTitle: f.levelTitle, levelHash: f.levelHash });
});
