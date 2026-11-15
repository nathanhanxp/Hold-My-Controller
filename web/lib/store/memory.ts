import { cosine } from "@forklab/engine";
import { DuplicateError, type ActivityDoc, type AssetDoc, type AssetQuery, type ChallengeDoc, type EntryDoc, type GraphDoc, type LicenseDoc, type ListQuery, type ReplayDoc, type SnapshotDoc, type Store, type TeamDoc, type User, type VoteDoc } from "./types";

const clone = <T>(v: T): T => structuredClone(v);

export function textMatch(q: string | undefined, fields: Array<string | undefined>): boolean {
  if (!q) return true;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function trendScore(d: { stats: { forks: number; plays?: number; licenses?: number; uses?: number }; createdAt: number }): number {
  const ageDays = Math.max(0.5, (Date.now() - d.createdAt) / 86_400_000);
  return (d.stats.forks * 3 + (d.stats.plays ?? 0) + (d.stats.licenses ?? 0) * 5 + (d.stats.uses ?? 0) * 2) / Math.pow(ageDays, 0.6);
}

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  graphs = new Map<string, GraphDoc>();
  assets = new Map<string, AssetDoc>();
  users = new Map<string, User>();
  licenses: LicenseDoc[] = [];
  votes: VoteDoc[] = [];
  challenges = new Map<string, ChallengeDoc>();
  entryDocs = new Map<string, EntryDoc>();
  replayDocs = new Map<string, ReplayDoc>();
  snapshots = new Map<string, SnapshotDoc>();
  teamDocs = new Map<string, TeamDoc>();
  activityLog: ActivityDoc[] = [];
  private seq = 0;

  async getGraph(hash: string) { const d = this.graphs.get(hash); return d ? clone(d) : null; }
  async putGraph(doc: GraphDoc) {
    if (this.graphs.has(doc._id)) throw new DuplicateError("This exact graph is already published.");
    this.graphs.set(doc._id, clone(doc));
  }
  async updateGraph(hash: string, patch: Partial<GraphDoc>) {
    const d = this.graphs.get(hash);
    if (d) this.graphs.set(hash, { ...d, ...clone(patch) });
  }
  async listGraphs(q: ListQuery) {
    let list = [...this.graphs.values()].filter((d) =>
      (!q.kind || d.kind === q.kind) && (!q.license || d.licenseType === q.license) && (!q.tag || d.tags.includes(q.tag)) && (!q.author || d.authorId === q.author) &&
      textMatch(q.q, [d.title, d.tags.join(" "), d.authorId, d.changelog]));
    if (q.sort === "forks") list.sort((a, b) => b.stats.forks - a.stats.forks || b.createdAt - a.createdAt);
    else if (q.sort === "trending") list.sort((a, b) => trendScore(b) - trendScore(a));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return clone(list.slice(0, q.limit ?? 60));
  }
  async lineage(hash: string) {
    const ancestors: GraphDoc[] = [];
    let cur = this.graphs.get(hash);
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      const p = this.graphs.get(cur.parentId);
      if (!p) break;
      ancestors.unshift(p);
      cur = p;
    }
    const descendants: GraphDoc[] = [];
    const queue = [hash];
    while (queue.length) {
      const h = queue.shift()!;
      for (const d of this.graphs.values()) if (d.parentId === h && !seen.has(d._id)) { seen.add(d._id); descendants.push(d); queue.push(d._id); }
    }
    return clone({ ancestors, descendants });
  }
  async bumpStat(hash: string, field: keyof GraphDoc["stats"], by = 1) {
    const d = this.graphs.get(hash);
    if (d) d.stats[field] += by;
  }
  async upsertUser(u: User) { this.users.set(u._id, { ...this.users.get(u._id), ...clone(u) }); }
  async getUser(handle: string) { const u = this.users.get(handle); return u ? clone(u) : null; }
  async listUsers() { return clone([...this.users.values()]); }
  async recordLicense(l: LicenseDoc) {
    if (this.licenses.some((x) => x.graphId === l.graphId && x.buyer === l.buyer)) throw new DuplicateError("This wallet already licensed this mechanic.");
    this.licenses.push(clone(l));
  }
  async licensesFor(hash: string) { return clone(this.licenses.filter((l) => l.graphId === hash)); }
  async allLicenses() { return clone(this.licenses); }
  async unvote(challengeId: string, graphId: string, voter: string) {
    const i = this.votes.findIndex((v) => v.challengeId === challengeId && v.graphId === graphId && v.voter === voter);
    if (i < 0) return false;
    this.votes.splice(i, 1);
    const e = this.entryDocs.get(`${challengeId}:${graphId}`);
    if (e) e.votes = Math.max(0, e.votes - 1);
    return true;
  }
  async votesBy(voter: string) { return clone(this.votes.filter((v) => v.voter === voter)); }
  async vote(challengeId: string, graphId: string, voter: string) {
    if (this.votes.some((v) => v.challengeId === challengeId && v.graphId === graphId && v.voter === voter)) throw new DuplicateError("You already voted for this entry.");
    this.votes.push({ challengeId, graphId, voter, createdAt: Date.now() });
    const e = this.entryDocs.get(`${challengeId}:${graphId}`);
    if (e) e.votes += 1;
  }
  async getAsset(hash: string) { const d = this.assets.get(hash); return d ? clone(d) : null; }
  async putAsset(doc: AssetDoc) {
    if (this.assets.has(doc._id)) throw new DuplicateError("This exact asset is already published.");
    this.assets.set(doc._id, clone(doc));
  }
  async updateAsset(hash: string, patch: Partial<AssetDoc>) {
    const d = this.assets.get(hash);
    if (d) this.assets.set(hash, { ...d, ...clone(patch) });
  }
  async listAssets(q: AssetQuery) {
    let list = [...this.assets.values()].filter((d) => (!q.kind || d.kind === q.kind) && (!q.tag || d.tags.includes(q.tag)) && (!q.author || d.authorId === q.author) && textMatch(q.q, [d.title, d.tags.join(" "), d.authorId]));
    if (q.sort === "forks") list.sort((a, b) => b.stats.forks - a.stats.forks);
    else if (q.sort === "trending") list.sort((a, b) => trendScore(b) - trendScore(a));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return clone(list.slice(0, q.limit ?? 60));
  }
  async bumpAssetStat(hash: string, field: keyof AssetDoc["stats"], by = 1) {
    const d = this.assets.get(hash);
    if (d) d.stats[field] += by;
  }
  /** Brute-force cosine. Vectors from a different embedding model are ignored. */
  async similar(q: Parameters<Store["similar"]>[0]) {
    const docs: Array<GraphDoc | AssetDoc> = q.scope === "graphs" ? [...this.graphs.values()] : [...this.assets.values()];
    return bruteForceSimilar(docs, q);
  }
  async kin(hash: string, depth: number) {
    const d = this.graphs.get(hash);
    if (!d) return [];
    const root = d.rootId || d._id;
    const family = [...this.graphs.values()].filter((g) => g._id !== hash && (g.rootId === root || g._id === root));
    const lineage = await this.lineage(hash);
    const anc = new Set(lineage.ancestors.map((a) => a._id));
    void depth;
    return clone(family.filter((g) => !anc.has(g._id)));
  }
  async getChallenge(id: string) { const c = this.challenges.get(id); return c ? clone(c) : null; }
  async putChallenge(c: ChallengeDoc) { this.challenges.set(c._id, clone(c)); }
  async listChallenges() { return clone([...this.challenges.values()].sort((a, b) => b.endsAt - a.endsAt)); }
  async putEntry(e: EntryDoc) {
    if (this.entryDocs.has(e._id)) throw new DuplicateError("This mechanic is already entered.");
    this.entryDocs.set(e._id, clone(e));
  }
  async entries(challengeId: string) { return clone([...this.entryDocs.values()].filter((e) => e.challengeId === challengeId)); }
  async putReplay(r: ReplayDoc) {
    if (this.replayDocs.has(r._id)) throw new DuplicateError("This replay was already submitted.");
    this.replayDocs.set(r._id, clone(r));
  }
  async deleteReplays(challengeId: string) { for (const [k, r] of this.replayDocs) if (r.challengeId === challengeId) this.replayDocs.delete(k); }
  async replays(challengeId: string) { return clone([...this.replayDocs.values()].filter((r) => r.challengeId === challengeId)); }
  async putSnapshot(s: SnapshotDoc) { this.snapshots.set(s._id, clone(s)); }
  async getSnapshot(id: string) { const s = this.snapshots.get(id); return s ? clone(s) : null; }
  async putTeam(t: TeamDoc) { this.teamDocs.set(t._id, clone(t)); }
  async teams() { return clone([...this.teamDocs.values()]); }
  async log(a: Omit<ActivityDoc, "_id">) {
    this.activityLog.unshift({ _id: `a${++this.seq}`, ...a });
    this.activityLog.length = Math.min(this.activityLog.length, 500);
  }
  async activity(limit: number) { return clone(this.activityLog.slice(0, limit)); }
  async pendingAnchors() { return clone([...this.graphs.values()].filter((g) => g.anchor.status === "pending")); }
}

export function bruteForceSimilar(docs: Array<GraphDoc | AssetDoc>, q: Parameters<Store["similar"]>[0]): Array<{ hash: string; score: number }> {
  const out: Array<{ hash: string; score: number }> = [];
  for (const d of docs) {
    const f = q.filter ?? {};
    if (f.kind && d.kind !== f.kind) continue;
    if (f.licenseType && "licenseType" in d && d.licenseType !== f.licenseType) continue;
    if (f.tags?.length && !f.tags.some((t) => d.tags.includes(t))) continue;
    const vec = q.field === "structure" ? ("structure" in d ? d.structure : undefined) : d.semantic;
    if (!vec || vec.length !== q.vector.length) continue;
    if (q.field === "semantic" && q.embedModel && d.embedModel !== q.embedModel) continue;
    out.push({ hash: d._id, score: cosine(vec, q.vector) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, q.k);
}
