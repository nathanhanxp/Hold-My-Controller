import type { GraphDoc, Store, User } from "../store/types";
import { recordTokenLicense } from "./license";
import { ApiError } from "./publish";
import { weekBounds } from "../store/seed";

/*
 * Tokens: 1 token = 0.000001 devnet SOL (stored as 1,000,000 units per token). Every handle starts with a grant; licence splits and prize payouts
 * add to the balance; AI plans spend from it. A plan picks the model that builds your games for 7 days.
 */

export const TOKEN_LAMPORTS = 1_000_000;
export const GRANT_TOKENS = 500;
const WEEK = 7 * 86_400_000;
const ULTRA = "nvidia/nemotron-3-ultra-550b-a55b";

export type Tier = "standard" | "pro" | "max";
export const PLANS: Record<Tier, { label: string; tokens: number; model: string; detail: string; prefer: { order: Array<"gemini" | "nemotron">; models: { gemini?: string; nemotron?: string } } }> = {
  standard: { label: "Standard", tokens: 0, model: "Nemotron 3 Ultra", detail: "Strong results, about 40 seconds a request.", prefer: { order: ["nemotron", "gemini"], models: { nemotron: ULTRA } } },
  pro: { label: "Pro", tokens: 150, model: "Gemini 3.5 Flash-Lite, Nemotron 3 Ultra as backup", detail: "About 10 seconds a request.", prefer: { order: ["gemini", "nemotron"], models: { gemini: "gemini-3.5-flash-lite", nemotron: ULTRA } } },
  max: { label: "Max", tokens: 400, model: "Gemini 3.5 Flash, Flash-Lite and Ultra as backup", detail: "The strongest Gemini model first.", prefer: { order: ["gemini", "nemotron"], models: { gemini: "gemini-3.5-flash", nemotron: ULTRA } } },
};

export function activeTier(u: User | null, now = Date.now()): Tier {
  return u?.plan && u.plan.until > now ? u.plan.tier : "standard";
}

/** Voting pays: 1 token for your first vote in each slot of a week's ballot, 1 more once that slot closes if your pick won. */
export const VOTE_TOKENS = 1;
export const WIN_BONUS_TOKENS = 1;

export async function voteRewards(store: Store, handle: string, now = Date.now()) {
  const ballots = new Map<string, Set<string>>();
  for (const v of await store.votesBy(handle)) {
    if (!v.challengeId.startsWith("finalists:")) continue;
    const s = ballots.get(v.challengeId) ?? new Set<string>();
    s.add(v.graphId);
    ballots.set(v.challengeId, s);
  }
  let voted = 0, won = 0;
  for (const [bid, picks] of ballots) {
    voted += 1;
    const game = bid.split(":")[1] ?? "";
    if (now < weekBounds(game, Infinity).startsAt) continue; // still open: the winner isn't decided
    const top = (await store.entries(bid)).filter((e) => e.votes > 0).sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt)[0];
    if (top && picks.has(top.graphId)) won += 1;
  }
  return { voted, won, tokens: voted * VOTE_TOKENS + won * WIN_BONUS_TOKENS };
}

export async function tokenAccount(store: Store, handle: string, now = Date.now()) {
  const user = await store.getUser(handle);
  let earned = 0;
  for (const l of await store.allLicenses()) for (const s of l.split) if (s.handle === handle) earned += s.lamports;
  for (const c of await store.listChallenges()) {
    for (const p of c.prize.payouts ?? []) if (p.handle === handle) earned += Math.floor((c.prize.poolLamports * p.bps) / 10_000);
  }
  const votes = await voteRewards(store, handle, now);
  earned += votes.tokens * TOKEN_LAMPORTS;
  const spent = user?.spentLamports ?? 0;
  const balance = GRANT_TOKENS * TOKEN_LAMPORTS + earned - spent;
  const tier = activeTier(user, now);
  return {
    handle,
    tokens: Math.floor(balance / TOKEN_LAMPORTS),
    earnedTokens: Math.floor(earned / TOKEN_LAMPORTS),
    spentTokens: Math.floor(spent / TOKEN_LAMPORTS),
    voteTokens: votes.tokens,
    votes: { ballots: votes.voted, wins: votes.won },
    grantTokens: GRANT_TOKENS,
    plan: { tier, until: tier === "standard" ? null : user!.plan!.until, ...PLANS[tier] },
  };
}

