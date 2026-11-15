import {
  ASSET_SCHEMA, KEYS, shooterGraph, groveGraph, hurdleGraph, trickshotGraph, siegeGraph, skyStages, computeShares, platformerGraph, structureVector, STRUCTURE_DIM, MINIGAME_SCHEMA, arenaLevel, buildSnapshot, checkRule, collectGraph, dodgeGraph, dx, ex, forkGraph, gauntletLevel, jumpGraph,
  orchardLevel, snapshotBodyHash, verifyMinigameReplay, hashOf, type Graph, type MinigameSpec,
} from "@forklab/engine";
import { lineageHashes, publishAsset, publishGraph, sharesWithWallets, type PublishDeps } from "../services/publish";
import { demoWallet, SEED_HANDLES } from "../wallets";
import { gameIdFor, weekSeed } from "../services/weeks";
import { fits } from "../services/finalists";
import type { ChallengeDoc, GraphDoc, Store } from "./types";

const DAY = 86_400_000;
const SPACE = 1 << KEYS.indexOf("Space");

/** Gust, by @lena, forked from Jump: a random gust pushes the player every half second (passes the Wind rule). */
function gustGraph(jump: Graph, jumpHash: string): Graph {
  const g = forkGraph(jump, jumpHash);
  g.title = "Gust";
  g.tags = ["wind", "one-key", "jump"];
  g.theme = { sky: "#06121A", ground: "#5FC3E4", accent: "#E9965F" };
  g.nodes.push(
    { id: "w01", type: "OnTick", params: { everyN: 30 }, authorId: "lena", originFork: "", pos: { x: 0, y: 900 } },
    { id: "w02", type: "AddVelocity", params: { entity: "player", vx: 0, vy: 0 }, authorId: "lena", originFork: "", pos: { x: 240, y: 900 } },
    { id: "w03", type: "Random", params: { min: -40, max: 40, stream: "wind" }, authorId: "lena", originFork: "", pos: { x: 0, y: 1000 } },
  );
  g.edges.push(ex("w01", "w02"), dx("w03", "w02", "vx"));
  return g;
}

/** Temple, by @omar, forked from Dodge: a sacred stone sits in the middle; touching it loses (passes the Sacred object rule). */
function templeGraph(dodge: Graph, dodgeHash: string): Graph {
  const g = forkGraph(dodge, dodgeHash);
  g.title = "Temple";
  g.tags = ["sacred", "one-key", "dodge"];
  g.theme = { sky: "#140B08", ground: "#D27A45", accent: "#E2B75A" };
  g.nodes.push(
    { id: "t01", type: "Spawn", params: { prefab: "sacred", x: 11500, y: 0 }, authorId: "omar", originFork: "", pos: { x: 480, y: 0 } },
    { id: "t02", type: "OnCollide", params: { tagA: "player", tagB: "sacred" }, authorId: "omar", originFork: "", pos: { x: 0, y: 1000 } },
    { id: "t03", type: "Lose", params: {}, authorId: "omar", originFork: "", pos: { x: 240, y: 1000 } },
  );
  g.edges.push(ex("n02", "t01"), ex("t02", "t03"));
  return g;
}

/** Hop, by @jules: a fresh root, two keys (fails One key). */
function hopGraph(): Graph {
  const g = jumpGraph();
  g.title = "Hop and dash";
  g.tags = ["jump", "two-keys", "runner"];
  for (const n of g.nodes) n.authorId = "jules";
  g.nodes.push(
    { id: "h01", type: "OnKey", params: { key: "ArrowRight", when: "held" }, authorId: "jules", originFork: "", pos: { x: 0, y: 900 } },
    { id: "h02", type: "AddVelocity", params: { entity: "player", vx: 6, vy: 0 }, authorId: "jules", originFork: "", pos: { x: 240, y: 900 } },
  );
  g.edges.push(ex("h01", "h02"));
  return g;
}

