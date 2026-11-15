import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  buildSnapshot, checkRule, flattenPayout, hashOf, lamportsFor, PayoutError, rankPlayers, ReplayError, snapshotBodyHash, verifyMinigameReplay, verifyReplay,
  MINIGAME_SCHEMA, type ChallengeSnapshot, type MinigameSpec,
} from "@forklab/engine";
import { DuplicateError, type ChallengeDoc, type GraphDoc, type ReplayDoc, type Store } from "../store/types";
import { ApiError } from "./publish";
import { demoWallet } from "../wallets";
import { gameIdFor, weekSeed } from "./weeks";
import { weekBounds } from "../store/seed";
import { ballotWinners } from "./ballot";
import { fits } from "./finalists";

export const voteMessage = (challengeId: string, graphId: string) => `Hold My Controller devnet vote: ${challengeId} ${graphId}`;
export const bindMessage = (handle: string, pubkey: string) => `Hold My Controller devnet: link wallet ${pubkey} to @${handle}`;

export function verifySignature(message: string, pubkey: string, signatureB58: string): boolean {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signatureB58), bs58.decode(pubkey));
  } catch {
    return false;
  }
}

/** Wallet proof: a real signMessage signature. Mock mode also accepts the handle's demo wallet without a signature, clearly labelled. */
export function checkProof(mode: "live" | "mock", message: string, wallet: string | undefined, signature: string | undefined, handle: string): { wallet: string; simulated: boolean } {
  if (wallet && signature && verifySignature(message, wallet, signature)) return { wallet, simulated: false };
  if (mode === "mock") return { wallet: wallet || demoWallet(handle), simulated: true };
  throw new ApiError("BAD_SIGNATURE", "Sign the message with your wallet to prove it is yours.", 401);
}

export async function enterChallenge(store: Store, challengeId: string, graphId: string, author: string): Promise<{ ok: boolean; reasons: string[] }> {
  const c = await store.getChallenge(challengeId);
  if (!c || c.kind !== "episode") throw new ApiError("NOT_FOUND", "No such episode challenge.", 404);
  if (Date.now() > c.endsAt) throw new ApiError("CLOSED", "This challenge has ended.", 409);
  const g = await store.getGraph(graphId);
  if (!g) throw new ApiError("NOT_FOUND", "No such mechanic.", 404);
  if (g.kind !== "mechanic") throw new ApiError("NOT_MECHANIC", "Only mechanics can enter.");
  if (g.licenseType !== "free") throw new ApiError("NOT_FREE", "Entries must be free to fork so winners join the shared library.");
  if (g.authorId !== author) throw new ApiError("NOT_OWNER", "You can only enter mechanics you published.", 403);
  const rule = checkRule(c.ruleId ?? "", g.graph); // authoritative server check; never trust the browser
  if (!rule.ok) return rule;
  try {
    await store.putEntry({ _id: `${challengeId}:${graphId}`, challengeId, graphId, author, rule, votes: 0, createdAt: Date.now() });
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", e.message, 409);
    throw e;
  }
  await store.log({ kind: "publish", text: `@${author} entered ${g.title} in ${c.title}`, ref: graphId, at: Date.now() });
  return rule;
}

export async function castVote(store: Store, challengeId: string, graphId: string, voter: string, voterHandle: string) {
  const entry = (await store.entries(challengeId)).find((e) => e.graphId === graphId);
  if (!entry) throw new ApiError("NOT_FOUND", "That mechanic is not entered.", 404);
  if (entry.author === voterHandle) throw new ApiError("OWN_ENTRY", "You cannot vote for your own entry.", 403);
  // Sybil mitigation (not prevention): voters need one verified play in any challenge first.
  const plays = await Promise.all((await store.listChallenges()).map((c) => store.replays(c._id)));
  if (!plays.flat().some((r) => r.player === voterHandle || r.wallet === voter)) throw new ApiError("NEEDS_PLAY", "Post one verified play first, then you can vote.", 403);
  try {
    await store.vote(challengeId, graphId, voter);
  } catch (e) {
    if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", e.message, 409);
    throw e;
  }
}

export async function loadMinigame(store: Store, spec: MinigameSpec) {
  const [level, mech] = await Promise.all([store.getGraph(spec.levelHash), store.getGraph(spec.mechanicHash)]);
  if (!level || !mech) throw new ApiError("NOT_FOUND", "This week's game references a graph that is missing.", 500);
  return { level, mech };
}

