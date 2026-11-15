// Hourly job (systemd timer on the Vultr VM): settle every ended open challenge, then open next week's game.
// Idempotent: challenge ids come from the ISO week, settled challenges are skipped, and the game is created once.
import { loadDotEnv } from "./lib/env";
import { MongoStore } from "../web/lib/store/mongo";
import { ensureWeeklyGame, settleChallenge } from "../web/lib/services/challenges";
import { devnetCreateChallenge, devnetSettleSender, simulatedSender, chainLive } from "../web/lib/services/chain-server";
import { ApiError } from "../web/lib/services/publish";
import type { Store } from "../web/lib/store/types";

loadDotEnv();

export async function runWeekly(store: Store, now = new Date(), opts: { live: boolean; pool: number }) {
  const out: string[] = [];
  for (const c of await store.listChallenges()) {
    if (c.prize.status !== "open" || c.endsAt > now.getTime()) continue;
    try {
      const r = await settleChallenge(store, c._id, opts.live ? devnetSettleSender : simulatedSender, now.getTime());
      out.push(r.already ? `skip ${c._id}` : `settled ${c._id}`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      out.push(e instanceof ApiError || code ? `${c._id}: ${code}` : `${c._id}: ${(e as Error).message}`);
    }
  }
  const next = new Date(now.getTime() + 7 * 86_400_000);
  for (const d of [now, next]) {
    const r = await ensureWeeklyGame(store, d, opts.pool, opts.live ? devnetCreateChallenge : undefined);
    out.push(r.created ? `opened ${r.challenge._id}` : `exists ${r.challenge._id}`);
  }
  return out;
}

if (process.argv[1]?.endsWith("settle-weekly.ts")) {
  (async () => {
    if (!process.env.MONGODB_URI) throw new Error("settle-weekly needs MONGODB_URI.");
    const store = await MongoStore.connect(process.env.MONGODB_URI, process.env.MONGODB_DB ?? "forklab");
    for (const line of await runWeekly(store, new Date(), { live: chainLive(), pool: Number(process.env.WEEKLY_POOL_LAMPORTS ?? 200_000_000) })) console.log(line);
    process.exit(0);
  })().catch((e) => { console.error((e as Error).message); process.exit(1); });
}
