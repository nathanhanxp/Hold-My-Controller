import { test } from "node:test";
import assert from "node:assert/strict";
import { shooterGraph } from "@forklab/engine";
import { AiRouter } from "../lib/ai/router";
import { ProviderError, type AiProvider } from "../lib/ai/types";
import { askAboutGraph, localAnswer } from "../lib/ai/service";
import { looksLikeQuestion } from "../lib/ai/question";
import { fixtureFor, DEMO_QUESTION } from "../lib/ai/fixtures";
import { promptKey } from "../lib/ai/proposal";
import { MemoryStore } from "../lib/store/memory";
import { graphColors } from "../lib/colors";

const down = (name: "gemini" | "nemotron"): AiProvider => ({ name, available: () => true, generateText: async () => { throw new ProviderError("MODEL_TIMEOUT", "down"); } });

test("ask.questions_are_recognised", () => {
  for (const q of ["how do i win?", "Why do the raiders stop", "can the enemies shoot", "what does space do"]) assert.ok(looksLikeQuestion(q), q);
  for (const c of ["add 5 hearts", "make the floor red", "enemies shoot at me"]) assert.ok(!looksLikeQuestion(c), c);
});

test("ask.answers_from_the_model_and_sends_the_graph_as_data", async () => {
  let seen = "";
  const model: AiProvider = { name: "nemotron", available: () => true, generateText: async (r) => { seen = r.user + r.system; return JSON.stringify({ answer: "WASD moves you and Space fires.", suggestions: [{ label: "Add hearts", prompt: "give me 3 hearts" }] }); } };
  const r = await askAboutGraph(new MemoryStore(), new AiRouter({ providers: [model] }), { question: "how do i play? key sk-live-ABCDEFGHIJKLMNOPQRSTUV", editor: "ana", current: shooterGraph() });
  assert.equal(r.answer, "WASD moves you and Space fires.");
  assert.equal(r.suggestions[0].prompt, "give me 3 hearts");
  assert.match(seen, /untrusted data/);
  assert.match(seen, /Arena shooter/);
});

test("ask.falls_back_to_a_local_answer_with_suggestions", async () => {
  const r = await askAboutGraph(new MemoryStore(), new AiRouter({ providers: [down("gemini"), down("nemotron")] }), { question: "what should i add?", editor: "ana", current: shooterGraph() });
  assert.equal(r.provider, "local");
  assert.ok(r.answer.length > 10);
  assert.ok(r.suggestions.length >= 2 && r.suggestions.every((s) => s.prompt.length > 5));
  assert.ok(localAnswer("x", null).suggestions.length >= 2);
});

test("ask.demo_question_has_a_fixture", async () => {
  const f = fixtureFor("ask", promptKey(`ask:${DEMO_QUESTION}`)) as { suggestions: unknown[] };
  assert.ok(f && f.suggestions.length === 3);
  const r = await askAboutGraph(new MemoryStore(), new AiRouter({ providers: [down("gemini")], fixtures: fixtureFor }), { question: DEMO_QUESTION, editor: "ana", current: null });
  assert.equal(r.provider, "cache");
});

test("colors.one_per_author_per_game", () => {
  const g = { nodes: ["a", "b", "c", "d", "e", "f", "g"].map((authorId) => ({ authorId })) };
  assert.equal(new Set(graphColors(g).values()).size, 7);
});
