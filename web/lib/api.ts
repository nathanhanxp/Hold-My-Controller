import { ApiError } from "./services/publish";
import { AiUnavailableError } from "./ai/router";
import { redactText } from "./ai/redact";

export const MAX_BODY_BYTES = 600_000;

export function jsonError(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { code, message: redactText(message), ...extra } }, { status });
}

/** Read a JSON body with a size cap. */
export async function readJson<T = unknown>(req: Request, max = MAX_BODY_BYTES): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max) throw new ApiError("TOO_LARGE", "Request body is too large.", 413);
  const text = await req.text();
  if (text.length > max) throw new ApiError("TOO_LARGE", "Request body is too large.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("BAD_JSON", "Request body is not valid JSON.");
  }
}

/** Wrap a handler: ApiError -> its status; AI exhaustion -> 503 with attempts; anything else -> 500 with a plain message. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return jsonError(e.code, e.message, e.status);
      if (e instanceof AiUnavailableError) return jsonError("AI_UNAVAILABLE", e.message, 503, { attempts: e.attempts });
      console.error("[forklab] route error:", redactText(String((e as Error)?.stack ?? e)));
      return jsonError("SERVER_ERROR", "Something went wrong on the server. Try again.", 500);
    }
  };
}

export const handleOk = (v: unknown, init?: ResponseInit) => Response.json(v, init);
