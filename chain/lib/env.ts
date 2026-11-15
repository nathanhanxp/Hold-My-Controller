import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

/** Minimal .env loader for the worker (values already in the environment win). */
export function loadDotEnv() {
  for (const f of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env"), path.resolve(process.cwd(), "../web/.env.local")]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
    }
  }
}

/** The authority keypair lives in a gitignored file. Created on first run if missing (devnet only). */
export function authorityKeypair(): Keypair {
  const p = path.resolve(process.cwd(), "..", process.env.PLATFORM_AUTHORITY_KEYPAIR_PATH ?? "./chain/wallets.json");
  if (existsSync(p)) {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(Array.isArray(raw) ? raw : raw.authority));
  }
  const k = Keypair.generate();
  writeFileSync(p, JSON.stringify({ authority: Array.from(k.secretKey) }), { mode: 0o600 });
  console.log(`Created a new devnet authority keypair at ${p} (gitignored). Address: ${k.publicKey.toBase58()}`);
  return k;
}
