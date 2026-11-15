import { handle } from "@/lib/api";
import { searchModels } from "@/lib/services/modelsearch";
export const dynamic = "force-dynamic";
/** Search free (CC0) Poly Haven models by words, for scene props and looks. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ items: await searchModels(q.slice(0, 200), 12) });
});
