import { getStore, isMock } from "@/lib/runtime";
import { handle, readJson } from "@/lib/api";
import { castVote, checkProof, voteMessage } from "@/lib/services/challenges";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
/** One vote per wallet per entry, proven with signMessage. Voting is off-chain and Sybil-prone; the page says so. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const body = await readJson<{ hash: string; handle: string; wallet?: string; signature?: string }>(req);
  const handle = String(body.handle ?? "").toLowerCase();
  const proof = checkProof(isMock() ? "mock" : "live", voteMessage(id, body.hash), body.wallet, body.signature, handle);
  await castVote(await getStore(), id, body.hash, proof.wallet, handle);
  return Response.json({ ok: true, simulatedProof: proof.simulated });
});
