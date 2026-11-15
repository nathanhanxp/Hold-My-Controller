import { MongoClient, type Db, type Document } from "mongodb";
import { bruteForceSimilar, trendScore } from "./memory";
import { DuplicateError, type ActivityDoc, type AssetDoc, type AssetQuery, type ChallengeDoc, type EntryDoc, type GraphDoc, type LicenseDoc, type ListQuery, type ReplayDoc, type SnapshotDoc, type Store, type TeamDoc, type User } from "./types";

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function textFilter(q?: string): Document {
  if (!q) return {};
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  return { $and: words.map((w) => ({ $or: [{ title: { $regex: esc(w), $options: "i" } }, { tags: { $regex: esc(w), $options: "i" } }, { authorId: { $regex: esc(w), $options: "i" } }] })) };
}

/** MongoDB Atlas store. Pings at construction so a bad URI fails fast (nuero-grip store.py pattern). */
export class MongoStore implements Store {
  readonly kind = "mongo" as const;
  vectorSearchOk: boolean | null = null;

  private constructor(private readonly db: Db) {}

  static async connect(uri: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return new MongoStore(client.db(dbName));
  }

  private get g() { return this.db.collection<GraphDoc>("graphs"); }
  private get a() { return this.db.collection<AssetDoc>("assets"); }

