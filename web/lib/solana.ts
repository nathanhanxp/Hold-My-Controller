import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/*
 * Client for programs/forklab. Instructions are encoded by hand with Anchor's layout
 * (8-byte sha256("global:<name>") discriminator + borsh args) so no generated IDL is needed at runtime.
 * Structure follows BlinkBounties src/lib/solana.ts: env, connection, PDA helpers, builders, decoders, withRpcRetry.
 */

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const PLACEHOLDER_PROGRAM_ID = "Fork1abXXWq9pVRLz5u4Ep6ufJmrcg9F4cY9Hy4F6Kj";

export function programId(): PublicKey {
  const id = process.env.NEXT_PUBLIC_PROGRAM_ID?.trim();
  try {
    return new PublicKey(id || PLACEHOLDER_PROGRAM_ID);
  } catch {
    return new PublicKey(PLACEHOLDER_PROGRAM_ID);
  }
}
export const programConfigured = () => !!process.env.NEXT_PUBLIC_PROGRAM_ID?.trim();
export const rpcUrl = () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";

let conn: Connection | null = null;
export function connection(): Connection {
  // We handle 429s ourselves (Night Watch chain.ts): no library retry storm.
  if (!conn) conn = new Connection(rpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: true });
  return conn;
}

export const MAX_AUTHORS = 8;
export const MAX_WINNERS = 12;

const disc = (ns: "global" | "account", name: string) => Buffer.from(sha256(utf8ToBytes(`${ns}:${name}`)).slice(0, 8));
export const ixDiscriminator = (name: string) => disc("global", name);
export const accountDiscriminator = (name: string) => disc("account", name);

class W {
  parts: Buffer[] = [];
  u8(v: number) { this.parts.push(Buffer.from([v & 0xff])); return this; }
  u16(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this.parts.push(b); return this; }
  u32(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.parts.push(b); return this; }
  u64(v: bigint | number) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.parts.push(b); return this; }
  i64(v: bigint | number) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); this.parts.push(b); return this; }
  bytes(b: Uint8Array) { this.parts.push(Buffer.from(b)); return this; }
  key(k: PublicKey) { return this.bytes(k.toBytes()); }
  done(prefix: Buffer) { return Buffer.concat([prefix, ...this.parts]); }
}

export function hashBytes(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("expected a 32-byte hex hash");
  return Buffer.from(hex, "hex");
}

export const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], programId())[0];
export const mechanicPda = (graphHash: string) => PublicKey.findProgramAddressSync([Buffer.from("mechanic"), hashBytes(graphHash)], programId())[0];
export const licensePda = (mechanic: PublicKey, buyer: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("license"), mechanic.toBuffer(), buyer.toBuffer()], programId())[0];
export function challengePda(challengeId: bigint): PublicKey {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(challengeId);
  return PublicKey.findProgramAddressSync([Buffer.from("challenge"), b], programId())[0];
}
/** Numeric on-chain id for a challenge doc id like "game-202646" or "ep-2". */
export function challengeNumericId(id: string): bigint {
  const m = /^game-(\d{6})$/.exec(id);
  if (m) return BigInt(m[1]);
  const e = /^ep-(\d+)$/.exec(id);
  if (e) return 1_000_000n + BigInt(e[1]);
  return BigInt(`0x${Buffer.from(sha256(utf8ToBytes(id))).subarray(0, 6).toString("hex")}`);
}

export function buildInitializeIx(authority: PublicKey, feeBps: number, feeWallet: PublicKey) {
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: configPda(), isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: new W().u16(feeBps).key(feeWallet).done(ixDiscriminator("initialize")),
  });
}

/**
 * Prices, pools and payouts are stored in token units: 1,000,000 units per token (every stored amount and hash
 * stays as it was). On devnet a token is worth 0.000001 SOL (1,000 lamports), so these convert units to the
 * lamports that actually move on-chain. Solana rejects a payment under about 0.0009 SOL to a wallet that has never
 * held SOL, so tiny on-chain payouts need recipients that already exist.
 */
export const UNITS_PER_TOKEN = 1_000_000;
export const LAMPORTS_PER_TOKEN = 1_000;
export const chainLamports = (units: number) => Math.floor((Math.max(0, units) * LAMPORTS_PER_TOKEN) / UNITS_PER_TOKEN);
export const unitsFromChain = (lamports: number | bigint) => Number(lamports) * (UNITS_PER_TOKEN / LAMPORTS_PER_TOKEN);

export function buildRegisterMechanicIx(authority: PublicKey, graphHash: string, parentHash: string | null, priceLamports: number, authors: Array<{ wallet: PublicKey; bps: number }>) {
  if (authors.length < 1 || authors.length > MAX_AUTHORS) throw new Error("1 to 8 authors");
  const w = new W().bytes(hashBytes(graphHash)).bytes(parentHash ? hashBytes(parentHash) : Buffer.alloc(32)).u64(chainLamports(priceLamports)).u32(authors.length);
  for (const a of authors) w.key(a.wallet).u16(a.bps);
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: configPda(), isSigner: false, isWritable: false },
      { pubkey: mechanicPda(graphHash), isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.done(ixDiscriminator("register_mechanic")),
  });
}

