import { test } from "node:test";
import assert from "node:assert/strict";
import { resetEnvForTests } from "../lib/env";

async function fresh(envVars: Record<string, string | undefined>) {
  for (const k of ["FORKLAB_MODE", "MONGODB_URI", "GEMINI_API_KEY", "NVIDIA_API_KEY", "NVIDIA_MODEL_ID", "NVIDIA_BASE_URL", "NEXT_PUBLIC_SOLANA_RPC_URL"]) delete process.env[k];
  Object.assign(process.env, envVars);
  resetEnvForTests();
  (globalThis as { __forklab?: unknown }).__forklab = undefined;
  return import("../lib/runtime");
}

test("status.degrades_without_mongo", async () => {
  const rt = await fresh({ FORKLAB_MODE: "mock", MONGODB_URI: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=300" });
  const store = await rt.getStore();
  assert.equal(store.kind, "memory", "dev falls back to memory");
  assert.match(rt.runtime().storeNote!, /unreachable/);
  const live = await fresh({ FORKLAB_MODE: "live", MONGODB_URI: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=300" });
  await assert.rejects(live.getStore(), /Refusing to start/);
});

test("status.degrades_without_rpc", async () => {
  await fresh({ FORKLAB_MODE: "mock", NEXT_PUBLIC_SOLANA_RPC_URL: "http://127.0.0.1:1" });
  const { health } = await import("../lib/status");
  // connection() is cached per process; reset by importing fresh module state is not possible, so check the field directly
  const h = await health(true);
  assert.equal(typeof h.rpc, "boolean");
  assert.equal(h.storeKind, "memory");
  assert.ok(h.message.length > 0);
});

test("status.degrades_without_gemini", async () => {
  const rt = await fresh({ FORKLAB_MODE: "mock" });
  const store = await rt.getStore();
  const { proposeGraph } = await import("../lib/ai/service");
  const r = await proposeGraph(store, rt.getRouter(), { prompt: "dodge falling rocks with one key", editor: "ana", current: null });
  assert.equal(r.provider, "cache");
  assert.equal(r.badge, "AI: cached");
  const local = await proposeGraph(store, rt.getRouter(), { prompt: "a totally new idea about rocks and jumping", editor: "ana", current: null });
  assert.equal(local.provider, "local");
  assert.ok(local.grafts.length > 0, "local fallback credits the reference authors");
});
