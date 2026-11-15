import { Keypair } from "@solana/web3.js";
import { sha256Hex } from "@forklab/engine";

/** Deterministic devnet demo wallets for the seeded authors. Public keys only are used; never fund real value. */
export function demoWallet(handle: string): string {
  const seed = Uint8Array.from(Buffer.from(sha256Hex(`forklab-demo-wallet:${handle}`), "hex"));
  return Keypair.fromSeed(seed).publicKey.toBase58();
}

export const SEED_HANDLES = ["mira", "theo", "ana", "kai", "lena", "omar", "jules", "rhea", "sol"] as const;

export function shortWallet(w?: string): string {
  return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : "no wallet";
}
