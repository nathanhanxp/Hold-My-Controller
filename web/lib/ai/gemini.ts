import { postJson } from "./http";
import { ProviderError, type AiProvider } from "./types";

export type GeminiConfig = { apiKey?: string; model: string; embedModel: string; embedDim: number; timeoutMs: number; chaos?: () => boolean };

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini over REST: structured JSON output with a response schema; embeddings for describe-it search. */
export function geminiProvider(cfg: GeminiConfig): AiProvider {
  const headers = () => ({ "x-goog-api-key": cfg.apiKey ?? "" });
  const guard = () => {
    if (cfg.chaos?.()) throw new ProviderError("UPSTREAM_ERROR", "Simulated Gemini outage (chaos switch).", 503);
    if (!cfg.apiKey) throw new ProviderError("CREDENTIALS_UNAVAILABLE", "GEMINI_API_KEY is not set.");
  };
  const call = async <T>(path: string, body: unknown): Promise<T> => {
    try {
      return (await postJson(`${BASE}/${path}`, headers(), body, cfg.timeoutMs, "Gemini")) as T;
    } catch (e) {
      // Gemini answers 400 for a bad key; treat that as a credential problem, not our bug.
      if (e instanceof ProviderError && e.code === "OUR_FAULT" && /api key/i.test(e.message)) throw new ProviderError("CREDENTIALS_UNAVAILABLE", "Gemini rejected the API key.", 400);
      throw e;
    }
  };
  return {
    name: "gemini",
    available: () => !!cfg.apiKey,
    async generateText({ system, user, jsonSchema, image, prefer }) {
      guard();
      const parts: unknown[] = [{ text: user }];
      if (image) parts.push({ inlineData: { mimeType: image.mime, data: Buffer.from(image.data).toString("base64") } });
      // each Gemini model has its own quota: when one is rate limited (or missing), go straight to the next
      const models = [prefer?.models?.gemini ?? cfg.model, ...(process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-2.5-flash").split(",").map((m) => m.trim()).filter(Boolean)].filter((m, i, a) => a.indexOf(m) === i);
      let last: unknown = null;
      for (const model of models) {
        try {
          const json = await call<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; promptFeedback?: { blockReason?: string } }>(
            `models/${encodeURIComponent(model)}:generateContent`,
            {
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseJsonSchema: jsonSchema, ...(model.startsWith("gemini-2") ? { thinkingConfig: { thinkingBudget: 0 } } : { thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING ?? "minimal" } }) },
            },
          );
          if (json.promptFeedback?.blockReason) throw new ProviderError("BAD_OUTPUT", `Gemini blocked the request (${json.promptFeedback.blockReason}).`);
          const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (!text.trim()) throw new ProviderError("BAD_OUTPUT", "Gemini returned an empty response.");
          if (model !== cfg.model) console.log(`[forklab-ai] gemini answered with ${model}`);
          return text;
        } catch (e) {
          last = e;
          const pe = e as ProviderError;
          const retryable = pe instanceof ProviderError && (pe.code === "RATE_LIMITED" || (pe.code === "OUR_FAULT" && /404|not found|thinking/i.test(pe.message)));
          if (!retryable) throw e;
        }
      }
      throw last;
    },
    async embed(texts) {
      guard();
      const json = await call<{ embeddings?: Array<{ values?: number[] }> }>(`models/${encodeURIComponent(cfg.embedModel)}:batchEmbedContents`, {
        requests: texts.map((t) => ({ model: `models/${cfg.embedModel}`, content: { parts: [{ text: t.slice(0, 2000) }] }, outputDimensionality: cfg.embedDim })),
      });
      const out = json.embeddings?.map((e) => e.values ?? []) ?? [];
      if (out.length !== texts.length || out.some((v) => v.length !== cfg.embedDim)) throw new ProviderError("BAD_OUTPUT", "Gemini returned embeddings of the wrong size.");
      return out.map((v) => {
        const n = Math.hypot(...v);
        return n ? v.map((x) => x / n) : v;
      });
    },
  };
}
