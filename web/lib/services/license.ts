import { PublicKey } from "@solana/web3.js";
import type { GraphDoc, LicenseDoc, Store } from "../store/types";
import { ApiError } from "./publish";
import { connection, mechanicPda, programId, withRpcRetry } from "../solana";
import { demoWallet } from "../wallets";
import { DuplicateError } from "../store/types";

export const MOCK_FEE_BPS = 500;

/** Same math as the program: fee first, then each author's share of the pool, remainder to the first author. */
export function licenseSplit(priceLamports: number, feeBps: number, shares: Array<{ handle: string; wallet?: string; bps: number }>) {
  const fee = Math.floor((priceLamports * feeBps) / 10_000);
  const pool = priceLamports - fee;
  const amounts = shares.map((s) => Math.floor((pool * s.bps) / 10_000));
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (amounts.length) amounts[0] += pool - sum;
  return { fee, split: shares.map((s, i) => ({ handle: s.handle, wallet: s.wallet ?? demoWallet(s.handle), lamports: amounts[i] })) };
}

export async function recordSimulatedLicense(store: Store, d: GraphDoc, buyer: string, buyerHandle?: string): Promise<LicenseDoc> {
  if (d.license.type !== "paid") throw new ApiError("FREE_MECHANIC", "This mechanic is free to fork. Nothing to license.");
  const { fee, split } = licenseSplit(d.license.priceLamports, MOCK_FEE_BPS, d.shares);
  const doc: LicenseDoc = { _id: `lic-${d._id.slice(0, 12)}-${buyer.slice(0, 8)}-${Date.now().toString(36)}`, graphId: d._id, buyer, buyerHandle, sig: `SIMULATED-license-${Date.now().toString(36)}`, priceLamports: d.license.priceLamports, simulated: true, split, feeLamports: fee, createdAt: Date.now() };
  await save(store, d, doc);
  return doc;
}

/** Live: confirm the buyer's transaction on devnet and that it touched this mechanic's PDA through our program. */
export async function recordDevnetLicense(store: Store, d: GraphDoc, buyer: string, sig: string, feeBps: number, buyerHandle?: string): Promise<LicenseDoc> {
  if (d.license.type !== "paid") throw new ApiError("FREE_MECHANIC", "This mechanic is free to fork.");
  const tx = await withRpcRetry(() => connection().getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }));
  if (!tx) throw new ApiError("TX_NOT_FOUND", "Transaction not found on devnet yet. Try again in a few seconds.", 404);
  if (tx.meta?.err) throw new ApiError("TX_FAILED", "The license transaction failed on devnet.", 409);
  const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  if (!keys.includes(programId().toBase58()) || !keys.includes(mechanicPda(d._id).toBase58()) || !keys.includes(new PublicKey(buyer).toBase58())) {
    throw new ApiError("TX_MISMATCH", "That transaction did not license this mechanic.", 409);
  }
  const { fee, split } = licenseSplit(d.license.priceLamports, feeBps, d.shares);
  const doc: LicenseDoc = { _id: sig, graphId: d._id, buyer, buyerHandle, sig, priceLamports: d.license.priceLamports, simulated: false, split, feeLamports: fee, createdAt: Date.now() };
  await save(store, d, doc);
  return doc;
}

/**
 * Simulated license at any price (paid with tokens, or the demo "someone licenses your game"). Same split as the
 * program: fee first, then each creator by their share of the blocks. Always labelled Simulated.
 */
export async function recordTokenLicense(store: Store, d: GraphDoc, buyerHandle: string, priceLamports: number, demo = false): Promise<LicenseDoc> {
  const { fee, split } = licenseSplit(priceLamports, MOCK_FEE_BPS, d.shares);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // a demo sale is a fresh pretend buyer every time (one license per buyer per game), so it can repeat
  const buyer = demo ? demoWallet(`demo-sale:${buyerHandle}:${stamp}`) : demoWallet(buyerHandle);
  const doc: LicenseDoc = { _id: `lic-${d._id.slice(0, 12)}-${buyerHandle}-${stamp}`, graphId: d._id, buyer, buyerHandle, sig: `SIMULATED-${demo ? "demo" : "tokens"}-${stamp}`, priceLamports, simulated: true, split, feeLamports: fee, createdAt: Date.now() };
  await save(store, d, doc);
  return doc;
}

async function save(store: Store, d: GraphDoc, doc: LicenseDoc) {
  try {
    await store.recordLicense(doc);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DOUBLE_LICENSE", e.message, 409);
    throw e;
  }
  await store.bumpStat(d._id, "licenses");
  await store.log({ kind: "license", text: `${doc.buyerHandle ? `@${doc.buyerHandle}` : "Someone"} licensed ${d.title} for ${Math.round(doc.priceLamports / 1e6)} tokens, paid ${doc.split.length} contributor${doc.split.length === 1 ? "" : "s"}${doc.simulated ? " (Simulated)" : ""}`, ref: d._id, at: Date.now() });
}
