import { redactText } from "./redact";
import { ProviderError } from "./types";

const isTimeout = (e: unknown) => {
  const n = (e as { name?: string })?.name;
  return n === "TimeoutError" || n === "AbortError";
};

/** fetch with timeout and the res-q failure-code mapping. 401/403 = no usable key; 429 = rate limited; 5xx = upstream; other 4xx = our bug. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, provider: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (isTimeout(e)) throw new ProviderError("MODEL_TIMEOUT", `${provider} did not respond in time.`, 504);
    throw new ProviderError("UPSTREAM_ERROR", `${provider} could not be reached.`, 502);
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status === 401 || res.status === 403) throw new ProviderError("CREDENTIALS_UNAVAILABLE", `${provider} rejected the server credential.`, res.status);
  if (res.status === 429) {
    // keep the provider's reason (quota name, retry delay) so the log says which limit was hit
    const why = String((json as { error?: { message?: string } })?.error?.message ?? "");
    console.warn(`[forklab-ai] ${provider} 429: ${redactText(why).slice(0, 300)}`);
    throw new ProviderError("RATE_LIMITED", `${provider} is rate limiting requests. ${redactText(why).slice(0, 300)}`, 429);
  }
  if (res.status >= 500) throw new ProviderError("UPSTREAM_ERROR", `${provider} returned ${res.status}.`, res.status);
  // a model this key can't use (404) is the provider's problem, not ours: let the next provider answer
  if (res.status === 404) throw new ProviderError("UPSTREAM_ERROR", `${provider} has no such model for this key (404).`, 404);
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? "";
    throw new ProviderError("OUR_FAULT", `${provider} rejected the request (${res.status}): ${redactText(String(msg)).slice(0, 200)}`, res.status);
  }
  return json;
}
