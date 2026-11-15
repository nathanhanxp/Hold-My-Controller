import { DuplicateError, type AssetDoc, type EntryDoc, type GraphDoc, type Store } from "../store/types";
import { NOMINATE_TOKENS, spendTokens } from "./tokens";
import { ApiError } from "./publish";
import { gameIdFor } from "./weeks";
import { finalistsFor } from "./finalists";

/*
 * Next week's game is chosen by the community: one ballot per slot (mechanic, level, look) per week.
 * Anyone can nominate a piece from the open library; anyone with a handle can vote (one vote per piece,
 * not for their own). When the week turns over, the top piece in each slot becomes the new game, and the
 * makers of those pieces share the makers' part of the prize pool.
 * Ballots reuse the entries and votes collections with challenge ids "ballot:<game id>:<slot>".
 */

export const SLOTS = ["mechanic", "level", "look"] as const;
export type Slot = (typeof SLOTS)[number];
const WEEK = 7 * 86_400_000;

export const ballotId = (gameId: string, slot: Slot) => `finalists:${gameId}:${slot}`;
/** The game the current ballot decides: next week's. */
export const nextGameId = (now = Date.now()) => gameIdFor(new Date(now + WEEK));

export type Nominee = { id: string; slot: Slot; title: string; author: string; votes: number; tags: string[]; theme?: { sky: string; ground: string; accent: string }; kind: "graph" | "asset"; why: "top" | "rising" | "nominated"; plays: number; forks: number; creators: string[] };

async function lookup(store: Store, slot: Slot, id: string): Promise<{ doc: GraphDoc | AssetDoc; kind: "graph" | "asset" } | null> {
  if (slot === "look") {
    const a = await store.getAsset(id);
    if (a && a.kind === "theme") return { doc: a, kind: "asset" };
    return null;
  }
  const g = await store.getGraph(id);
  if (!g) return null;
  if (slot === "mechanic" && g.kind !== "mechanic") return null;
  if (slot === "level" && g.kind !== "level") return null;
  return { doc: g, kind: "graph" };
}

export async function nominate(store: Store, slot: Slot, id: string, nominator: string, now = Date.now()) {
  if (!SLOTS.includes(slot)) throw new ApiError("BAD_SLOT", "Nominate a mechanic, a level or a look.");
  const found = await lookup(store, slot, id);
  if (!found) throw new ApiError("NOT_FOUND", slot === "look" ? "Looks come from the library's themes." : `That is not a published ${slot}.`, 404);
  const doc = found.doc as { title: string; authorId: string; licenseType?: string };
  if (found.kind === "graph" && doc.licenseType !== "free") throw new ApiError("NOT_FREE", "Only free-to-fork pieces can be nominated, so the winner joins the shared library.");
  const game = nextGameId(now);
  const entry: EntryDoc = { _id: `${ballotId(game, slot)}:${id}`, challengeId: ballotId(game, slot), graphId: id, author: doc.authorId, rule: { ok: true, reasons: [] }, votes: 0, createdAt: now };
  if ((await store.entries(ballotId(game, slot))).some((e) => e.graphId === id)) throw new ApiError("DUPLICATE", "Already nominated for next week.", 409);
  await spendTokens(store, nominator, NOMINATE_TOKENS, "Nominating", now);
  try {
    await store.putEntry(entry);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", "Already nominated for next week.", 409);
    throw e;
  }
  await store.log({ kind: "publish", text: `@${nominator} nominated ${doc.title} as next week's ${slot}`, ref: id, at: now });
  return entry;
}

/** Take a vote back. Its token goes with it when it was your only vote in that slot this week. */
export async function unvoteFor(store: Store, slot: Slot, id: string, voter: string, now = Date.now()) {
  if (!/^[a-z0-9_]{1,24}$/.test(voter)) throw new ApiError("NO_HANDLE", "Pick a handle first.", 401);
  const bid = ballotId(nextGameId(now), slot);
  if (!(await store.unvote(bid, id, voter))) throw new ApiError("NOT_VOTED", "You haven't voted for this one.", 404);
  const left = (await store.votesBy(voter)).filter((v) => v.challengeId === bid).length;
  return { lost: left === 0 ? 1 : 0 };
}