/** Take tokens from a balance, or refuse with how many are missing. */
export async function spendTokens(store: Store, handle: string, tokens: number, what: string, now = Date.now(), patch: Partial<User> = {}) {
  const acct = await tokenAccount(store, handle, now);
  if (acct.tokens < tokens) throw new ApiError("NOT_ENOUGH", `${what} costs ${tokens} tokens and you have ${acct.tokens}.`, 402);
  const user = (await store.getUser(handle)) ?? { _id: handle, createdAt: now };
  const ledger = [...(user.ledger ?? []), { at: now, tokens: -tokens, what }].slice(-200);
  await store.upsertUser({ ...user, ...patch, spentLamports: (user.spentLamports ?? 0) + tokens * TOKEN_LAMPORTS, ledger });
}

/** License a game with tokens (no wallet needed): the price leaves your balance and is split between its creators. */
export async function payWithTokens(store: Store, d: GraphDoc, buyer: string, now = Date.now()) {
  if (d.license.type !== "paid") throw new ApiError("FREE_MECHANIC", "This game is free to fork. Nothing to pay.");
  const price = Math.round(d.license.priceLamports / TOKEN_LAMPORTS);
  // check before taking tokens: one license per person per game
  if ((await store.licensesFor(d._id)).some((l) => l.buyerHandle === buyer && !l.sig.includes("demo"))) throw new ApiError("DOUBLE_LICENSE", `You already licensed ${d.title}. You can fork it any time.`, 409);
  await spendTokens(store, buyer, price, `Licensed ${d.title}`, now);
  return recordTokenLicense(store, d, buyer, d.license.priceLamports);
}

/** Demo: someone licenses the latest game you have blocks in, so you can watch the split reach every creator. */
export const DEMO_PRICE_TOKENS = 10;
/** Games with your blocks in them, newest first: the ones a sale would pay you for. */
export async function paidGames(store: Store, handle: string) {
  const mine = (await store.listGraphs({ sort: "new", limit: 500 })).filter((g) => g.shares.some((s) => s.handle === handle));
  return mine.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((g) => ({
    id: g._id, title: g.title, bps: g.shares.find((s) => s.handle === handle)!.bps, creators: g.shares.length,
    priceTokens: g.license.type === "paid" ? g.license.priceLamports / TOKEN_LAMPORTS : DEMO_PRICE_TOKENS,
  }));
}

export async function demoGetPaid(store: Store, handle: string, graphId?: string) {
  const mine = (await store.listGraphs({ sort: "new", limit: 500 })).filter((g) => g.shares.some((s) => s.handle === handle));
  const d = graphId ? mine.find((g) => g._id === graphId) : mine.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (graphId && !d) throw new ApiError("NOT_YOURS", "None of your blocks are in that game, so a sale wouldn't pay you.", 404);
  if (!d) throw new ApiError("NO_GAMES", "Publish a game or a fork first. You get paid for the blocks you add.", 404);
  // a different seeded player each time, so the history reads like separate sales
  const others = ["rhea", "sol", "kai", "mira", "ana", "lena", "theo", "omar", "jules"].filter((h) => !d.shares.some((s) => s.handle === h));
  const sold = (await store.licensesFor(d._id)).length;
  const buyer = others.length ? others[sold % others.length] : "rhea";
  const price = d.license.type === "paid" ? d.license.priceLamports : DEMO_PRICE_TOKENS * TOKEN_LAMPORTS;
  const lic = await recordTokenLicense(store, d, buyer, price, true);
  return { license: lic, title: d.title, hash: d._id };
}

export type HistoryRow = { at: number; tokens: number; what: string };

