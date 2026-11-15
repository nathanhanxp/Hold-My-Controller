import { getStore, isMock } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { bindMessage, checkProof } from "@/lib/services/challenges";
export const dynamic = "force-dynamic";
/** Create a handle, optionally linking a wallet with a signMessage proof. */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ handle: string; pubkey?: string; signature?: string }>(req);
  const h = String(body.handle ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("BAD_HANDLE", "Use 1 to 24 lowercase letters, digits or underscores.");
  const store = await getStore();
  const existing = await store.getUser(h);
  let pubkey = existing?.pubkey;
  let simulated = false;
  if (body.pubkey) {
    const proof = checkProof(isMock() ? "mock" : "live", bindMessage(h, body.pubkey), body.pubkey, body.signature, h);
    pubkey = proof.wallet;
    simulated = proof.simulated;
  }
  await store.upsertUser({ _id: h, pubkey, color: existing?.color ?? [...h].reduce((a, c) => a + c.charCodeAt(0), 0) % 6, createdAt: existing?.createdAt ?? Date.now() });
  return Response.json({ user: await store.getUser(h), simulated });
});