/** The server replays the input script; the score on the board comes from this result, never from the client. */
export async function submitReplay(store: Store, challengeId: string, input: { player: string; wallet?: string; script: unknown; claimedScore?: number }) {
  const c = await store.getChallenge(challengeId);
  if (!c) throw new ApiError("NOT_FOUND", "No such challenge.", 404);
  if (Date.now() > c.endsAt) throw new ApiError("CLOSED", "This challenge has ended.", 409);
  let result;
  let graphId: string;
  let seed: number;
  try {
    if (c.kind === "game" && c.minigame) {
      const { level, mech } = await loadMinigame(store, c.minigame);
      result = verifyMinigameReplay(c.minigame, level.graph, mech.graph, input.script);
      graphId = mech._id;
      seed = c.minigame.seed;
    } else {
      const s = input.script as { graphHash?: string };
      const g = s?.graphHash ? await store.getGraph(String(s.graphHash)) : null;
      if (!g) throw new ApiError("NOT_FOUND", "Replay names an unknown mechanic.", 404);
      result = verifyReplay(g.graph, g._id, input.script);
      graphId = g._id;
      seed = c.seed;
    }
  } catch (e) {
    if (e instanceof ReplayError) throw new ApiError(`REPLAY_${e.code}`, e.message, 422);
    throw e;
  }
  const script = input.script as { inputs: Array<[number, number]> };
  const doc: ReplayDoc = {
    _id: hashOf({ c: challengeId, p: input.player, s: input.script as Record<string, unknown> }), challengeId, graphId, player: input.player, wallet: input.wallet,
    score: result.score, ticks: result.ticks, inputs: script.inputs, seed, endedBy: result.endedBy, verifiedAt: Date.now(),
  };
  await store.putReplay(doc).catch((e) => { if (e instanceof DuplicateError) throw new ApiError("DUPLICATE", e.message, 409); throw e; });
  await store.log({ kind: "score", text: `@${input.player} scored ${result.score} (verified by replay)`, ref: challengeId, at: Date.now() });
  const forged = typeof input.claimedScore === "number" && input.claimedScore !== result.score;
  return { ...result, replayId: doc._id, forgedClaimRejected: forged, claimedScore: input.claimedScore };
}

/** Best verified replay per player, ranked. */
export async function playerStandings(store: Store, challengeId: string) {
  const best = new Map<string, ReplayDoc>();
  for (const r of await store.replays(challengeId)) {
    const cur = best.get(r.player);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.verifiedAt < cur.verifiedAt)) best.set(r.player, r);
  }
  const rows = [...best.values()].map((r) => ({ player: r.player, wallet: r.wallet ?? demoWallet(r.player), score: r.score, replayHash: r._id, verifiedAt: r.verifiedAt, ticks: r.ticks, endedBy: r.endedBy }));
  return rankPlayers(rows).map((r) => ({ ...r, verifiedAt: r.verifiedAt ?? 0 })) as Array<(typeof rows)[number]>;
}

export async function contributorsOf(store: Store, mech: GraphDoc) {
  return Promise.all(mech.shares.map(async (s) => ({ handle: s.handle, wallet: s.wallet ?? (await store.getUser(s.handle))?.pubkey ?? demoWallet(s.handle), bps: s.bps })));
}

/**
 * Everyone who made this week's game: the mechanic's authors (half of the makers' pot, by their blocks),
 * the level's author (a quarter) and the look's author (a quarter). Without a voted look the level takes a third.
 */
export async function makersOf(store: Store, c: ChallengeDoc, mech: GraphDoc, level: GraphDoc | null) {
  const wallet = async (h: string) => (await store.getUser(h))?.pubkey ?? demoWallet(h);
  const parts: Array<{ handle: string; wallet: string; weight: number }> = [];
  const mechWeight = c.look ? 0.5 : level ? 2 / 3 : 1;
  for (const s of await contributorsOf(store, mech)) parts.push({ handle: s.handle, wallet: s.wallet, weight: (mechWeight * s.bps) / 10_000 });
  if (level) parts.push({ handle: level.authorId, wallet: await wallet(level.authorId), weight: c.look ? 0.25 : 1 / 3 });
  if (c.look) parts.push({ handle: c.look.author, wallet: await wallet(c.look.author), weight: 0.25 });
  const merged = new Map<string, { handle: string; wallet: string; weight: number }>();
  for (const p of parts) { const m = merged.get(p.wallet); if (m) m.weight += p.weight; else merged.set(p.wallet, { ...p }); }
  const list = [...merged.values()];
  const out = list.map((p) => ({ handle: p.handle, wallet: p.wallet, bps: Math.floor(p.weight * 10_000) }));
  const left = 10_000 - out.reduce((s, x) => s + x.bps, 0);
  if (out.length) out[0].bps += left;
  return out.filter((x) => x.bps > 0);
}

