import { env } from "@/lib/env";
import { getStore, isMock } from "@/lib/runtime";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
/** Demo only: edit a stored graph in place (keeping its id) so Verify can show the failure. Mock mode or ALLOW_CHAOS=1. */
export async function POST(_req: Request, { params }: P) {
  if (!isMock() && env().ALLOW_CHAOS !== "1") return new Response("Not found", { status: 404 });
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return new Response("Not found", { status: 404 });
  const g = structuredClone(d.graph);
  const n = g.nodes.find((x) => x.type === "AddScore") ?? g.nodes[0];
  n.params = { ...n.params, n: 1000 };
  await store.updateGraph(hash, { graph: g });
  return Response.json({ tampered: n.id });
}