/** Deterministic bot that presses Space on a schedule; its runs are verified like any player's. */
function botRun(spec: MinigameSpec, level: Graph, mech: Graph, every: number, offset: number) {
  const inputs: Array<[number, number]> = [];
  for (let t = offset; t < spec.maxTicks; t += every) inputs.push([t, SPACE], [t + 1, 0]);
  const script = { graphHash: spec.mechanicHash, seed: spec.seed, ticks: spec.maxTicks, inputs: inputs.slice(0, 4000) };
  return { script, result: verifyMinigameReplay(spec, level, mech, script) };
}

export async function seedStore(store: Store, mode: "live" | "mock", embedNow: PublishDeps["embedNow"], describe: PublishDeps["describe"]) {
  const now = Date.now();
  for (const [i, h] of SEED_HANDLES.entries()) await store.upsertUser({ _id: h, pubkey: demoWallet(h), color: i % 6, createdAt: now - 40 * DAY });
  const deps = (age: number): PublishDeps => ({ store, mode, now: now - age, embedNow, describe });
  const pub = async (g: Graph, author: string, age: number) => {
    const doc = await publishGraph(deps(age), { draft: g, author });
    // mock mode: simulated anchors; live mode: leave pending so the chain worker anchors them on devnet
    if (mode === "mock") await store.updateGraph(doc._id, { anchor: { status: "simulated", sig: `SIMULATED-${doc._id.slice(0, 16)}`, note: "Seeded in mock mode" } });
    return doc;
  };

  const jump = await pub(jumpGraph(), "mira", 30 * DAY);
  const dodge = await pub(dodgeGraph(jump._id), "theo", 24 * DAY);
  const collect = await pub(collectGraph(dodge.graph, dodge._id), "ana", 18 * DAY);
  const gust = await pub(gustGraph(jump.graph, jump._id), "lena", 12 * DAY);
  const temple = await pub(templeGraph(dodge.graph, dodge._id), "omar", 6 * DAY);
  const hop = await pub(hopGraph(), "jules", 3 * DAY);
  const levels: GraphDoc[] = [];
  for (const [i, l] of [arenaLevel(), gauntletLevel(), orchardLevel()].entries()) levels.push(await pub(l, "kai", (28 - i) * DAY));

  // stats so trending and most-forked have something to sort by
  const stats: Array<[GraphDoc, number]> = [[jump, 140], [dodge, 320], [collect, 90], [gust, 45], [temple, 30], [hop, 12]];
  for (const [d, plays] of stats) await store.bumpStat(d._id, "plays", plays);

  for (const a of [
    { title: "Boulder", tags: ["hazard", "rock"], authorId: "rhea", prefab: { tag: "rock", w: 1000, h: 1000, vx: 0, vy: -60, color: "#3B3530" } },
    { title: "Swift runner", tags: ["enemy", "fast"], authorId: "sol", prefab: { tag: "enemy", w: 500, h: 500, vx: -130, vy: 0, color: "#B4532A" } },
    { title: "Gold drachma", tags: ["coin", "pickup"], authorId: "ana", prefab: { tag: "coin", w: 300, h: 300, vx: 0, vy: 0, color: "#B3862A" } },
  ]) await publishAsset(deps(10 * DAY), { asset: { schema: ASSET_SCHEMA, kind: "prefab", parent: null, license: { type: "free" }, ...a } });
  for (const t of [
    { title: "Wine dark sea", tags: ["sea", "dark"], authorId: "rhea", theme: { sky: "#1B2A33", ground: "#5A2A3A", accent: "#C8773E" } },
    { title: "Island night", tags: ["island", "night"], authorId: "kai", theme: { sky: "#08111A", ground: "#9CC27A", accent: "#5FC3E4" } },
    { title: "Red figure", tags: ["vase", "terracotta"], authorId: "sol", theme: { sky: "#0F0906", ground: "#D27A45", accent: "#ECE6D8" } },
  ]) await publishAsset(deps(9 * DAY), { asset: { schema: ASSET_SCHEMA, kind: "theme", parent: null, license: { type: "free" }, ...t } });

  // Episode 1 (One key): settled, Dodge won. Episode 2 (Sacred object): open.
  const ep1Entries = [
    { g: dodge, votes: 41 }, { g: jump, votes: 22 }, { g: gust, votes: 17 }, { g: hop, votes: 9 },
  ];
  for (const e of ep1Entries) {
    await store.putEntry({ _id: `ep-1:${e.g._id}`, challengeId: "ep-1", graphId: e.g._id, author: e.g.authorId, rule: checkRule("one_key", e.g.graph), votes: e.votes, createdAt: e.g.createdAt });
  }
  const ep1Builders = (await store.entries("ep-1")).map((e) => ({ graph: e.graphId, author: e.author, wallet: demoWallet(e.author), votes: e.votes, ruleOk: e.rule.ok, publishedAt: e.createdAt }));
  const ep1Snap = buildSnapshot({ challengeId: "ep-1", kind: "episode", endedAt: now - 8 * DAY, builders: ep1Builders, players: [], contributors: [] });
  const ep1Hash = snapshotBodyHash(ep1Snap);
  await store.putSnapshot({ _id: "ep-1", schema: ep1Snap.schema, hash: ep1Hash, body: ep1Snap });
  const ep1: ChallengeDoc = {
    _id: "ep-1", kind: "episode", episode: "1", title: "One key", ruleId: "one_key", seed: 1, startsAt: now - 38 * DAY, endsAt: now - 8 * DAY,
    winner: { graphHash: dodge._id, fromChallenge: "ep-1", votes: 41 },
    prize: { poolLamports: 500_000_000, maxWinners: 3, status: "settled", simulated: true, settleSig: `SIMULATED-settle-ep-1`, snapshotHash: ep1Hash,
      payouts: ep1Snap.payouts.map((p) => ({ ...p, handle: ep1Builders.find((b) => b.wallet === p.wallet)?.author, role: "builder" as const })) },
  };
  await store.putChallenge(ep1);
  await store.putChallenge({
    _id: "ep-2", kind: "episode", episode: "2", title: "Sacred object", ruleId: "sacred", seed: 2, startsAt: now - 7 * DAY, endsAt: now + 21 * DAY,
    prize: { poolLamports: 500_000_000, maxWinners: 3, status: "open" },
  });
  await store.putEntry({ _id: `ep-2:${temple._id}`, challengeId: "ep-2", graphId: temple._id, author: "omar", rule: checkRule("sacred", temple.graph), votes: 6, createdAt: temple.createdAt });

  // Weekly games on the winning mechanic: last week (ended, ready to settle) and this week (open).
  const players = ["rhea", "sol", "jules", "lena"];
  for (const [offset, label] of [[-7, "last"], [0, "this"]] as const) {
    const at = now + offset * DAY;
    const id = gameIdFor(new Date(at));
    const start = Math.abs(Number(id.slice(-2))) % 3;
    const lvl = [...levels.slice(start), ...levels.slice(0, start)].find((l) => fits(l.graph, dodge.graph)) ?? levels[start];
    const spec: MinigameSpec = { schema: MINIGAME_SCHEMA, levelHash: lvl._id, mechanicHash: dodge._id, seed: weekSeed(id), maxTicks: 3600, scoring: { kind: "score" } };
    const { startsAt, endsAt } = weekBounds(id, at);
    await store.putChallenge({
      _id: id, kind: "game", episode: id.replace("game-", ""), title: `${lvl.title} with ${dodge.title}`, seed: spec.seed, startsAt, endsAt: label === "last" ? Math.min(endsAt, now - 3_600_000) : endsAt,
      minigame: spec, winner: { graphHash: dodge._id, fromChallenge: "ep-1", votes: 41 }, featuredGraph: dodge._id,
      prize: { poolLamports: 200_000_000, maxWinners: 12, status: "open" },
    });
    for (const [i, p] of players.entries()) {
      const { script, result } = botRun(spec, lvl.graph, dodge.graph, 37 + i * 11 + (label === "last" ? 3 : 0), 9 + i * 5);
      await store.putReplay({ _id: hashOf({ c: id, p, s: script }), challengeId: id, graphId: dodge._id, player: p, wallet: demoWallet(p), score: result.score, ticks: result.ticks, inputs: script.inputs, seed: spec.seed, endedBy: result.endedBy, verifiedAt: startsAt + (i + 1) * 3_600_000 });
    }
  }
  await store.putTeam({ _id: "t-harbor", name: "Harbor", members: ["rhea", "sol"], createdAt: now - 5 * DAY });
  await store.putTeam({ _id: "t-reef", name: "Reef", members: ["jules", "lena"], createdAt: now - 5 * DAY });

  await store.recordLicense({ _id: "lic-seed-1", graphId: collect._id, buyer: demoWallet("rhea"), buyerHandle: "rhea", sig: "SIMULATED-license-seed-1", priceLamports: 100_000_000, simulated: true, split: [], feeLamports: 5_000_000, createdAt: now - 2 * DAY });
  await store.bumpStat(collect._id, "licenses");
  await store.log({ kind: "license", text: "@rhea licensed Collect for 100 tokens (Simulated)", ref: collect._id, at: now - 2 * DAY });
  await store.log({ kind: "settle", text: "One key settled: paid 3 builders (Simulated)", ref: "ep-1", at: now - 8 * DAY + 3600_000 });
}

