import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { creatorSummaries } from "@/lib/services/creators";
export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase();
  const list = await creatorSummaries(await getStore());
  return Response.json({ items: list.filter((c) => !q || c.handle.includes(q)) });
});