  async getGraph(hash: string) { return this.g.findOne({ _id: hash }); }
  async putGraph(doc: GraphDoc) {
    try { await this.g.insertOne(doc); } catch (e) { if (isDup(e)) throw new DuplicateError("This exact graph is already published."); throw e; }
  }
  async updateGraph(hash: string, patch: Partial<GraphDoc>) { await this.g.updateOne({ _id: hash }, { $set: patch }); }
  async listGraphs(q: ListQuery) {
    const filter: Document = { ...textFilter(q.q) };
    if (q.kind) filter.kind = q.kind;
    if (q.license) filter.licenseType = q.license;
    if (q.tag) filter.tags = q.tag;
    if (q.author) filter.authorId = q.author;
    const sort: Document = q.sort === "forks" ? { "stats.forks": -1, createdAt: -1 } : { createdAt: -1 };
    const list = await this.g.find(filter).sort(sort).limit(q.sort === "trending" ? 200 : q.limit ?? 60).toArray();
    if (q.sort === "trending") list.sort((x, y) => trendScore(y) - trendScore(x));
    return list.slice(0, q.limit ?? 60);
  }
  async lineage(hash: string) {
    const [anc] = await this.g.aggregate<{ ancestors: Array<GraphDoc & { depth: number }> }>([
      { $match: { _id: hash } },
      { $graphLookup: { from: "graphs", startWith: "$parentId", connectFromField: "parentId", connectToField: "_id", as: "ancestors", depthField: "depth" } },
    ]).toArray();
    const [desc] = await this.g.aggregate<{ descendants: Array<GraphDoc & { depth: number }> }>([
      { $match: { _id: hash } },
      { $graphLookup: { from: "graphs", startWith: "$_id", connectFromField: "_id", connectToField: "parentId", as: "descendants", depthField: "depth" } },
    ]).toArray();
    return {
      ancestors: (anc?.ancestors ?? []).sort((x, y) => y.depth - x.depth),
      descendants: (desc?.descendants ?? []).sort((x, y) => x.depth - y.depth),
    };
  }
  async bumpStat(hash: string, field: keyof GraphDoc["stats"], by = 1) { await this.g.updateOne({ _id: hash }, { $inc: { [`stats.${field}`]: by } }); }
  async upsertUser(u: User) { await this.db.collection<User>("users").updateOne({ _id: u._id }, { $set: u }, { upsert: true }); }
  async getUser(handle: string) { return this.db.collection<User>("users").findOne({ _id: handle }); }
  async listUsers() { return this.db.collection<User>("users").find({}).toArray(); }
  async recordLicense(l: LicenseDoc) {
    const c = this.db.collection<LicenseDoc>("licenses");
    if (await c.findOne({ graphId: l.graphId, buyer: l.buyer })) throw new DuplicateError("This wallet already licensed this mechanic.");
    await c.insertOne(l);
  }
  async licensesFor(hash: string) { return this.db.collection<LicenseDoc>("licenses").find({ graphId: hash }).sort({ createdAt: -1 }).toArray(); }
  async allLicenses() { return this.db.collection<LicenseDoc>("licenses").find({}).toArray(); }
  async unvote(challengeId: string, graphId: string, voter: string) {
    const r = await this.db.collection("votes").deleteOne({ _id: { challengeId, graphId, voter } as unknown as never });
    if (!r.deletedCount) return false;
    await this.db.collection<EntryDoc>("entries").updateOne({ _id: `${challengeId}:${graphId}`, votes: { $gt: 0 } }, { $inc: { votes: -1 } });
    return true;
  }
  async votesBy(voter: string) {
    const rows = await this.db.collection("votes").find({ "_id.voter": voter }).toArray();
    return rows.map((r) => { const id = r._id as unknown as { challengeId: string; graphId: string; voter: string }; return { ...id, createdAt: Number(r.createdAt ?? 0) }; });
  }
  async vote(challengeId: string, graphId: string, voter: string) {
    try {
      await this.db.collection("votes").insertOne({ _id: { challengeId, graphId, voter } as unknown as never, createdAt: Date.now() });
    } catch (e) {
      if (isDup(e)) throw new DuplicateError("You already voted for this entry.");
      throw e;
    }
    await this.db.collection<EntryDoc>("entries").updateOne({ _id: `${challengeId}:${graphId}` }, { $inc: { votes: 1 } });
  }
  async getAsset(hash: string) { return this.a.findOne({ _id: hash }); }
  async putAsset(doc: AssetDoc) {
    try { await this.a.insertOne(doc); } catch (e) { if (isDup(e)) throw new DuplicateError("This exact asset is already published."); throw e; }
  }
  async updateAsset(hash: string, patch: Partial<AssetDoc>) { await this.a.updateOne({ _id: hash }, { $set: patch }); }
  async listAssets(q: AssetQuery) {
    const filter: Document = { ...textFilter(q.q) };
    if (q.kind) filter.kind = q.kind;
    if (q.tag) filter.tags = q.tag;
    if (q.author) filter.authorId = q.author;
    const list = await this.a.find(filter).sort(q.sort === "forks" ? { "stats.forks": -1 } : { createdAt: -1 }).limit(q.limit ?? 60).toArray();
    if (q.sort === "trending") list.sort((x, y) => trendScore(y) - trendScore(x));
    return list;
  }
  async bumpAssetStat(hash: string, field: keyof AssetDoc["stats"], by = 1) { await this.a.updateOne({ _id: hash }, { $inc: { [`stats.${field}`]: by } }); }

