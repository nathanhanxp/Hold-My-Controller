import { MemoryStore } from "../lib/store/memory";
import { seedStore } from "../lib/store/seed";
import { localEmbed, LOCAL_EMBED_MODEL } from "../lib/ai/embed-local";
import { describeGraph } from "../lib/services/describe";

export const embedNow = (t: string) => ({ vector: localEmbed(t, 768), model: LOCAL_EMBED_MODEL });
export async function seeded() {
  const s = new MemoryStore();
  await seedStore(s, "mock", embedNow, describeGraph);
  return s;
}
export const deps = (store: MemoryStore) => ({ store, mode: "mock" as const, embedNow, describe: describeGraph });