/** Every token in and out of a balance, newest first. */
export async function tokenHistory(store: Store, handle: string, now = Date.now()): Promise<HistoryRow[]> {
  const user = await store.getUser(handle);
  const rows: HistoryRow[] = [{ at: user?.createdAt ?? 0, tokens: GRANT_TOKENS, what: "Welcome grant" }];
  const titles = new Map<string, string>();
  const title = async (id: string) => { if (!titles.has(id)) titles.set(id, (await store.getGraph(id))?.title ?? "a game"); return titles.get(id)!; };
  for (const l of await store.allLicenses()) {
    for (const s of l.split) {
      if (s.handle !== handle || !s.lamports) continue;
      rows.push({ at: l.createdAt, tokens: s.lamports / TOKEN_LAMPORTS, what: `${l.buyerHandle ? `@${l.buyerHandle}` : "Someone"} licensed ${await title(l.graphId)}: your share${l.sig.includes("demo") ? " (demo)" : ""}` });
    }
  }
  for (const c of await store.listChallenges()) {
    for (const p of c.prize.payouts ?? []) if (p.handle === handle) rows.push({ at: c.endsAt, tokens: Math.floor((c.prize.poolLamports * p.bps) / 10_000) / TOKEN_LAMPORTS, what: `Prize from ${c.title}` });
  }
  const seen = new Set<string>();
  for (const v of (await store.votesBy(handle)).sort((a, b) => a.createdAt - b.createdAt)) {
    if (!v.challengeId.startsWith("finalists:") || seen.has(v.challengeId)) continue;
    seen.add(v.challengeId);
    rows.push({ at: v.createdAt, tokens: VOTE_TOKENS, what: `Voted on next week's ${v.challengeId.split(":")[2] ?? "game"}` });
  }
  const votes = await voteRewards(store, handle, now);
  if (votes.won) rows.push({ at: now, tokens: votes.won * WIN_BONUS_TOKENS, what: `Your pick won ${votes.won} slot${votes.won === 1 ? "" : "s"}` });
  for (const e of user?.ledger ?? []) rows.push(e);
  // spending from before the history existed
  const logged = (user?.ledger ?? []).reduce((t, e) => t - Math.min(0, e.tokens), 0);
  const unlogged = Math.floor((user?.spentLamports ?? 0) / TOKEN_LAMPORTS) - logged;
  if (unlogged > 0) rows.push({ at: user?.plan ? user.plan.until - WEEK : now, tokens: -unlogged, what: "AI plan" });
  // handles made before join dates were stored: date the grant just before their first activity
  if (!user?.createdAt) rows[0].at = Math.min(now, ...rows.slice(1).map((r) => r.at).filter((t) => t > 0)) - 1;
  return rows.map((r) => ({ ...r, tokens: Math.round(r.tokens * 1000) / 1000 })).sort((a, b) => b.at - a.at);
}

/** Putting a piece on the ballot costs a little, so the ballot stays short and worth reading. */
export const NOMINATE_TOKENS = 20;

/** Spend tokens on a plan for 7 days; buying the same plan again extends it. */
export async function buyPlan(store: Store, handle: string, tier: Tier, now = Date.now()) {
  if (tier === "standard" || !PLANS[tier]) throw new ApiError("BAD_PLAN", "Choose Pro or Max.");
  const acct = await tokenAccount(store, handle, now);
  const price = PLANS[tier].tokens;
  if (acct.tokens < price) throw new ApiError("NOT_ENOUGH", `You need ${price} tokens and have ${acct.tokens}.`, 402);
  const user = (await store.getUser(handle)) ?? { _id: handle, createdAt: now };
  const from = user.plan && user.plan.tier === tier && user.plan.until > now ? user.plan.until : now;
  await spendTokens(store, handle, price, `${PLANS[tier].label} AI plan for 7 days`, now, { plan: { tier, until: from + WEEK } });
  return tokenAccount(store, handle, now);
}

/** Which models answer for this editor (their plan), used by the assistant. */
export async function preferFor(store: Store, handle: string | undefined) {
  if (!handle) return PLANS.standard.prefer;
  return PLANS[activeTier(await store.getUser(handle))].prefer;
}