/** Keys in the order the program expects; author wallets appended as writable non-signers. */
export function buildLicenseIx(buyer: PublicKey, graphHash: string, feeWallet: PublicKey, authorWallets: PublicKey[]) {
  const mechanic = mechanicPda(graphHash);
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: configPda(), isSigner: false, isWritable: false },
      { pubkey: mechanic, isSigner: false, isWritable: true },
      { pubkey: licensePda(mechanic, buyer), isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: feeWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...authorWallets.map((w) => ({ pubkey: w, isSigner: false, isWritable: true })),
    ],
    data: ixDiscriminator("license"),
  });
}

export function buildCreateChallengeIx(creator: PublicKey, challengeId: bigint, kind: "episode" | "game", endsAt: number, maxWinners: number, poolLamports: number) {
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: challengePda(challengeId), isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: new W().u64(challengeId).u8(kind === "episode" ? 0 : 1).i64(Math.floor(endsAt / 1000)).u8(maxWinners).u64(chainLamports(poolLamports)).done(ixDiscriminator("create_challenge")),
  });
}

export function buildSettleIx(authority: PublicKey, challengeId: bigint, snapshotHash: string, payouts: Array<{ wallet: PublicKey; bps: number }>) {
  const w = new W().bytes(hashBytes(snapshotHash)).u32(payouts.length);
  for (const p of payouts) w.u16(p.bps);
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: configPda(), isSigner: false, isWritable: false },
      { pubkey: challengePda(challengeId), isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      ...payouts.map((p) => ({ pubkey: p.wallet, isSigner: false, isWritable: true })),
    ],
    data: w.done(ixDiscriminator("settle")),
  });
}

export function buildRefundIx(creator: PublicKey, challengeId: bigint) {
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: challengePda(challengeId), isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
    ],
    data: ixDiscriminator("refund"),
  });
}

export function memoIx(payload: Record<string, unknown>, signer?: PublicKey) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [],
    data: Buffer.from(JSON.stringify(payload), "utf8"),
  });
}

class R {
  o = 0;
  constructor(private readonly b: Buffer) {}
  u8() { return this.b.readUInt8(this.o++); }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  bytes(n: number) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return Buffer.from(v); }
  key() { return new PublicKey(this.bytes(32)); }
}

export type MechanicAccount = { graphHash: string; parentHash: string; priceLamports: bigint; authors: Array<{ wallet: string; bps: number }>; licenseCount: number; bump: number };
export function decodeMechanic(data: Buffer): MechanicAccount {
  if (!data.subarray(0, 8).equals(accountDiscriminator("Mechanic"))) throw new Error("not a Mechanic account");
  const r = new R(data);
  r.o = 8;
  const graphHash = r.bytes(32).toString("hex");
  const parentHash = r.bytes(32).toString("hex");
  const priceLamports = r.u64();
  const n = r.u32();
  const authors = Array.from({ length: n }, () => ({ wallet: r.key().toBase58(), bps: r.u16() }));
  return { graphHash, parentHash, priceLamports, authors, licenseCount: r.u32(), bump: r.u8() };
}

export type ConfigAccount = { authority: string; feeWallet: string; feeBps: number };
export function decodeConfig(data: Buffer): ConfigAccount {
  if (!data.subarray(0, 8).equals(accountDiscriminator("Config"))) throw new Error("not a Config account");
  const r = new R(data);
  r.o = 8;
  return { authority: r.key().toBase58(), feeWallet: r.key().toBase58(), feeBps: r.u16() };
}

export type ChallengeAccount = { challengeId: bigint; creator: string; kind: "episode" | "game"; endsAt: number; maxWinners: number; status: "open" | "settled" | "refunded"; snapshotHash: string };
export function decodeChallenge(data: Buffer): ChallengeAccount {
  if (!data.subarray(0, 8).equals(accountDiscriminator("Challenge"))) throw new Error("not a Challenge account");
  const r = new R(data);
  r.o = 8;
  const challengeId = r.u64();
  const creator = r.key().toBase58();
  const kind = r.u8() === 0 ? "episode" : "game";
  const endsAt = Number(r.i64()) * 1000;
  const maxWinners = r.u8();
  const status = (["open", "settled", "refunded"] as const)[r.u8()] ?? "open";
  return { challengeId, creator, kind, endsAt, maxWinners, status, snapshotHash: r.bytes(32).toString("hex") };
}

export function isRateLimitError(e: unknown): boolean {
  const m = (e as Error)?.message?.toLowerCase() ?? "";
  return m.includes("429") || m.includes("too many requests") || m.includes("rate limit");
}

/** Retry on 429 only (BlinkBounties withRpcRetry), with a doubling delay. */
export async function withRpcRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseMs = 400): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= maxRetries) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
}

export async function fetchConfig(): Promise<ConfigAccount | null> {
  const info = await withRpcRetry(() => connection().getAccountInfo(configPda()));
  return info ? decodeConfig(info.data) : null;
}
export async function fetchMechanic(graphHash: string): Promise<MechanicAccount | null> {
  const info = await withRpcRetry(() => connection().getAccountInfo(mechanicPda(graphHash)));
  return info ? decodeMechanic(info.data) : null;
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const isSimulatedSig = (sig?: string) => !sig || sig.startsWith("SIMULATED");
