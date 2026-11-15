import type { z } from "zod";
import { Breaker } from "./breaker";
import { redactText } from "./redact";
import { repairPrompt, validate } from "./repair";
import { outcomeOf, ProviderError, type AiProvider, type AiResult, type AiTask, type Attempt } from "./types";

export class AiUnavailableError extends Error {
  constructor(readonly attempts: Attempt[], message = "Every assistant provider failed. Your graph was not changed.") {
    super(message);
  }
}

export type RouterRequest<T> = {
  task: AiTask;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: object;
  image?: { mime: string; data: Uint8Array };
  /** Key for cached fixtures, normally sha256 of the prompt. */
  cacheKey?: string;
  /** Last-resort non-AI answer. */
  local?: () => T | null;
  /** Per-request choice (from the user's AI plan): provider order and model per provider. */
  prefer?: { order?: Array<"gemini" | "nemotron">; models?: { gemini?: string; nemotron?: string } };
};

export type RouterOptions = {
  providers: AiProvider[];
  fixtures?: (task: AiTask, key: string) => unknown;
  breaker?: Breaker;
  now?: () => number;
  onEvent?: (e: { provider: string; outcome: string; ms: number }) => void;
};

/**
 * Order: Gemini, then Nemotron, then cached fixtures, then a local non-AI fallback.
 * Fail over on missing key, timeout, 429, 5xx/network, empty or blocked output, or invalid JSON after one repair retry.
 * Do not fail over on our own 4xx (a malformed request is a bug).
 * The breaker guards the first provider (Gemini): three failures in 60 s send requests straight to the next one.
 */
export class AiRouter {
  readonly breaker: Breaker;
  lastResult: Record<string, { outcome: string; at: number }> = {};
  constructor(private readonly opts: RouterOptions) {
    this.breaker = opts.breaker ?? new Breaker();
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  async generate<T>(req: RouterRequest<T>): Promise<AiResult<T>> {
    const attempts: Attempt[] = [];
    const record = (provider: string, outcome: Attempt["outcome"], start: number) => {
      const a = { provider, outcome, ms: Math.max(0, Math.round(this.now() - start)) };
      attempts.push(a);
      this.lastResult[provider] = { outcome, at: this.now() };
      this.opts.onEvent?.(a);
    };
    const providers = req.prefer?.order ? [...this.opts.providers].sort((a, b) => req.prefer!.order!.indexOf(a.name as "gemini") - req.prefer!.order!.indexOf(b.name as "gemini")) : this.opts.providers;
    for (const [i, p] of providers.entries()) {
      const guarded = i === 0;
      const start = this.now();
      if (!p.available()) {
        record(p.name, "no_key", start);
        continue;
      }
      if (guarded && !this.breaker.allow()) {
        record(p.name, "breaker_open", start);
        continue;
      }
      try {
        const text = await p.generateText(req);
        let v = validate(req.schema, text);
        if (!v.ok) {
          const again = await p.generateText({ ...req, user: repairPrompt(req.user, v.errors) });
          v = validate(req.schema, again);
          if (!v.ok) throw new ProviderError("BAD_OUTPUT", `Output did not validate after one repair: ${v.errors}`);
        }
        if (guarded) this.breaker.success();
        record(p.name, "ok", start);
        return { value: v.value, provider: p.name, attempts };
      } catch (e) {
        if (e instanceof ProviderError && !e.failover) {
          record(p.name, "upstream", start);
          throw new Error(redactText(e.message));
        }
        if (guarded) this.breaker.failure();
        const outcome = /chaos/i.test((e as Error)?.message ?? "") ? "chaos" : outcomeOf(e);
        record(p.name, outcome, start);
      }
    }
    if (req.cacheKey && this.opts.fixtures) {
      const start = this.now();
      const raw = this.opts.fixtures(req.task, req.cacheKey);
      if (raw !== undefined) {
        const r = req.schema.safeParse(raw);
        if (r.success) {
          record("cache", "ok", start);
          return { value: r.data, provider: "cache", attempts };
        }
      }
    }
    if (req.local) {
      const start = this.now();
      const v = req.local();
      if (v !== null) {
        record("local", "ok", start);
        return { value: v, provider: "local", attempts };
      }
    }
    throw new AiUnavailableError(attempts);
  }

  /** Embeddings come from the first provider that has them; vectors from different models are never mixed. */
  async embed(texts: string[]): Promise<number[][] | null> {
    const p = this.opts.providers.find((x) => !!x.embed);
    if (!p?.embed || !p.available() || !this.breaker.allow()) return null;
    try {
      const v = await p.embed(texts);
      this.breaker.success();
      return v;
    } catch {
      this.breaker.failure();
      return null;
    }
  }
}

export function providerBadge(provider: string, attempts: Attempt[]): string {
  if (provider === "gemini") return "AI: Gemini";
  if (provider === "nemotron") return attempts.some((a) => a.provider === "gemini" && a.outcome !== "ok") ? "AI: Nemotron (Gemini unavailable)" : "AI: Nemotron";
  if (provider === "cache") return "AI: cached";
  return "AI: local";
}
