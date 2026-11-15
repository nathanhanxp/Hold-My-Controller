import { getStore } from "@/lib/runtime";
import { handle, jsonError } from "@/lib/api";
import { mechanicPda, programConfigured } from "@/lib/solana";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
export const GET = handle(async (_req: Request, { params }: P) => {
  const { hash } = await params;
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return jsonError("NOT_FOUND", "No mechanic with that hash.", 404);
  const { ancestors } = await store.lineage(hash);
  return Response.json({
    anchor: d.anchor,
    mechanicPda: programConfigured() && d.licenseType === "paid" ? mechanicPda(hash).toBase58() : null,
    licenses: await store.licensesFor(hash),
    records: [...ancestors, d].map((x) => ({ hash: x._id, title: x.title, graph: x.graph, anchorSig: x.anchor.sig, anchorStatus: x.anchor.status, shares: x.shares, paid: x.licenseType === "paid" })),
    expectedChain: [...ancestors.map((a) => a._id), hash],
  });
});
