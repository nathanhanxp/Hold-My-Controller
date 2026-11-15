import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseRanks, recommendForGraph } from "../lib/recommend";
import { seeded } from "./helpers";

test("recommend.fuses_ranks", () => {
  const r = fuseRanks([
    { reason: "Built the same way", hashes: ["a", "b", "c"] },
    { reason: "Similar idea", hashes: ["c", "a"] },
  ], new Set());
  assert.equal(r[0].hash, "a");
  assert.equal(r[1].hash, "c");
  assert.ok(Math.abs(r[0].score - (1 / 61 + 1 / 62)) < 1e-12);
  assert.deepEqual(r[1].reasons.sort(), ["Built the same way", "Similar idea"]);
});

test("recommend.excludes_self_and_ancestors", async () => {
  const s = await seeded();
  const collect = (await s.listGraphs({})).find((g) => g.title === "Collect")!;
  const recs = await recommendForGraph(s, collect);
  const titles = recs.map((r) => r.doc.title);
  assert.ok(!titles.includes("Collect") && !titles.includes("Dodge") && !titles.includes("Jump"));
  assert.ok(recs.length > 0);
});

test("recommend.works_without_vector_search", async () => {
  const s = await seeded();
  const dodge = (await s.listGraphs({})).find((g) => g.title === "Dodge")!;
  s.similar = async () => { throw new Error("Atlas search index unavailable"); };
  const recs = await recommendForGraph(s, dodge);
  assert.ok(recs.length > 0, "lineage kin still recommends");
  assert.ok(recs.every((r) => r.reason === "From the same lineage" || r.reason === "Teams who forked this also forked"));
});

test("recommend.reason_per_item", async () => {
  const s = await seeded();
  const jump = (await s.listGraphs({})).find((g) => g.title === "Jump")!;
  for (const r of await recommendForGraph(s, jump)) assert.ok(r.reason.length > 0);
});
