import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
import { searchLibrary } from "@/lib/services/search";
export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const r = await searchLibrary(await getStore(), {
    q: u.searchParams.get("q") ?? "",
    scope: (u.searchParams.get("scope") ?? "all") as never,
    mode: u.searchParams.get("mode") === "describe" ? "describe" : "keyword",
    license: (["free", "paid"] as const).find((x) => x === u.searchParams.get("license")),
    tag: u.searchParams.get("tag") ?? undefined,
    sort: (["trending", "forks", "new"] as const).find((x) => x === u.searchParams.get("sort")),
  });
  return Response.json(r);
});
