import { ACTIONS_CORS_HEADERS, createActionHeaders, createPostResponse, type ActionGetResponse, type ActionPostRequest } from "@solana/actions";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getStore } from "@/lib/runtime";
import { env } from "@/lib/env";
import { chainLamports, buildLicenseIx, connection, fetchConfig, programConfigured, withRpcRetry } from "@/lib/solana";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };
const headers = () => createActionHeaders({ headers: ACTIONS_CORS_HEADERS, chainId: "devnet", actionVersion: "2.1" });
const err = (message: string, status = 400) => Response.json({ message }, { status, headers: headers() });
const sol = (units: number) => (chainLamports(units) / 1e9).toFixed(9).replace(/\.?0+$/, "");

export async function GET(_req: Request, { params }: P) {
  const { hash } = await params;
  const d = await (await getStore()).getGraph(hash);
  if (!d) return err("Mechanic not found.", 404);
  const app = env().NEXT_PUBLIC_APP_URL;
  const paid = d.license.type === "paid";
  const price = d.license.type === "paid" ? d.license.priceLamports : 0;
  const payload: ActionGetResponse = {
    type: "action",
    icon: `${app}/api/thumb/${hash}`,
    title: paid ? `${d.title} by @${d.authorId} · ${sol(price)} SOL` : `${d.title} by @${d.authorId} · free to fork`,
    description: paid ? `${d.changelog ?? ""} Devnet only. One payment is split between every author of the mechanic's nodes.`.trim() : `Free to fork. Open ${app}/m/${hash} to play and fork it.`,
    label: paid ? `License for ${sol(price)} SOL` : "Free to fork",
    disabled: !paid || !programConfigured(),
    links: paid ? { actions: [{ type: "transaction", href: `${app}/api/actions/mechanic/${hash}`, label: `License for ${sol(price)} SOL (devnet)` }] } : undefined,
  };
  return Response.json(payload, { headers: headers() });
}

export async function OPTIONS() {
  return new Response(null, { headers: headers() });
}

/** Build the license transaction for body.account (fee payer is the buyer, fresh blockhash). */
export async function POST(req: Request, { params }: P) {
  const { hash } = await params;
  if (!programConfigured()) return err("The license program is not deployed in this environment.", 503);
  const d = await (await getStore()).getGraph(hash);
  if (!d) return err("Mechanic not found.", 404);
  if (d.license.type !== "paid") return err("This mechanic is free to fork.", 409);
  let body: ActionPostRequest;
  try { body = (await req.json()) as ActionPostRequest; } catch { return err("Invalid POST body."); }
  let buyer: PublicKey;
  try { buyer = new PublicKey(body.account); } catch { return err("Invalid wallet account."); }
  const cfg = await fetchConfig().catch(() => null);
  if (!cfg) return err("Program config not found on devnet.", 503);
  if (d.shares.some((s) => !s.wallet)) return err("An author has no wallet linked.", 409);
  const ix = buildLicenseIx(buyer, hash, new PublicKey(cfg.feeWallet), d.shares.map((s) => new PublicKey(s.wallet!)));
  const { blockhash, lastValidBlockHeight } = await withRpcRetry(() => connection().getLatestBlockhash("confirmed"));
  const tx = new Transaction({ feePayer: buyer, blockhash, lastValidBlockHeight }).add(ix);
  const payload = await createPostResponse({ fields: { type: "transaction", transaction: tx, message: `License ${d.title} (devnet). Pays ${d.shares.length} author${d.shares.length === 1 ? "" : "s"}.` } });
  return Response.json(payload, { headers: headers() });
}
