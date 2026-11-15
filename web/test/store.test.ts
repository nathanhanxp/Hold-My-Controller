import { test } from "node:test";
import assert from "node:assert/strict";
import { forkGraph, graphHash } from "@forklab/engine";
import { MemoryStore } from "../lib/store/memory";
import { publishGraph, ApiError } from "../lib/services/publish";
import { loadEnv } from "../lib/env";
import { deps, seeded } from "./helpers";

test("store.memory_roundtrip", async () => {
  const s = await seeded();
  const all = await s.listGraphs({ kind: "mechanic" });
  assert.ok(all.length >= 6);
  const d = all[0];
  assert.deepEqual(await s.getGraph(d._id), d);
  const got = (await s.getGraph(d._id))!;
  got.title = "mutated";
  assert.notEqual((await s.getGraph(d._id))!.title, "mutated", "returns copies");
  assert.equal(graphHash(d.graph), d._id);
});

test("store.fails_fast_in_live", () => {
  assert.throws(() => loadEnv({ FORKLAB_MODE: "live" }), /Live mode needs MONGODB_URI/);
  assert.doesNotThrow(() => loadEnv({ FORKLAB_MODE: "mock" }));
});

test("api.publish_duplicate_rejected", async () => {
  const s = await seeded();
  const dodge = (await s.listGraphs({})).find((g) => g.title === "Dodge")!;
  await assert.rejects(publishGraph(deps(s), { draft: { ...dodge.graph }, author: "theo" }), (e: unknown) => e instanceof ApiError && e.code === "DUPLICATE" && e.status === 409);
});

test("api.fork_keeps_authors", async () => {
  const s = await seeded();
  const [jump] = await s.listGraphs({ q: "Jump", sort: "new" }).then((l) => l.filter((g) => g.title === "Jump"));
  const draft = forkGraph(jump.graph, jump._id);
  draft.title = "Jump higher";
  draft.nodes.find((n) => n.id === "n07")!.params.vy = 330; // param tweak
  draft.nodes.push({ id: "z1", type: "OnTick", params: { everyN: 120 }, authorId: "whoever", originFork: "" }, { id: "z2", type: "AddScore", params: { n: 3 }, authorId: "whoever", originFork: "" });
  draft.edges.push({ from: { node: "z1", port: "out" }, to: { node: "z2", port: "in" }, kind: "exec" });
  const doc = await publishGraph(deps(s), { draft, author: "ana" });
  assert.equal(doc.graph.nodes.find((n) => n.id === "n07")!.authorId, "mira");
  assert.equal(doc.graph.nodes.find((n) => n.id === "z1")!.authorId, "ana", "client-claimed author is overwritten");
  assert.deepEqual(doc.shares.map((x) => x.handle), ["mira", "ana"]);
  assert.equal(doc.shares.reduce((a, b) => a + b.bps, 0), 10_000);
  assert.ok(doc.shares.every((x) => x.wallet));
  assert.equal((await s.getGraph(jump._id))!.stats.forks, jump.stats.forks + 1);
});

test("api.lineage_descendants", async () => {
  const s = await seeded();
  const jump = (await s.listGraphs({})).find((g) => g.title === "Jump")!;
  const collect = (await s.listGraphs({})).find((g) => g.title === "Collect")!;
  const { descendants } = await s.lineage(jump._id);
  assert.ok(descendants.some((d) => d.title === "Dodge") && descendants.some((d) => d.title === "Collect") && descendants.some((d) => d.title === "Gust"));
  const { ancestors } = await s.lineage(collect._id);
  assert.deepEqual(ancestors.map((a) => a.title), ["Jump", "Dodge"]);
});

test("api.paid_pays_unlinked_authors_to_their_demo_wallet", async () => {
  const s = new MemoryStore();
  const g = (await seeded()).graphs.values().next().value!.graph;
  const draft = { ...structuredClone(g), parent: null, root: "", license: { type: "paid" as const, priceLamports: 1000 }, nodes: g.nodes.map((n) => ({ ...n, originFork: "" })) };
  const doc = await publishGraph(deps(s), { draft, author: "nowallet" });
  const { demoWallet } = await import("../lib/wallets");
  assert.ok(doc.shares.every((x) => x.wallet === demoWallet(x.handle) && x.demoWallet));
});
