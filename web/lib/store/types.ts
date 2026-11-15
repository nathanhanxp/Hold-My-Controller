import type { Asset, ChallengeSnapshot, Graph, MinigameSpec, PayoutLine, Share } from "@forklab/engine";

export type AnchorInfo = { status: "pending" | "confirmed" | "failed" | "simulated"; sig?: string; mechanicPda?: string; registerSig?: string; note?: string };

export type GraphDoc = {
  _id: string;
  kind: "mechanic" | "level";
  parentId: string | null;
  rootId: string;
  sources: string[];
  authorId: string;
  title: string;
  tags: string[];
  license: Graph["license"];
  licenseType: "free" | "paid";
  theme?: Graph["theme"];
  assetRefs: string[];
  graph: Graph;
  shares: Share[];
  stats: { plays: number; forks: number; licenses: number };
  structure: number[];
  semantic?: number[];
  embedModel?: string;
  changelog?: string;
  changelogProvider?: string;
  thumb?: string;
  anchor: AnchorInfo;
  createdAt: number;
};

export type AssetDoc = {
  _id: string;
  kind: "prefab" | "theme";
  parentId: string | null;
  authorId: string;
  title: string;
  tags: string[];
  asset: Asset;
  semantic?: number[];
  embedModel?: string;
  stats: { forks: number; uses: number };
  anchor: AnchorInfo;
  createdAt: number;
};

export type User = { _id: string; pubkey?: string; color?: number; createdAt: number; spentLamports?: number; plan?: { tier: "pro" | "max"; until: number }; ledger?: Array<{ at: number; tokens: number; what: string }> };
export type LicenseDoc = { _id: string; graphId: string; buyer: string; buyerHandle?: string; sig: string; priceLamports: number; simulated: boolean; split: Array<{ handle: string; wallet: string; lamports: number }>; feeLamports: number; createdAt: number };

export type ChallengeDoc = {
  _id: string;
  kind: "episode" | "game";
  episode: string;
  title: string;
  ruleId?: string;
  seed: number;
  startsAt: number;
  endsAt: number;
  featuredGraph?: string;
  minigame?: MinigameSpec;
  winner?: { graphHash: string; fromChallenge: string; votes?: number };
  /** The look (a library theme) the community voted for; presentation only, its maker shares the makers' pot. */
  look?: { assetId: string; title: string; author: string; theme: { sky: string; ground: string; accent: string } };
  /** How this week's pieces were chosen. */
  chosenBy?: "vote" | "rotation";
  prize: {
    poolLamports: number;
    maxWinners: number;
    pda?: string;
    status: "open" | "settled" | "refunded" | "no_winners";
    settleSig?: string;
    simulated?: boolean;
    payouts?: Array<PayoutLine & { handle?: string; role?: "player" | "contributor" | "builder" }>;
    snapshotHash?: string;
  };
};

export type EntryDoc = { _id: string; challengeId: string; graphId: string; author: string; rule: { ok: boolean; reasons: string[] }; votes: number; createdAt: number };
export type ReplayDoc = { _id: string; challengeId: string; graphId: string; player: string; wallet?: string; score: number; ticks: number; inputs: Array<[number, number]>; seed: number; endedBy: string; verifiedAt: number };
export type VoteDoc = { challengeId: string; graphId: string; voter: string; createdAt: number };
export type SnapshotDoc = { _id: string; schema: string; hash: string; body: ChallengeSnapshot; anchorSig?: string };
export type TeamDoc = { _id: string; name: string; members: string[]; createdAt: number };
export type ActivityDoc = { _id: string; kind: "publish" | "fork" | "license" | "verify" | "score" | "settle" | "asset"; text: string; ref?: string; at: number };

export type ListQuery = { q?: string; kind?: "mechanic" | "level"; license?: "free" | "paid"; tag?: string; sort?: "trending" | "forks" | "new"; author?: string; limit?: number };
export type AssetQuery = { q?: string; kind?: "prefab" | "theme"; tag?: string; sort?: "trending" | "forks" | "new"; author?: string; limit?: number };
export type SimilarFilter = { kind?: string; licenseType?: "free" | "paid"; tags?: string[] };

export class DuplicateError extends Error {
  code = "DUPLICATE" as const;
}

export interface Store {
  readonly kind: "memory" | "mongo";
  getGraph(hash: string): Promise<GraphDoc | null>;
  putGraph(doc: GraphDoc): Promise<void>;
  updateGraph(hash: string, patch: Partial<GraphDoc>): Promise<void>;
  listGraphs(q: ListQuery): Promise<GraphDoc[]>;
  lineage(hash: string): Promise<{ ancestors: GraphDoc[]; descendants: GraphDoc[] }>;
  bumpStat(hash: string, field: keyof GraphDoc["stats"], by?: number): Promise<void>;
  upsertUser(u: User): Promise<void>;
  getUser(handle: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  recordLicense(l: LicenseDoc): Promise<void>;
  licensesFor(hash: string): Promise<LicenseDoc[]>;
  allLicenses(): Promise<LicenseDoc[]>;
  vote(challengeId: string, graphId: string, voter: string): Promise<void>;
  votesBy(voter: string): Promise<VoteDoc[]>;
  /** Take a vote back; false when there was none. */
  unvote(challengeId: string, graphId: string, voter: string): Promise<boolean>;
  getAsset(hash: string): Promise<AssetDoc | null>;
  putAsset(doc: AssetDoc): Promise<void>;
  updateAsset(hash: string, patch: Partial<AssetDoc>): Promise<void>;
  listAssets(q: AssetQuery): Promise<AssetDoc[]>;
  bumpAssetStat(hash: string, field: keyof AssetDoc["stats"], by?: number): Promise<void>;
  similar(q: { scope: "graphs" | "assets"; field: "structure" | "semantic"; vector: number[]; k: number; filter?: SimilarFilter; embedModel?: string }): Promise<Array<{ hash: string; score: number }>>;
  kin(hash: string, depth: number): Promise<GraphDoc[]>;
  getChallenge(id: string): Promise<ChallengeDoc | null>;
  putChallenge(c: ChallengeDoc): Promise<void>;
  listChallenges(): Promise<ChallengeDoc[]>;
  putEntry(e: EntryDoc): Promise<void>;
  entries(challengeId: string): Promise<EntryDoc[]>;
  putReplay(r: ReplayDoc): Promise<void>;
  replays(challengeId: string): Promise<ReplayDoc[]>;
  deleteReplays(challengeId: string): Promise<void>;
  putSnapshot(s: SnapshotDoc): Promise<void>;
  getSnapshot(challengeId: string): Promise<SnapshotDoc | null>;
  putTeam(t: TeamDoc): Promise<void>;
  teams(): Promise<TeamDoc[]>;
  log(a: Omit<ActivityDoc, "_id">): Promise<void>;
  activity(limit: number): Promise<ActivityDoc[]>;
  pendingAnchors(): Promise<GraphDoc[]>;
}
