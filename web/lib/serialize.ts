import type { AssetDoc, ChallengeDoc, GraphDoc } from "./store/types";

/** Client view of a graph document: no embedding vectors, thumbnail served separately. */
export function publicGraph(d: GraphDoc) {
  const { semantic, structure, thumb, ...rest } = d;
  void semantic; void structure;
  return { ...rest, hasThumb: !!thumb };
}
export type PublicGraph = ReturnType<typeof publicGraph>;

export function cardGraph(d: GraphDoc) {
  return { _id: d._id, kind: d.kind, title: d.title, authorId: d.authorId, tags: d.tags, licenseType: d.licenseType, license: d.license, stats: d.stats, parentId: d.parentId, rootId: d.rootId, createdAt: d.createdAt, theme: d.theme, shares: d.shares, anchor: d.anchor, sources: d.sources };
}
export type CardGraph = ReturnType<typeof cardGraph>;

export function publicAsset(d: AssetDoc) {
  const { semantic, ...rest } = d;
  void semantic;
  return rest;
}
export type PublicAsset = ReturnType<typeof publicAsset>;

export function publicChallenge(c: ChallengeDoc) {
  return c;
}