/** Each person gets two votes per slot per week. */
export const VOTES_PER_SLOT = 2;

export async function voteFor(store: Store, slot: Slot, id: string, voter: string, now = Date.now()) {
  if (!/^[a-z0-9_]{1,24}$/.test(voter)) throw new ApiError("NO_HANDLE", "Pick a handle first.", 401);
  const bid = ballotId(nextGameId(now), slot);
  const entry = (await store.entries(bid)).find((e) => e.graphId === id);
  if (!entry) throw new ApiError("NOT_FOUND", "That piece is not on the ballot.", 404);
  if (entry.author === voter) throw new ApiError("OWN_ENTRY", "You can't vote for your own piece.", 403);
  // the first vote in a slot each week earns a token; more votes in the same slot count but don't pay again
  const mine = (await store.votesBy(voter)).filter((v) => v.challengeId === bid);
  if (mine.some((v) => v.graphId === id)) throw new ApiError("DUPLICATE", "You already voted for this one.", 409);
  if (mine.length >= VOTES_PER_SLOT) throw new ApiError("NO_VOTES_LEFT", `You've used both votes for this ${slot} this week.`, 409);
  const first = mine.length === 0;
  try {
    await store.vote(bid, id, voter);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", "You already voted for this one.", 409);
    throw e;
  }
  return { earned: first ? 1 : 0 };
}

/** Freeze the finalists for a week the first time its ballot is read: 4 strongest that fit, plus 1 rising. */
async function seedBallot(store: Store, game: string, now: number) {
  for (const slot of SLOTS) {
    const picks = await finalistsFor(store, slot, now);
    for (const [i, p] of picks.entries()) {
      const author = (p as { authorId: string }).authorId;
      try { await store.putEntry({ _id: `${ballotId(game, slot)}:${p._id}`, challengeId: ballotId(game, slot), graphId: p._id, author, rule: { ok: true, reasons: [p.why] }, votes: 0, createdAt: now + i }); } catch { /* already there */ }
    }
  }
}

export async function ballot(store: Store, now = Date.now()) {
  const game = nextGameId(now);
  if (!(await Promise.all(SLOTS.map((sl) => store.entries(ballotId(game, sl))))).some((x) => x.length)) await seedBallot(store, game, now);
  const out = {} as Record<Slot, Nominee[]>;
  for (const slot of SLOTS) {
    const entries = (await store.entries(ballotId(game, slot))).sort((a, b) => a.createdAt - b.createdAt);
    const items: Nominee[] = [];
    for (const e of entries) {
      const f = await lookup(store, slot, e.graphId);
      if (!f) continue;
      const d = f.doc as { title: string; authorId: string; tags?: string[] };
      const st = (f.doc as { stats: { plays?: number; forks?: number; uses?: number } }).stats;
      const why = e.rule.reasons[0] === "rising" ? "rising" : e.rule.reasons[0] === "top" ? "top" : "nominated";
      items.push({ id: e.graphId, slot, title: d.title, author: d.authorId, votes: e.votes, tags: d.tags ?? [], theme: f.kind === "asset" ? (f.doc as AssetDoc).asset?.theme : (f.doc as GraphDoc).theme, kind: f.kind, why, plays: st.plays ?? st.uses ?? 0, forks: st.forks ?? 0, creators: f.kind === "graph" ? ((f.doc as GraphDoc).shares ?? []).map((x) => x.handle) : [d.authorId] });
    }
    // finalists keep their place (strongest first, rising last) so the list doesn't jump as votes come in
    out[slot] = items;
  }
  return { game, slots: out };
}

/** The winning piece per slot for a game id (most votes, then earliest nominated), or null if no ballot ran. */
export async function ballotWinners(store: Store, game: string) {
  const pick = async (slot: Slot) => {
    const es = (await store.entries(ballotId(game, slot))).filter((e) => e.votes > 0).sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
    return es[0] ?? null;
  };
  return { mechanic: await pick("mechanic"), level: await pick("level"), look: await pick("look") };
}