  /** Atlas $vectorSearch; falls back to brute force over a candidate set if the stage errors or returns nothing. */
  async similar(q: Parameters<Store["similar"]>[0]) {
    const coll = q.scope === "graphs" ? this.g : this.a;
    const index = q.scope === "graphs" ? (q.field === "structure" ? "graphs_structure" : "graphs_semantic") : "assets_semantic";
    const filter: Document = {};
    if (q.filter?.kind) filter.kind = q.filter.kind;
    if (q.filter?.licenseType) filter.licenseType = q.filter.licenseType;
    if (q.filter?.tags?.length) filter.tags = { $in: q.filter.tags };
    try {
      const rows = await (coll as unknown as ReturnType<Db["collection"]>).aggregate<{ _id: string; score: number; embedModel?: string }>([
        { $vectorSearch: { index, path: q.field, queryVector: q.vector, numCandidates: Math.max(100, q.k * 10), limit: q.k * 2, ...(Object.keys(filter).length ? { filter } : {}) } },
        { $project: { _id: 1, embedModel: 1, score: { $meta: "vectorSearchScore" } } },
      ]).toArray();
      this.vectorSearchOk = true;
      const ok = rows.filter((r) => q.field !== "semantic" || !q.embedModel || r.embedModel === q.embedModel);
      if (ok.length) return ok.slice(0, q.k).map((r) => ({ hash: r._id, score: r.score }));
    } catch {
      this.vectorSearchOk = false;
    }
    const docs = (await (coll as unknown as ReturnType<Db["collection"]>).find(filter).limit(500).toArray()) as unknown as Array<GraphDoc | AssetDoc>;
    return bruteForceSimilar(docs, q);
  }
  async kin(hash: string, depth: number) {
    const d = await this.getGraph(hash);
    if (!d) return [];
    const root = d.rootId || d._id;
    const [row] = await this.g.aggregate<{ family: GraphDoc[] }>([
      { $match: { _id: root } },
      { $graphLookup: { from: "graphs", startWith: "$_id", connectFromField: "_id", connectToField: "parentId", as: "family", maxDepth: Math.max(1, depth + 1) } },
    ]).toArray();
    const { ancestors } = await this.lineage(hash);
    const anc = new Set(ancestors.map((x) => x._id));
    return (row?.family ?? []).filter((g) => g._id !== hash && !anc.has(g._id));
  }
  async getChallenge(id: string) { return this.db.collection<ChallengeDoc>("challenges").findOne({ _id: id }); }
  async putChallenge(c: ChallengeDoc) { await this.db.collection<ChallengeDoc>("challenges").replaceOne({ _id: c._id }, c, { upsert: true }); }
  async listChallenges() { return this.db.collection<ChallengeDoc>("challenges").find({}).sort({ endsAt: -1 }).toArray(); }
  async putEntry(e: EntryDoc) {
    try { await this.db.collection<EntryDoc>("entries").insertOne(e); } catch (err) { if (isDup(err)) throw new DuplicateError("This mechanic is already entered."); throw err; }
  }
  async entries(challengeId: string) { return this.db.collection<EntryDoc>("entries").find({ challengeId }).toArray(); }
  async putReplay(r: ReplayDoc) {
    try { await this.db.collection<ReplayDoc>("replays").insertOne(r); } catch (err) { if (isDup(err)) throw new DuplicateError("This replay was already submitted."); throw err; }
  }
  async deleteReplays(challengeId: string) { await this.db.collection<ReplayDoc>("replays").deleteMany({ challengeId }); }
  async replays(challengeId: string) { return this.db.collection<ReplayDoc>("replays").find({ challengeId }).toArray(); }
  async putSnapshot(s: SnapshotDoc) { await this.db.collection<SnapshotDoc>("snapshots").replaceOne({ _id: s._id }, s, { upsert: true }); }
  async getSnapshot(id: string) { return this.db.collection<SnapshotDoc>("snapshots").findOne({ _id: id }); }
  async putTeam(t: TeamDoc) { await this.db.collection<TeamDoc>("teams").replaceOne({ _id: t._id }, t, { upsert: true }); }
  async teams() { return this.db.collection<TeamDoc>("teams").find({}).toArray(); }
  async log(a: Omit<ActivityDoc, "_id">) { await this.db.collection("activity").insertOne({ ...a }); }
  async activity(limit: number) {
    const rows = await this.db.collection("activity").find({}).sort({ at: -1 }).limit(limit).toArray();
    return rows.map((r) => ({ ...(r as unknown as ActivityDoc), _id: String(r._id) }));
  }
  async pendingAnchors() { return this.g.find({ "anchor.status": "pending" }).limit(50).toArray(); }

  async isEmpty() { return (await this.g.estimatedDocumentCount()) === 0; }
}
