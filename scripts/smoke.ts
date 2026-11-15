// End-to-end smoke test against a running server. Exits non-zero on any failure.
//   SMOKE_URL=http://localhost:3000 npm run smoke
// Publishes a fork, checks lineage and attribution, licenses (Simulated in mock mode), verifies the lineage hashes,
// asks for recommendations, posts a replay-verified game score, and settles an ended game.
import { graphHash, KEYS, type Graph } from "@forklab/engine";
import { verifyLineage } from "../web/lib/verify";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
let failures = 0;
async function step<T>(name: string, f: () => Promise<T>): Promise<T | undefined> {
  const t = Date.now();
  try {
    const v = await f();
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
    return v;
  } catch (e) {
    failures += 1;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
    return undefined;
  }
}
async function j<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" }, body: init?.json !== undefined ? JSON.stringify(init.json) : undefined });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
  return body as T;
}
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

async function main() {
  const health = await step("health", () => j<{ mode: string; storeKind: string; programConfigured: boolean }>("/api/health"));
  const list = await step("list mechanics", () => j<{ items: Array<{ _id: string; title: string; licenseType: string }> }>("/api/mechanics?sort=forks"));
  const dodge = list?.items.find((m) => m.title === "Dodge");
  const paid = list?.items.find((m) => m.licenseType === "paid");
  const forked = await step("fork and publish", async () => {
    const { draft } = await j<{ draft: Graph }>(`/api/mechanics/${dodge!._id}/fork`, { method: "POST" });
    draft.title = `Smoke ${Date.now().toString(36)}`;
    const n = draft.nodes.find((x) => x.id === "n10")!;
    n.params.everyN = 30 + Math.floor(Math.random() * 60);
    draft.nodes.push({ id: `s${Date.now().toString(36).slice(-4)}`, type: "OnTick", params: { everyN: 97 }, authorId: "x", originFork: "" });
    const r = await j<{ mechanic: { _id: string; shares: Array<{ handle: string; bps: number }>; graph: Graph } }>("/api/mechanics", { method: "POST", json: { graph: draft, author: "smoke" } });
    assert(graphHash(r.mechanic.graph) === r.mechanic._id, "hash recomputes");
    assert(r.mechanic.shares.reduce((s, x) => s + x.bps, 0) === 10_000, "shares sum to 10000");
    assert(r.mechanic.shares.some((s) => s.handle === "mira") && r.mechanic.shares.some((s) => s.handle === "smoke"), "original authors kept");
    return r.mechanic;
  });
  await step("duplicate publish rejected", async () => {
    const r = await fetch(`${BASE}/api/mechanics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph: forked!.graph, author: "smoke" }) });
    assert(r.status === 409, `expected 409, got ${r.status}`);
  });
  await step("lineage", async () => {
    const r = await j<{ ancestors: Array<{ title: string }> }>(`/api/mechanics/${forked!._id}/lineage`);
    assert(r.ancestors.map((a) => a.title).join(">") === "Jump>Dodge", "ancestors Jump>Dodge");
  });
  if (health?.mode === "mock" || !health?.programConfigured) {
    await step("license (Simulated)", async () => {
      const r = await j<{ license: { split: unknown[]; simulated: boolean } }>(`/api/mechanics/${paid!._id}/license-sim`, { method: "POST", json: { buyerHandle: `smoke${Date.now()}` } });
      assert(r.license.simulated && r.license.split.length === 3, "paid 3 contributors");
    });
  } else console.log("skip license: live mode licenses through a wallet; run the browser flow");
  await step("verify lineage", async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const rec = await j<{ records: Parameters<typeof verifyLineage>[0]; expectedChain: string[] }>(`/api/receipts/${paid!._id}`);
    const rows = await verifyLineage(rec.records, { memo: async () => null }, rec.expectedChain);
    assert(rows.every((r) => r.ok || /Not anchored/.test(r.note)), rows.map((r) => r.note).join(" | "));
  });
  await step("recommendations", async () => {
    const r = await j<{ items: Array<{ reason: string }> }>(`/api/mechanics/${dodge!._id}/similar`);
    assert(r.items.length > 0 && r.items.every((i) => i.reason), "has reasons");
  });
  await step("describe search", async () => {
    const r = await j<{ items: Array<{ title: string }> }>(`/api/search?scope=mechanics&mode=describe&q=${encodeURIComponent("dodge falling rocks with one key")}`);
    assert(r.items.slice(0, 3).some((i) => i.title === "Dodge" || i.title === "Temple"), "finds Dodge by description");
  });
  await step("AI proposal (any provider)", async () => {
    const r = await j<{ provider: string; graph: Graph }>("/api/ai/graph", { method: "POST", json: { prompt: "dodge falling rocks with one key", editor: "smoke" } });
    assert(r.graph.nodes.length > 0, "graph has nodes");
    console.log(`     provider: ${r.provider}`);
  });
  await step("replay-verified game score", async () => {
    const g = await j<{ challenge: { _id: string; minigame: { mechanicHash: string; seed: number } } }>("/api/games/current");
    const SPACE = 1 << KEYS.indexOf("Space");
    const script = { graphHash: g.challenge.minigame.mechanicHash, seed: g.challenge.minigame.seed, ticks: 1200, inputs: [[15, SPACE], [16, 0], [Math.floor(Math.random() * 400) + 50, SPACE], [500, 0]] };
    const player = `smoke${Date.now().toString(36)}`;
    const kp = Keypair.generate();
    const wallet = kp.publicKey.toBase58();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`ForkLab devnet: link wallet ${wallet} to @${player}`), kp.secretKey));
    const r = await j<{ score: number; forgedClaimRejected: boolean }>(`/api/challenges/${g.challenge._id}/replays`, { method: "POST", json: { player, wallet, signature, script, claimedScore: 99999 } });
    assert(r.forgedClaimRejected && r.score !== 99999, "forged claim rejected");
  });
  {
    await step("settle an ended game", async () => {
      const { items } = await j<{ items: Array<{ _id: string; kind: string; endsAt: number; prize: { status: string } }> }>("/api/challenges");
      const ended = items.find((c) => c.kind === "game" && c.endsAt < Date.now() && c.prize.status === "open");
      if (!ended) { console.log("     nothing to settle (already settled)"); return; }
      const res = await fetch(`${BASE}/api/challenges/${ended._id}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.status === 403) { console.log("     settle is authority-only here (set ALLOW_CHAOS=1 or ADMIN_TOKEN)"); return; }
      const r = (await res.json()) as { challenge: { prize: { status: string; payouts: Array<{ bps: number }> } } };
      assert(r.challenge.prize.status === "settled" && r.challenge.prize.payouts.reduce((s, p) => s + p.bps, 0) === 10_000, "settled, sums to 10000");
    });
  }
  await step("status page", async () => {
    const r = await j<{ deps: Array<{ name: string }> }>("/api/status");
    assert(r.deps.length >= 6, "deps listed");
  });
  console.log(failures ? `\n${failures} step(s) failed` : "\nAll smoke steps passed");
  process.exit(failures ? 1 : 0);
}
main();
