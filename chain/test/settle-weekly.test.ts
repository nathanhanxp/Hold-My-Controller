import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../../web/lib/store/memory";
import { seedStore } from "../../web/lib/store/seed";
import { localEmbed, LOCAL_EMBED_MODEL } from "../../web/lib/ai/embed-local";
import { describeGraph } from "../../web/lib/services/describe";
import { runWeekly } from "../settle-weekly";
import { gameIdFor } from "../../web/lib/services/weeks";

const embed = (t: string) => ({ vector: localEmbed(t, 768), model: LOCAL_EMBED_MODEL });
async function store() { const s = new MemoryStore(); await seedStore(s, "mock", embed, describeGraph); return s; }

test("settle_weekly.is_idempotent", async () => {
  const s = await store();
  const first = await runWeekly(s, new Date(), { live: false, pool: 1000 });
  const second = await runWeekly(s, new Date(), { live: false, pool: 1000 });
  assert.ok(first.some((l) => l.startsWith("settled game-")), first.join(", "));
  assert.ok(first.some((l) => l.startsWith("opened game-")));
  assert.ok(!second.some((l) => l.startsWith("settled") || l.startsWith("opened")), second.join(", "));
});

test("settle_weekly.skips_when_no_players", async () => {
  const s = await store();
  const last = gameIdFor(new Date(Date.now() - 7 * 86_400_000));
  for (const r of await s.replays(last)) s.replayDocs.delete(r._id);
  const out = await runWeekly(s, new Date(), { live: false, pool: 1000 });
  assert.ok(out.includes(`${last}: NO_WINNERS`), out.join(", "));
  assert.equal((await s.getChallenge(last))!.prize.status, "no_winners");
});

test("settle_weekly.opens_next_game_with_winner", async () => {
  const s = await store();
  await runWeekly(s, new Date(), { live: false, pool: 1000 });
  const next = await s.getChallenge(gameIdFor(new Date(Date.now() + 7 * 86_400_000)));
  const dodge = (await s.listGraphs({})).find((g) => g.title === "Dodge")!;
  assert.equal(next!.minigame!.mechanicHash, dodge._id);
});
