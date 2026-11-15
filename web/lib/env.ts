import { z } from "zod";

// Parsed once per process (BlinkBounties pattern). Live mode fails with a readable message.
const schema = z.object({
  FORKLAB_MODE: z.enum(["live", "mock"]).default("mock"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().default("forklab"),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  NEXT_PUBLIC_PROGRAM_ID: z.string().optional(),
  PLATFORM_AUTHORITY_KEYPAIR_PATH: z.string().default("./chain/wallets.json"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_MODEL_ID: z.string().optional(),
  NVIDIA_BASE_URL: z.string().optional(),
  AI_GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  AI_NEMOTRON_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  EMBED_MODEL: z.string().optional(),
  EMBED_DIM: z.coerce.number().int().positive().default(768),
  ALLOW_CHAOS: z.string().optional(),
  WEEKLY_POOL_LAMPORTS: z.coerce.number().int().nonnegative().default(200_000_000),
});

export type Env = z.infer<typeof schema>;

const blankToUndefined = (o: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined || v.trim() === "" ? undefined : v.trim()]));

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(blankToUndefined(source));
  if (!r.success) throw new Error(`ForkLab configuration problem: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const env = r.data;
  if (env.FORKLAB_MODE === "live") {
    const missing = ["MONGODB_URI"].filter((k) => !env[k as keyof Env]);
    if (missing.length) throw new Error(`Live mode needs ${missing.join(", ")}. Set them or use FORKLAB_MODE=mock.`);
  }
  return env;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
export function resetEnvForTests() {
  cached = null;
}

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
export const EMBED_DEFAULT_MODEL = "gemini-embedding-001";
