// Creates MongoDB indexes and the three Atlas Vector Search indexes (PLAN.md 6.2).
//   MONGODB_URI=... npx tsx scripts/create-indexes.ts
import { MongoClient } from "mongodb";
import { STRUCTURE_DIM } from "@forklab/engine";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI.");
  const dim = Number(process.env.EMBED_DIM ?? 768);
  const client = await MongoClient.connect(uri);
  const db = client.db(process.env.MONGODB_DB ?? "forklab");
  const graphs = db.collection("graphs");
  const assets = db.collection("assets");
  await Promise.all([
    graphs.createIndex({ parentId: 1 }), graphs.createIndex({ rootId: 1 }), graphs.createIndex({ tags: 1 }), graphs.createIndex({ createdAt: -1 }),
    graphs.createIndex({ assetRefs: 1 }), graphs.createIndex({ title: "text", tags: "text" }), assets.createIndex({ title: "text", tags: "text" }),
    db.collection("licenses").createIndex({ graphId: 1 }), db.collection("licenses").createIndex({ graphId: 1, buyer: 1 }, { unique: true }),
    db.collection("votes").createIndex({ "_id.graphId": 1 }), db.collection("challenges").createIndex({ kind: 1, endsAt: -1 }),
    db.collection("entries").createIndex({ challengeId: 1 }), db.collection("replays").createIndex({ challengeId: 1, score: -1 }),
  ]);
  console.log("Regular indexes ready.");
  const filters = (extra: string[]) => extra.map((path) => ({ type: "filter", path }));
  const specs = [
    { coll: graphs, name: "graphs_structure", fields: [{ type: "vector", path: "structure", numDimensions: STRUCTURE_DIM, similarity: "cosine" }, ...filters(["kind", "licenseType", "tags"])] },
    { coll: graphs, name: "graphs_semantic", fields: [{ type: "vector", path: "semantic", numDimensions: dim, similarity: "cosine" }, ...filters(["kind", "licenseType", "tags"])] },
    { coll: assets, name: "assets_semantic", fields: [{ type: "vector", path: "semantic", numDimensions: dim, similarity: "cosine" }, ...filters(["kind", "tags"])] },
  ];
  for (const s of specs) {
    try {
      // recreate when the definition changed (for example the structure vector grew with the node catalog)
      const have = (await s.coll.listSearchIndexes(s.name).toArray()) as Array<{ latestDefinition?: { fields?: Array<{ numDimensions?: number }> } }>;
      const dims = have[0]?.latestDefinition?.fields?.[0]?.numDimensions;
      const want = (s.fields[0] as { numDimensions: number }).numDimensions;
      if (have.length && dims !== want) { await s.coll.dropSearchIndex(s.name); console.log(`Dropped ${s.name} (${dims} -> ${want} dimensions)`); await new Promise((r) => setTimeout(r, 4000)); }
      else if (have.length) { console.log(`${s.name} is up to date.`); continue; }
      await s.coll.createSearchIndex({ name: s.name, type: "vectorSearch", definition: { fields: s.fields } } as never);
      console.log(`Created ${s.name} (it takes a minute to build).`);
    } catch (e) {
      console.log(`${s.name}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  await client.close();
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
