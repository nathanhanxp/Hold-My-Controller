import { getStore, isMock } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
import { bindMessage, checkProof, submitReplay } from "@/lib/services/challenges";
import { RateLimiter } from "@/lib/ai/limits";
import { demoWallet } from "@/lib/wallets";
export const dynamic = "force-dynamic";
/** Replays are public so anyone can watch the top runs and re-verify scores. */
export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const list = await (await getStore()).replays(id);
  // public, so no wallet addresses
  return Response.json({ items: list.sort((a, b) => b.score - a.score).slice(0, 50).map(({ wallet, ...r }) => { void wallet; return r; }) });
});
type P = { params: Promise<{ id: string }> };
const g = globalThis as unknown as { __replayLimiter?: RateLimiter };
/** The server replays the script and records its own score. A client score is only compared, never stored. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  g.__replayLimiter ??= new RateLimiter(30, 2);
  const slot = g.__replayLimiter.tryAcquire();
  if (!slot.ok) return jsonError("RATE_LIMITED", "Too many replays at once. Try again shortly.", 429);
  try {
    const body = await readJson<{ player: string; wallet?: string; signature?: string; script: unknown; claimedScore?: number }>(req, 200_000);
    const player = String(body.player ?? "").toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(player)) return jsonError("BAD_HANDLE", "Pick a handle first.");
    const store = await getStore();
    const user = await store.getUser(player);
    let wallet = user?.pubkey;
    if (!wallet) {
      // a signed wallet binds the handle to it; without a signature the handle plays on its devnet demo wallet
      // (no wallet needed to post a score), and prize shares for it are paid there
      wallet = body.signature && body.wallet ? checkProof(isMock() ? "mock" : "live", bindMessage(player, body.wallet), body.wallet, body.signature, player).wallet : demoWallet(player);
      await store.upsertUser({ _id: player, pubkey: wallet, createdAt: Date.now() });
    }
    const r = await submitReplay(store, id, { player, wallet, script: body.script, claimedScore: body.claimedScore });
    return Response.json(r, { status: 201 });
  } finally {
    slot.release();
  }
});