export async function snapshotFor(store: Store, c: ChallengeDoc): Promise<Omit<ChallengeSnapshot, "schema" | "payouts">> {
  if (c.kind === "game" && c.minigame) {
    const { mech, level } = await loadMinigame(store, c.minigame);
    const players = (await playerStandings(store, c._id)).map(({ player, wallet, score, replayHash, verifiedAt }) => ({ player, wallet, score, replayHash, verifiedAt }));
    return { challengeId: c._id, kind: "game", endedAt: c.endsAt, builders: [], game: { levelHash: c.minigame.levelHash, mechanicHash: c.minigame.mechanicHash, seed: c.minigame.seed }, players, contributors: await makersOf(store, c, mech, level) };
  }
  const entries = await store.entries(c._id);
  const builders = await Promise.all(entries.map(async (e) => ({ graph: e.graphId, author: e.author, wallet: (await store.getUser(e.author))?.pubkey ?? demoWallet(e.author), votes: e.votes, ruleOk: e.rule.ok, publishedAt: e.createdAt })));
  return { challengeId: c._id, kind: "episode", endedAt: c.endsAt, builders, players: [], contributors: [] };
}

/** Projected payouts for live standings, labelled projected until settled. */
export async function projectedPayouts(store: Store, c: ChallengeDoc) {
  const snap = await snapshotFor(store, c);
  try {
    const lines = flattenPayout(snap);
    const lam = lamportsFor(c.prize.poolLamports, lines);
    const handles = new Map<string, { handle: string; role: "player" | "contributor" | "builder" }>();
    for (const p of snap.players) handles.set(p.wallet, { handle: p.player, role: "player" });
    for (const k of snap.contributors) if (!handles.has(k.wallet)) handles.set(k.wallet, { handle: k.handle, role: "contributor" });
    for (const b of snap.builders) if (!handles.has(b.wallet)) handles.set(b.wallet, { handle: b.author, role: "builder" });
    return lines.map((l, i) => ({ ...l, lamports: lam[i], ...(handles.get(l.wallet) ?? { handle: "?", role: "player" as const }) }));
  } catch (e) {
    if (e instanceof PayoutError) return [];
    throw e;
  }
}

export type SettleSender = (c: ChallengeDoc, snapshotHash: string, payouts: Array<{ wallet: string; bps: number }>) => Promise<{ sig: string; simulated: boolean }>;

/** Authority only, after endsAt. Write the snapshot first, then send settle plus a Memo with the same hash. Idempotent. */
export async function settleChallenge(store: Store, challengeId: string, send: SettleSender, now = Date.now()) {
  const c = await store.getChallenge(challengeId);
  if (!c) throw new ApiError("NOT_FOUND", "No such challenge.", 404);
  if (c.prize.status === "settled") return { already: true, challenge: c };
  if (c.prize.status !== "open") throw new ApiError("NOT_OPEN", `This challenge is ${c.prize.status.replace("_", " ")}.`, 409);
  if (now < c.endsAt) throw new ApiError("TOO_EARLY", "This challenge has not ended yet.", 409);
  const base = await snapshotFor(store, c);
  let body: ChallengeSnapshot;
  try {
    body = buildSnapshot(base);
  } catch (e) {
    if (e instanceof PayoutError && e.code === "NO_WINNERS") {
      c.prize.status = "no_winners";
      await store.putChallenge(c);
      throw new ApiError("NO_WINNERS", "No verified winners. The creator can reclaim the pool after the grace period.", 409);
    }
    throw e;
  }
  const hash = snapshotBodyHash(body);
  await store.putSnapshot({ _id: c._id, schema: body.schema, hash, body });
  const { sig, simulated } = await send(c, hash, body.payouts);
  const roles = new Map<string, { handle: string; role: "player" | "contributor" | "builder" }>();
  for (const p of body.players) roles.set(p.wallet, { handle: p.player, role: "player" });
  for (const k of body.contributors) if (!roles.has(k.wallet)) roles.set(k.wallet, { handle: k.handle, role: "contributor" });
  for (const b of body.builders) if (!roles.has(b.wallet)) roles.set(b.wallet, { handle: b.author, role: "builder" });
  c.prize = { ...c.prize, status: "settled", settleSig: sig, simulated, snapshotHash: hash, payouts: body.payouts.map((p) => ({ ...p, ...roles.get(p.wallet) })) };
  if (c.kind === "episode") {
    const top = body.builders.filter((b) => b.ruleOk).sort((a, b) => b.votes - a.votes || a.publishedAt - b.publishedAt)[0];
    if (top) c.winner = { graphHash: top.graph, fromChallenge: c._id, votes: top.votes };
  }
  await store.putChallenge(c);
  await store.putSnapshot({ _id: c._id, schema: body.schema, hash, body, anchorSig: sig });
  const players = body.players.length;
  const contributors = body.contributors.length;
  await store.log({ kind: "settle", text: `${c.title} settled: paid ${c.kind === "game" ? `${Math.min(players, 3)} players and ${contributors} contributors` : `${body.payouts.length} builders`}${simulated ? " (Simulated)" : ""}`, ref: c._id, at: now });
  return { already: false, challenge: c };
}

