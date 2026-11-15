import { env, EMBED_DEFAULT_MODEL, GEMINI_DEFAULT_MODEL } from "./env";
import { MemoryStore } from "./store/memory";
import { MongoStore } from "./store/mongo";
import { seedExtras, seedStore } from "./store/seed";
import type { Store } from "./store/types";
import { AiRouter } from "./ai/router";
import { geminiProvider } from "./ai/gemini";
import { nemotronProvider } from "./ai/nemotron";
import { fixtureFor } from "./ai/fixtures";
import { localEmbed, LOCAL_EMBED_MODEL } from "./ai/embed-local";
import { describeGraph } from "./services/describe";
import { RateLimiter } from "./ai/limits";
import { safeLog } from "./ai/redact";

type Runtime = {
  storePromise?: Promise<Store>;
  storeNote?: string;
  router?: AiRouter;
  limiter?: RateLimiter;
  chaosGemini: boolean;
  startedAt: number;
  lastAnchor?: { sig: string; at: number };
  lastWeeklySettle?: { id: string; at: number; sig?: string };
  testCount?: number;
};

const g = globalThis as unknown as { __forklab?: Runtime };
export function runtime(): Runtime {
  if (!g.__forklab) g.__forklab = { chaosGemini: false, startedAt: Date.now() };
  return g.__forklab;
}

/** Embedding used synchronously at publish: the local hashed model. Gemini embeddings are added later by the worker. */
export function embedNow(text: string) {
  return { vector: localEmbed(text, env().EMBED_DIM), model: LOCAL_EMBED_MODEL };
}

async function createStore(): Promise<Store> {
  const e = env();
  const rt = runtime();
  if (e.MONGODB_URI) {
    try {
      const m = await MongoStore.connect(e.MONGODB_URI, e.MONGODB_DB);
      if (await m.isEmpty()) await seedStore(m, e.FORKLAB_MODE, embedNow, describeGraph);
      await seedExtras(m, e.FORKLAB_MODE, embedNow, describeGraph);
      rt.storeNote = "MongoDB Atlas";
      return m;
    } catch (err) {
      if (e.FORKLAB_MODE === "live") {
        safeLog("[forklab] MongoDB unreachable in live mode:", (err as Error).message);
        throw new Error("MongoDB is unreachable and FORKLAB_MODE=live. Refusing to start without the database.");
      }
      safeLog("[forklab] MongoDB unreachable, falling back to memory:", (err as Error).message);
      rt.storeNote = "Memory (MongoDB unreachable)";
    }
  } else {
    rt.storeNote = "Memory";
  }
  const mem = new MemoryStore();
  await seedStore(mem, e.FORKLAB_MODE, embedNow, describeGraph);
  await seedExtras(mem, e.FORKLAB_MODE, embedNow, describeGraph);
  return mem;
}

export function getStore(): Promise<Store> {
  const rt = runtime();
  if (!rt.storePromise) {
    rt.storePromise = createStore();
    rt.storePromise.then((s) => scheduleBackfill(s)).catch(() => undefined);
    rt.storePromise.catch(() => { rt.storePromise = undefined; });
  }
  return rt.storePromise;
}

export function getRouter(): AiRouter {
  const rt = runtime();
  if (!rt.router) {
    const e = env();
    rt.router = new AiRouter({
      // AI_PROVIDER_ORDER picks who answers first (default: gemini, then nemotron)
      providers: (() => {
        const all = {
          gemini: geminiProvider({ apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL, embedModel: e.EMBED_MODEL ?? EMBED_DEFAULT_MODEL, embedDim: e.EMBED_DIM, timeoutMs: e.AI_GEMINI_TIMEOUT_MS, chaos: () => runtime().chaosGemini }),
          nemotron: nemotronProvider({ apiKey: e.NVIDIA_API_KEY, modelId: e.NVIDIA_MODEL_ID, baseUrl: e.NVIDIA_BASE_URL, timeoutMs: e.AI_NEMOTRON_TIMEOUT_MS }),
        };
        const order = (process.env.AI_PROVIDER_ORDER ?? "gemini,nemotron").split(",").map((x) => x.trim()).filter((x): x is keyof typeof all => x in all);
        return [...new Set([...order, "gemini", "nemotron"] as Array<keyof typeof all>)].map((k) => all[k]);
      })(),
      fixtures: fixtureFor,
      onEvent: (a) => safeLog(`[forklab-ai] provider=${a.provider} outcome=${a.outcome} ms=${a.ms}`),
    });
  }
  return rt.router;
}

export function getLimiter(): RateLimiter {
  const rt = runtime();
  if (!rt.limiter) rt.limiter = new RateLimiter();
  return rt.limiter;
}

export const isMock = () => env().FORKLAB_MODE === "mock";

/** Background Gemini embedding of library items (debounced). */
export function scheduleBackfill(store?: Store) {
  const g2 = globalThis as unknown as { __forklabBackfill?: ReturnType<typeof setTimeout> };
  if (g2.__forklabBackfill) clearTimeout(g2.__forklabBackfill);
  g2.__forklabBackfill = setTimeout(async () => {
    try {
      const { backfillEmbeddings } = await import("./services/embed-backfill");
      await backfillEmbeddings(store ?? (await getStore()), getRouter());
    } catch (e) {
      safeLog("[forklab] embedding backfill skipped:", (e as Error).message);
    }
  }, 1500);
}
