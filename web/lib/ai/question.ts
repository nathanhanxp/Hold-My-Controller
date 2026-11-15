/** Questions read like questions: a question mark, or an opening word such as how, why or can. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.endsWith("?") || /^(how|what|why|where|when|which|who|can|could|does|do|is|are|should|would|will|explain|tell me)\b/.test(t);
}