/** Winning mechanic: winner of the most recently settled episode, else the most-forked free mechanic. */
export async function currentWinner(store: Store): Promise<{ doc: GraphDoc; fromChallenge?: ChallengeDoc; fallback: boolean } | null> {
  const eps = (await store.listChallenges()).filter((c) => c.kind === "episode" && c.prize.status === "settled" && c.winner).sort((a, b) => b.endsAt - a.endsAt);
  for (const ep of eps) {
    const d = await store.getGraph(ep.winner!.graphHash);
    if (d) return { doc: d, fromChallenge: ep, fallback: false };
  }
  const [top] = await store.listGraphs({ kind: "mechanic", license: "free", sort: "forks", limit: 1 });
  return top ? { doc: top, fallback: true } : null;
}

/** Opens next week's game if it does not exist yet (idempotent by ISO week id). */
export async function ensureWeeklyGame(store: Store, at: Date, poolLamports: number, create?: (c: ChallengeDoc) => Promise<{ pda?: string; sig?: string }>) {
  const id = gameIdFor(at);
  const existing = await store.getChallenge(id);
  if (existing) return { created: false, challenge: existing };
  // the community's vote decides; without votes, fall back to last episode's winner and the level rotation
  const voted = await ballotWinners(store, id);
  const votedMech = voted.mechanic ? await store.getGraph(voted.mechanic.graphId) : null;
  const winner = votedMech && votedMech.kind === "mechanic" ? { doc: votedMech, fromChallenge: undefined } : await currentWinner(store);
  if (!winner) throw new ApiError("NO_MECHANIC", "No free mechanic to run this week.", 409);
  const levels = await store.listGraphs({ kind: "level", sort: "new", limit: 50 });
  const seeded = levels.filter((l) => ["Arena", "Gauntlet", "Orchard"].includes(l.title)).sort((a, b) => a.title.localeCompare(b.title));
  const pool = seeded.length ? seeded : levels;
  if (!pool.length) throw new ApiError("NO_LEVEL", "No level to host the game.", 409);
  const votedLevel = voted.level ? await store.getGraph(voted.level.graphId) : null;
  // rotation: start from this week's place in the list, take the first level the mechanic can actually play
  const start = Number(id.slice(-2)) % pool.length;
  const turn = [...pool.slice(start), ...pool.slice(0, start)];
  const level = votedLevel && votedLevel.kind === "level" ? votedLevel : turn.find((l) => fits(l.graph, winner.doc.graph)) ?? turn[0];
  const lookAsset = voted.look ? await store.getAsset(voted.look.graphId) : null;
  const spec: MinigameSpec = { schema: MINIGAME_SCHEMA, levelHash: level._id, mechanicHash: winner.doc._id, seed: weekSeed(id), maxTicks: 3600, scoring: { kind: "score" } };
  const { startsAt, endsAt } = weekBounds(id, at.getTime());
  const c: ChallengeDoc = {
    _id: id, kind: "game", episode: id.replace("game-", ""), title: `${level.title} with ${winner.doc.title}`, seed: spec.seed, startsAt, endsAt,
    minigame: spec, featuredGraph: winner.doc._id, winner: winner.fromChallenge?.winner,
    look: lookAsset?.asset.theme ? { assetId: lookAsset._id, title: lookAsset.title, author: lookAsset.authorId, theme: lookAsset.asset.theme } : undefined,
    chosenBy: votedMech || votedLevel || lookAsset ? "vote" : "rotation",
    prize: { poolLamports, maxWinners: 12, status: "open" },
  };
  if (create) {
    const r = await create(c);
    c.prize.pda = r.pda;
  }
  await store.putChallenge(c);
  return { created: true, challenge: c };
}
