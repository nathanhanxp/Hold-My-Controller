import {
  applyAuthorship, assetHash, assetSchema, computeShares, diffGraphs, graphHash, localChangelog, param, parseGraph, structureVector,
  type Asset, type Graph, type Share,
} from "@forklab/engine";
import { DuplicateError, type AssetDoc, type GraphDoc, type Store } from "../store/types";
import { demoWallet } from "../wallets";

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

export type PublishDeps = {
  store: Store;
  mode: "live" | "mock";
  now?: number;
  /** Synchronous-enough embedding; publish never waits on a remote model (that runs later in the worker queue). */
  embedNow?: (text: string) => { vector: number[]; model: string } | null;
  describe?: (g: Graph, changelog?: string) => string;
};

export async function sharesWithWallets(store: Store, shares: Share[]): Promise<Share[]> {
  return Promise.all(shares.map(async (s) => ({ ...s, wallet: (await store.getUser(s.handle))?.pubkey })));
}

/** Ancestors root first, ending with the parent. */
export async function lineageHashes(store: Store, parent: string | null): Promise<string[]> {
  if (!parent) return [];
  const { ancestors } = await store.lineage(parent);
  return [...ancestors.map((a) => a._id), parent];
}

/**
 * Publish a graph: validate, apply the authorship rule against the parent, compute the content hash,
 * reject duplicates, compute shares and structure, store with anchor status pending.
 */
export async function publishGraph(deps: PublishDeps, input: { draft: unknown; author: string; thumb?: string }): Promise<GraphDoc> {
  const { store } = deps;
  const author = String(input.author ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(author)) throw new ApiError("BAD_AUTHOR", "Pick a handle of 1 to 24 lowercase letters, digits or underscores.");
  const parsed = parseGraph(input.draft);
  if (!parsed.ok) throw new ApiError("INVALID_GRAPH", parsed.errors.join(" "));
  const draft = parsed.graph;
  if (draft.nodes.length === 0) throw new ApiError("EMPTY_GRAPH", "Add at least one node before publishing.");

  let parentDoc: GraphDoc | null = null;
  if (draft.parent) {
    parentDoc = await store.getGraph(draft.parent);
    if (!parentDoc) throw new ApiError("UNKNOWN_PARENT", "The graph this was forked from is not in the library.");
    if (parentDoc.kind !== draft.kind) throw new ApiError("KIND_MISMATCH", `A fork of a ${parentDoc.kind} must stay a ${parentDoc.kind}.`);
  }
  const grafts = new Map<string, Graph>();
  for (const h of draft.sources) {
    const src = await store.getGraph(h);
    if (!src) throw new ApiError("UNKNOWN_SOURCE", "A borrowed source graph is not in the library.");
    if (src.licenseType !== "free") throw new ApiError("PAID_SOURCE", `Only free to fork graphs can be borrowed from (${src.title} is paid).`);
    grafts.set(h, src.graph);
  }
  const graph = applyAuthorship(parentDoc ? { graph: parentDoc.graph, hash: parentDoc._id } : null, draft, author, grafts);
  if (graph.kind === "level") graph.license = { type: "free" };

  const assetRefs = [...new Set(graph.nodes.filter((n) => n.type === "Spawn").map((n) => String(param(n, "prefab"))).filter((p) => p.startsWith("asset:")).map((p) => p.slice(6)))];
  for (const a of assetRefs) if (!(await store.getAsset(a))) throw new ApiError("UNKNOWN_ASSET", `Spawn uses an asset that is not in the library (${a.slice(0, 8)}).`);

  const hash = graphHash(graph);
  if (await store.getGraph(hash)) throw new ApiError("DUPLICATE", "This exact graph is already published. Change something first.", 409);

  const lineage = await lineageHashes(store, graph.parent);
  const shares = await sharesWithWallets(store, computeShares(graph, lineage));
  // devnet: an author who never linked a wallet is paid to their handle's demo wallet, marked as such on the receipt
  if (graph.license.type === "paid") for (const s of shares) if (!s.wallet) { s.wallet = demoWallet(s.handle); s.demoWallet = true; }
  const changelog = parentDoc ? localChangelog(diffGraphs(parentDoc.graph, graph)) : `New ${graph.kind}: ${graph.title}.`;
  const now = deps.now ?? Date.now();
  const doc: GraphDoc = {
    _id: hash,
    kind: graph.kind,
    parentId: graph.parent,
    rootId: graph.root || hash,
    sources: graph.sources,
    authorId: author,
    title: graph.title,
    tags: graph.tags,
    license: graph.license,
    licenseType: graph.license.type,
    theme: graph.theme,
    assetRefs,
    graph,
    shares,
    stats: { plays: 0, forks: 0, licenses: 0 },
    structure: structureVector(graph),
    changelog,
    changelogProvider: "local",
    thumb: input.thumb && /^data:image\/png;base64,[A-Za-z0-9+/=]{1,400000}$/.test(input.thumb) ? input.thumb : undefined,
    anchor: { status: "pending" },
    createdAt: now,
  };
  const emb = deps.embedNow?.((deps.describe ?? ((g) => g.title))(graph, changelog));
  if (emb) { doc.semantic = emb.vector; doc.embedModel = emb.model; }
  try {
    await store.putGraph(doc);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", e.message, 409);
    throw e;
  }
  if (parentDoc) await store.bumpStat(parentDoc._id, "forks");
  for (const a of assetRefs) await store.bumpAssetStat(a, "uses");
  await store.log({ kind: parentDoc ? "fork" : "publish", text: parentDoc ? `@${author} forked ${parentDoc.title} as ${graph.title}` : `@${author} published ${graph.title}`, ref: hash, at: now });
  return doc;
}

export async function publishAsset(deps: PublishDeps, input: { asset: unknown }): Promise<AssetDoc> {
  const r = assetSchema.safeParse(input.asset);
  if (!r.success) throw new ApiError("INVALID_ASSET", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" "));
  const asset: Asset = r.data;
  if (asset.parent && !(await deps.store.getAsset(asset.parent))) throw new ApiError("UNKNOWN_PARENT", "The asset this was forked from is not in the library.");
  const hash = assetHash(asset);
  const now = deps.now ?? Date.now();
  const doc: AssetDoc = {
    _id: hash, kind: asset.kind, parentId: asset.parent, authorId: asset.authorId, title: asset.title, tags: asset.tags, asset,
    stats: { forks: 0, uses: 0 }, anchor: { status: "pending" }, createdAt: now,
  };
  const emb = deps.embedNow?.(`${asset.title}. ${asset.tags.join(" ")}. ${asset.kind} ${asset.prefab ? `tag ${asset.prefab.tag}` : ""}`);
  if (emb) { doc.semantic = emb.vector; doc.embedModel = emb.model; }
  try {
    await deps.store.putAsset(doc);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", e.message, 409);
    throw e;
  }
  if (asset.parent) await deps.store.bumpAssetStat(asset.parent, "forks");
  await deps.store.log({ kind: "asset", text: `@${asset.authorId} added the ${asset.kind} ${asset.title}`, ref: hash, at: now });
  return doc;
}
