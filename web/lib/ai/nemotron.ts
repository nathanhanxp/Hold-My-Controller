import { postJson } from "./http";
import { ProviderError, type AiProvider } from "./types";

export type NemotronConfig = { apiKey?: string; modelId?: string; baseUrl?: string; timeoutMs: number };

/** Refuse a base URL that is not HTTPS (res-q getNemotronConfig). */
export function nemotronBaseUrlOk(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * NVIDIA Nemotron over the OpenAI-compatible chat completions endpoint, as in res-q's callNemotron:
 * POST {NVIDIA_BASE_URL}/chat/completions, non-streaming, low temperature, thinking disabled.
 * Text only; no native schema output, so the JSON Schema goes in the system prompt and the router validates.
 */
export function nemotronProvider(cfg: NemotronConfig): AiProvider {
  const ok = () => !!cfg.apiKey && !!cfg.modelId && nemotronBaseUrlOk(cfg.baseUrl);
  return {
    name: "nemotron",
    available: ok,
    async generateText({ system, user, jsonSchema, image, prefer }) {
      if (!cfg.apiKey || !cfg.modelId) throw new ProviderError("CREDENTIALS_UNAVAILABLE", "NVIDIA settings are missing on the server.");
      if (!nemotronBaseUrlOk(cfg.baseUrl)) throw new ProviderError("CREDENTIALS_UNAVAILABLE", "NVIDIA_BASE_URL must be an https URL.");
      if (image) throw new ProviderError("BAD_OUTPUT", "Nemotron here is text only.");
      const base = cfg.baseUrl!.replace(/\/+$/, "");
      const json = (await postJson(`${base}/chat/completions`, { Authorization: `Bearer ${cfg.apiKey}` }, {
        model: prefer?.models?.nemotron ?? cfg.modelId,
        messages: [
          { role: "system", content: `${system}\n\nReply with one JSON object only, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
          { role: "user", content: user },
        ],
        max_tokens: 4096,
        temperature: 0.2,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }, cfg.timeoutMs, "Nemotron")) as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = json.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("") : "";
      if (!text.trim()) throw new ProviderError("BAD_OUTPUT", "Nemotron returned an empty message.");
      return text;
    },
  };
}
