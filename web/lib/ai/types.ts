import type { z } from "zod";

export type AiTask = "graph" | "theme" | "changelog" | "embed" | "explain" | "ask";
export type FailureCode = "CREDENTIALS_UNAVAILABLE" | "MODEL_TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_ERROR" | "BAD_OUTPUT" | "OUR_FAULT";
export type AttemptOutcome = "ok" | "timeout" | "rate_limited" | "upstream" | "bad_output" | "no_key" | "breaker_open" | "chaos";
export type Attempt = { provider: string; outcome: AttemptOutcome; ms: number };

export class ProviderError extends Error {
  constructor(readonly code: FailureCode, message: string, readonly httpStatus = 0) {
    super(message);
  }
  /** Our own 4xx (malformed request) is a bug; do not fail over on it. */
  get failover(): boolean {
    return this.code !== "OUR_FAULT";
  }
}

export type GenerateRequest<T> = { task: AiTask; system: string; user: string; schema: z.ZodType<T>; jsonSchema: object; image?: { mime: string; data: Uint8Array }; prefer?: { models?: { gemini?: string; nemotron?: string } } };

export interface AiProvider {
  name: "gemini" | "nemotron";
  available(): boolean;
  /** Returns raw text that should be JSON. The router parses, validates and repairs. */
  generateText(req: { task: AiTask; system: string; user: string; jsonSchema: object; image?: { mime: string; data: Uint8Array }; prefer?: { models?: { gemini?: string; nemotron?: string } } }): Promise<string>;
  embed?(texts: string[]): Promise<number[][]>;
}

export type AiResult<T> = { value: T; provider: "gemini" | "nemotron" | "cache" | "local"; attempts: Attempt[] };

export function outcomeOf(e: unknown): AttemptOutcome {
  if (e instanceof ProviderError) {
    switch (e.code) {
      case "CREDENTIALS_UNAVAILABLE": return "no_key";
      case "MODEL_TIMEOUT": return "timeout";
      case "RATE_LIMITED": return "rate_limited";
      case "BAD_OUTPUT": return "bad_output";
      default: return "upstream";
    }
  }
  return "upstream";
}
