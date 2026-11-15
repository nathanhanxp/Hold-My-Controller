// Ported from res-q web/lib/ai/nemotron-client.ts (redactPublicText / redactSecrets), plus Google API keys.
export function redactText(value: string): string {
  return value
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/([?&]key=)[^&\s"]+/gi, "$1[redacted]");
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactSecrets(v);
    return out as T;
  }
  return value;
}

export function safeLog(...parts: unknown[]) {
  console.log(...parts.map((p) => (typeof p === "string" ? redactText(p) : redactSecrets(p))));
}
