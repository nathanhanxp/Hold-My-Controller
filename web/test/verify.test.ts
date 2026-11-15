import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLineage, type VerifyRecord } from "../lib/verify";
import { seeded } from "./helpers";

async function records(tamper = false, dropFirst = false) {
  const s = await seeded();
  const collect = (await s.listGraphs({})).find((g) => g.title === "Collect")!;
  const { ancestors } = await s.lineage(collect._id);
  const docs = [...ancestors, collect];
  const recs: VerifyRecord[] = docs.map((d) => ({ hash: d._id, title: d.title, graph: structuredClone(d.graph), anchorSig: `REAL-${d._id.slice(0, 8)}`, anchorStatus: "confirmed", shares: d.shares, paid: false }));
  if (tamper) recs[1].graph.nodes[0].params = { ...recs[1].graph.nodes[0].params, x: 1 };
  const memo = async (sig: string) => {
    const d = docs.find((x) => `REAL-${x._id.slice(0, 8)}` === sig)!;
    return { app: "forklab", kind: "publish", graph: d._id, prev: d.parentId ?? "" };
  };
  return { recs: dropFirst ? recs.slice(1) : recs, memo, chain: docs.map((d) => d._id) };
}

test("verify.detects_tampered_graph", async () => {
  const good = await records();
  assert.ok((await verifyLineage(good.recs, { memo: good.memo })).every((r) => r.ok));
  const bad = await records(true);
  const rows = await verifyLineage(bad.recs, { memo: bad.memo });
  assert.equal(rows[1].ok, false);
  assert.match(rows[1].note, /changed after it was published/);
  assert.equal(rows[2].ok, false, "descendant of a changed graph fails too");
});

test("verify.detects_missing_ancestor", async () => {
  const r = await records(false, true);
  const rows = await verifyLineage(r.recs, { memo: r.memo }, r.chain);
  assert.ok(rows.some((x) => !x.ok && /missing/.test(x.note)));
});

test("verify.simulated_anchor_is_labelled", async () => {
  const r = await records();
  r.recs[0].anchorSig = "SIMULATED-abc";
  const rows = await verifyLineage(r.recs, { memo: r.memo });
  assert.match(rows[0].note, /Matches/);
});
