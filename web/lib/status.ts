import { env } from "./env";
import { getRouter, getStore, runtime } from "./runtime";
import { connection, configPda, programConfigured } from "./solana";
import { nemotronBaseUrlOk } from "./ai/nemotron";
import type { MongoStore } from "./store/mongo";

export type DepStatus = { name: string; ok: boolean; level: "ok" | "degraded" | "down"; detail: string; checkedAt: number };

async function timed<T>(f: () => Promise<T>, ms: number): Promise<{ v?: T; ms: number; err?: string }> {
  const t = Date.now();
  try {
    const v = await Promise.race([f(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    return { v, ms: Date.now() - t };
  } catch (e) {
    return { ms: Date.now() - t, err: (e as Error).message };
  }
}

export type Health = { mode: "live" | "mock"; programConfigured: boolean; store: string; storeKind: "memory" | "mongo" | "down"; rpc: boolean; rpcMs?: number; gemini: boolean; nemotron: boolean; chaos: boolean; message: string };

/** Header badge. Cheap: one RPC call with a short timeout. */
export async function health(rpcCheck = true): Promise<Health> {
  const e = env();
  const rt = runtime();
  let storeKind: Health["storeKind"] = "down";
  try {
    storeKind = (await getStore()).kind;
  } catch { /* down */ }
  const rpc = rpcCheck ? await timed(() => connection().getSlot(), 2500) : { ms: 0, err: "skipped" };
  const gemini = !!e.GEMINI_API_KEY && !rt.chaosGemini;
  const nemotron = !!e.NVIDIA_API_KEY && !!e.NVIDIA_MODEL_ID && nemotronBaseUrlOk(e.NVIDIA_BASE_URL);
  let message = e.FORKLAB_MODE === "mock" ? "Mock mode, devnet receipts are Simulated" : "Live, devnet";
  if (storeKind === "memory" && e.FORKLAB_MODE === "live") message = "Database unavailable: using memory";
  else if (storeKind === "memory" && e.MONGODB_URI) message = "Database unreachable: using memory";
  if (e.FORKLAB_MODE === "live" && rpc.err) message = "Chain unavailable: receipts will anchor later";
  return { mode: e.FORKLAB_MODE, programConfigured: programConfigured(), store: rt.storeNote ?? storeKind, storeKind, rpc: !rpc.err, rpcMs: rpc.err ? undefined : rpc.ms, gemini, nemotron, chaos: rt.chaosGemini, message };
}

export async function fullStatus() {
  const e = env();
  const rt = runtime();
  const now = Date.now();
  const deps: DepStatus[] = [];
  let store;
  try {
    store = await getStore();
    deps.push({ name: "Store", ok: true, level: store.kind === "mongo" || e.FORKLAB_MODE === "mock" ? "ok" : "degraded", detail: rt.storeNote ?? store.kind, checkedAt: now });
  } catch (err) {
    deps.push({ name: "Store", ok: false, level: "down", detail: (err as Error).message, checkedAt: now });
  }
  const rpc = await timed(() => connection().getSlot(), 3000);
  deps.push({ name: "Solana RPC (devnet)", ok: !rpc.err, level: rpc.err ? (e.FORKLAB_MODE === "mock" ? "degraded" : "down") : "ok", detail: rpc.err ? `Unreachable (${rpc.err}). License and settle wait; everything else works.` : `Reachable, ${rpc.ms} ms`, checkedAt: now });
  let programDetail = "NEXT_PUBLIC_PROGRAM_ID not set: chain actions are Simulated.";
  let programOk = false;
  if (programConfigured() && !rpc.err) {
    const info = await timed(() => connection().getAccountInfo(configPda()), 3000);
    programOk = !!info.v;
    programDetail = info.v ? "Program deployed, Config initialized." : "Config account not found. Run the initialize step.";
  }
  deps.push({ name: "Anchor program", ok: programOk, level: programOk ? "ok" : "degraded", detail: programDetail, checkedAt: now });
  const router = getRouter();
  const gemLast = router.lastResult["gemini"];
  deps.push({
    name: "Gemini", ok: !!e.GEMINI_API_KEY && !rt.chaosGemini && router.breaker.state === "closed",
    level: !e.GEMINI_API_KEY || rt.chaosGemini || router.breaker.state === "open" ? "degraded" : "ok",
    detail: `${e.GEMINI_API_KEY ? "Key present" : "No key"}; breaker ${router.breaker.state.replace("_", "-")}${rt.chaosGemini ? "; simulated outage on" : ""}${gemLast ? `; last result ${gemLast.outcome}` : ""}`, checkedAt: now,
  });
  const nemOk = !!e.NVIDIA_API_KEY && !!e.NVIDIA_MODEL_ID && nemotronBaseUrlOk(e.NVIDIA_BASE_URL);
  const nemLast = router.lastResult["nemotron"];
  deps.push({ name: "Nemotron (fallback)", ok: nemOk, level: nemOk ? "ok" : "degraded", detail: `${nemOk ? "Key and https base URL present" : "Not configured"}${nemLast ? `; last result ${nemLast.outcome}` : ""}. Fixtures and local answers cover the demo prompts.`, checkedAt: now });
  let vs = "Brute-force cosine (memory store)";
  if (store?.kind === "mongo") {
    const m = store as unknown as MongoStore;
    vs = m.vectorSearchOk === null ? "Not queried yet" : m.vectorSearchOk ? "Atlas Vector Search reachable" : "Atlas Vector Search failed: brute-force fallback";
  }
  deps.push({ name: "Vector search", ok: true, level: vs.includes("failed") ? "degraded" : "ok", detail: vs, checkedAt: now });
  const pending = store ? (await store.pendingAnchors()).length : 0;
  // the usual reason anchors wait: the signing account ran out of devnet SOL (the faucet is rate limited)
  let broke = false;
  if (pending && store?.kind === "mongo" && !rpc.err) {
    const { loadAuthority } = await import("./services/chain-server");
    const kp = loadAuthority();
    if (kp) { const bal = await timed(() => connection().getBalance(kp.publicKey), 3000); broke = bal.v !== undefined && bal.v !== null && Number(bal.v) < 5_000_000; }
  }
  deps.push({
    name: "Chain worker queue", ok: pending < 20 && !broke, level: pending < 20 && !broke ? "ok" : "degraded",
    detail: broke
      ? `${pending} publish${pending === 1 ? "" : "es"} waiting: the signing account is out of devnet SOL. Fund it from the Solana devnet faucet; anchoring resumes on its own. Games still publish and play; their on-chain receipts wait.`
      : `${pending} publish${pending === 1 ? "" : "es"} waiting to anchor${rt.lastAnchor ? "; anchoring is running" : ""}`,
    checkedAt: now,
  });
  deps.push({ name: "Weekly settle job", ok: true, level: "ok", detail: rt.lastWeeklySettle ? `Last run ${new Date(rt.lastWeeklySettle.at).toISOString()} for ${rt.lastWeeklySettle.id}` : "Not run in this process yet (runs hourly on the server).", checkedAt: now });
  return { mode: e.FORKLAB_MODE, deps, chaosAllowed: e.ALLOW_CHAOS === "1", chaosGemini: rt.chaosGemini, uptimeMs: now - rt.startedAt, testCount: readTestCount() };
}

function readTestCount(): number | null {
  try {
    // written by `npm run check` (scripts/count-tests.ts)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const p = require("node:path") as typeof import("node:path");
    for (const f of [p.resolve(process.cwd(), "..", ".test-count.json"), p.resolve(process.cwd(), ".test-count.json")]) {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).total ?? null;
    }
  } catch { /* none */ }
  return null;
}
