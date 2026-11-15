import type { z } from "zod";

/** Pull the first JSON object out of model text (tolerates code fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("Response was not JSON.");
  }
}

export function validate<T>(schema: z.ZodType<T>, text: string): { ok: true; value: T } | { ok: false; errors: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, errors: (e as Error).message };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ") };
}

export function repairPrompt(original: string, errors: string): string {
  return `${original}\n\nYour previous answer did not validate: ${errors}\nReturn a corrected JSON object only.`;
}