export function weekBounds(id: string, fallback: number): { startsAt: number; endsAt: number } {
  const m = /^game-(\d{4})(\d{2})$/.exec(id);
  if (!m) return { startsAt: fallback, endsAt: fallback + 7 * DAY };
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO week 1 contains Jan 4th; weeks start Monday 00:00 UTC.
  const jan4 = Date.UTC(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const start = jan4 - dow * DAY + (week - 1) * 7 * DAY;
  return { startsAt: start, endsAt: start + 7 * DAY };
}


/**
 * Idempotent top-up run at every start: publishes templates added after the store was first seeded
 * and refreshes structure vectors when the node catalog grows. Safe on a live database.
 */
export async function seedExtras(store: Store, mode: "live" | "mock", embedNow: PublishDeps["embedNow"], describe: PublishDeps["describe"]) {
  const now = Date.now();
  for (const h of ["rhea", "sol", "lena", "kai", "mira"]) if (!(await store.getUser(h))) await store.upsertUser({ _id: h, pubkey: demoWallet(h), createdAt: now });
  const existing = await store.listGraphs({ limit: 1000 });
  const titles = new Set(existing.map((g) => `${g.title}|${g.authorId}`));
  const extras: Array<[Graph, string, number]> = [[shooterGraph(), "rhea", 2], [groveGraph(), "sol", 2.5], [hurdleGraph(), "lena", 1.5], [trickshotGraph(), "kai", 0.8], [siegeGraph(), "rhea", 0.6], [platformerGraph(), "mira", 1.1]];
  for (const [g, author, days] of extras) {
    if (titles.has(`${g.title}|${author}`)) {
      // presentation (scene, camera) is not hashed: bring published copies up to date with the template
      const doc = existing.find((d) => d.title === g.title && d.authorId === author);
      if (doc && (JSON.stringify(doc.graph.scene ?? null) !== JSON.stringify(g.scene ?? null) || doc.graph.view !== g.view)) await store.updateGraph(doc._id, { graph: { ...doc.graph, scene: g.scene, view: g.view } });
      continue;
    }
    try {
      const doc = await publishGraph({ store, mode, now: now - days * DAY, embedNow, describe }, { draft: g, author });
      if (mode === "mock") await store.updateGraph(doc._id, { anchor: { status: "simulated", sig: `SIMULATED-${doc._id.slice(0, 16)}`, note: "Seeded in mock mode" } });
      await store.bumpStat(doc._id, "plays", Math.round(40 + days * 20));
    } catch (e) {
      if ((e as { code?: string }).code !== "DUPLICATE") throw e;
    }
  }
  for (const g of existing) if (g.structure?.length !== STRUCTURE_DIM) await store.updateGraph(g._id, { structure: structureVector(g.graph) });
  await seedCoForks(store, mode, embedNow, describe, now);
  await seedSkyChain(store, mode, embedNow, describe, now);
  await refreshShares(store);
  await repairWeeklyGame(store, now);
}

/**
 * A rotation week that paired a mechanic with a level it can't beat (Dodge has no jump; Gauntlet's runners must be
 * jumped) moves to the first level it can play. Only for rotation weeks with no prize account and only bot runs.
 */
async function repairWeeklyGame(store: Store, now: number) {
  const id = gameIdFor(new Date(now));
  const c = await store.getChallenge(id);
  if (!c?.minigame || c.chosenBy === "vote" || c.prize.pda || c.prize.status !== "open") return;
  const [level, mech] = await Promise.all([store.getGraph(c.minigame.levelHash), store.getGraph(c.minigame.mechanicHash)]);
  if (!level || !mech || fits(level.graph, mech.graph)) return;
  const bots = new Set(["rhea", "sol", "jules", "lena"]);
  if ((await store.replays(id)).some((r) => !bots.has(r.player))) return;
  const levels = (await store.listGraphs({ kind: "level", limit: 50 })).filter((l) => ["Arena", "Gauntlet", "Orchard"].includes(l.title)).sort((a, b) => a.title.localeCompare(b.title));
  const next = levels.find((l) => fits(l.graph, mech.graph));
  if (!next) return;
  const spec: MinigameSpec = { ...c.minigame, levelHash: next._id };
  await store.deleteReplays(id);
  await store.putChallenge({ ...c, minigame: spec, title: `${next.title} with ${mech.title}` });
  for (const [i, p] of [...bots].entries()) {
    const { script, result } = botRun(spec, next.graph, mech.graph, 37 + i * 11, 9 + i * 5);
    await store.putReplay({ _id: hashOf({ c: id, p, s: script }), challengeId: id, graphId: mech._id, player: p, wallet: demoWallet(p), score: result.score, ticks: result.ticks, inputs: script.inputs, seed: spec.seed, endedBy: result.endedBy, verifiedAt: c.startsAt + (i + 1) * 3_600_000 });
  }
}

type Step = { author: string; title: string; tags: string[]; priceTokens?: number; nodes: Array<[id: string, type: Graph["nodes"][number]["type"], params: Graph["nodes"][number]["params"]]>; edges: Array<[string, string]> };

/**
 * Forks of forks, so the library shows games with several creators: each step is published by a different
 * person, keeps everyone's blocks, and the last game in each chain pays all of them by their share of blocks.
 */
const CO_FORKS: Array<{ from: [title: string, author: string]; steps: Step[] }> = [
  {
    from: ["Trickshot", "kai"],
    steps: [
      { author: "lena", title: "Trickshot overtime", tags: ["basketball", "3d", "survival"], nodes: [["c01", "OnTick", { everyN: 600 }], ["c02", "AddScore", { n: 2 }]], edges: [["c01", "c02"]] },
      { author: "mira", title: "Trickshot rush", priceTokens: 10, tags: ["basketball", "3d", "enemies", "hard"], nodes: [["c11", "OnTick", { everyN: 100 }], ["c12", "Spawn", { prefab: "defender", x: 12500, y: 0, z: 3800 }]], edges: [["c11", "c12"]] },
    ],
  },
  {
    from: ["Arena shooter", "rhea"],
    steps: [
      { author: "sol", title: "Arena waves", tags: ["shooter", "3d", "wasd", "waves"], nodes: [["c21", "OnTick", { everyN: 200 }], ["c22", "Spawn", { prefab: "raider", x: 2500, y: 0, z: 300 }]], edges: [["c21", "c22"]] },
      { author: "ana", title: "Arena squad", priceTokens: 10, tags: ["shooter", "3d", "wasd", "survival"], nodes: [["c31", "OnTick", { everyN: 600 }], ["c32", "AddScore", { n: 5 }]], edges: [["c31", "c32"]] },
    ],
  },
];

/**
 * Splits follow the current attribution rule (only blocks that earn: not controls or setup). Published games whose
 * stored split predates it are brought up to date, unless the split is already registered on devnet.
 */
async function refreshShares(store: Store) {
  for (const d of await store.listGraphs({ limit: 1000 })) {
    if (d.anchor?.status === "confirmed") continue;
    const next = await sharesWithWallets(store, computeShares(d.graph, await lineageHashes(store, d.parentId ?? null)));
    if (d.license.type === "paid") for (const x of next) if (!x.wallet) { x.wallet = demoWallet(x.handle); x.demoWallet = true; }
    const key = (xs: Array<{ handle: string; bps: number }>) => JSON.stringify(xs.map((x) => [x.handle, x.bps]));
    if (key(next) !== key(d.shares)) await store.updateGraph(d._id, { shares: next });
  }
}

/**
 * Sky patrol is published the way people would build it: @lena publishes Sky glider, @kai forks it and adds
 * shooting (Sky gunner), @mira forks that and adds rings (Sky patrol). The last one pays all three.
 */
async function seedSkyChain(store: Store, mode: "live" | "mock", embedNow: PublishDeps["embedNow"], describe: PublishDeps["describe"], now: number) {
  const stages = skyStages();
  const authors = ["lena", "kai", "mira"];
  const all = await store.listGraphs({ limit: 1000 });
  let parent: GraphDoc | undefined;
  for (const [i, stage] of stages.entries()) {
    const have = all.find((d) => d.title === stage.title && d.authorId === authors[i]);
    if (have) { parent = have; continue; }
    let draft: Graph;
    if (!parent) draft = stage;
    else {
      draft = forkGraph(parent.graph, parent._id);
      const known = new Set(draft.nodes.map((n) => n.id));
      const keys = new Set(draft.edges.map((e) => `${e.from.node}.${e.from.port}>${e.to.node}.${e.to.port}`));
      draft.nodes.push(...stage.nodes.filter((n) => !known.has(n.id)).map((n) => ({ ...n, originFork: "" })));
      draft.edges.push(...stage.edges.filter((e) => !keys.has(`${e.from.node}.${e.from.port}>${e.to.node}.${e.to.port}`)));
      draft.title = stage.title;
      draft.tags = stage.tags;
      draft.scene = stage.scene;
      draft.prefabs = stage.prefabs;
    }
    try {
      const doc = await publishGraph({ store, mode, now: now - (0.6 - i * 0.2) * DAY, embedNow, describe }, { draft, author: authors[i] });
      if (mode === "mock") await store.updateGraph(doc._id, { anchor: { status: "simulated", sig: `SIMULATED-${doc._id.slice(0, 16)}`, note: "Seeded in mock mode" } });
      await store.bumpStat(doc._id, "plays", 30 + i * 20);
      parent = doc;
    } catch (e) {
      if ((e as { code?: string }).code !== "DUPLICATE") throw e;
      break;
    }
  }
}

async function seedCoForks(store: Store, mode: "live" | "mock", embedNow: PublishDeps["embedNow"], describe: PublishDeps["describe"], now: number) {
  const all = await store.listGraphs({ limit: 1000 });
  const find = (title: string, author: string) => all.find((d) => d.title === title && d.authorId === author);
  for (const chain of CO_FORKS) {
    let parent = find(...chain.from);
    for (const [i, step] of chain.steps.entries()) {
      if (!parent) break;
      const have = find(step.title, step.author);
      if (have) { parent = have; continue; }
      const g = forkGraph(parent.graph, parent._id);
      g.title = step.title;
      g.tags = step.tags;
      if (step.priceTokens) g.license = { type: "paid", priceLamports: step.priceTokens * 1_000_000 };
      g.nodes.push(...step.nodes.map(([id, type, params], k) => ({ id, type, params, authorId: step.author, originFork: "", pos: { x: 1100 + k * 240, y: 900 + i * 140 } })));
      g.edges.push(...step.edges.map(([a, b]) => ex(a, b)));
      try {
        const doc = await publishGraph({ store, mode, now: now - (0.5 - i * 0.2) * DAY, embedNow, describe }, { draft: g, author: step.author });
        if (mode === "mock") await store.updateGraph(doc._id, { anchor: { status: "simulated", sig: `SIMULATED-${doc._id.slice(0, 16)}`, note: "Seeded in mock mode" } });
        await store.bumpStat(doc._id, "plays", 25 + i * 15);
        parent = doc;
      } catch (e) {
        if ((e as { code?: string }).code !== "DUPLICATE") throw e;
        break;
      }
    }
  }
}
