import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const POST = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  await (await getStore()).bumpStat(hash, "plays");
  return Response.json({ ok: true });
});
