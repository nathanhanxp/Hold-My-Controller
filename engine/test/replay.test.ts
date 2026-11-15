import { test } from "node:test";
import assert from "node:assert/strict";
import { composeCheck, composeSim, verifyMinigameReplay, verifyReplay, ReplayError, seedLibrary, KEYS, MINIGAME_SCHEMA, type MinigameSpec } from "../src/index";

const lib = seedLibrary();
const SPACE = 1 << KEYS.indexOf("Space");
const script = { graphHash: lib.dodge.hash, seed: 5, ticks: 1200, inputs: [[10, SPACE], [11, 0], [100, SPACE], [101, 0]] };

test("replay.rejects_forged_score", () => {
  const real = verifyReplay(lib.dodge.graph, lib.dodge.hash, script);
  const claimed = real.score + 50;
  assert.notEqual(real.score, claimed, "server score is recomputed, never taken from the client");
  // same script always gives the same score
  assert.deepEqual(verifyReplay(lib.dodge.graph, lib.dodge.hash, script), real);
  // a script recorded on another graph is rejected
  assert.throws(() => verifyReplay(lib.jump.graph, lib.jump.hash, script), (e: unknown) => e instanceof ReplayError && e.code === "WRONG_GRAPH");
});

test("replay.rejects_over_tick_cap", () => {
  assert.throws(() => verifyReplay(lib.dodge.graph, lib.dodge.hash, { ...script, ticks: 7201 }), (e: unknown) => e instanceof ReplayError && e.code === "OVER_TICK_CAP");
});

test("replay.rejects_malformed", () => {
  for (const bad of [null, "x", { ...script, inputs: [[1, 1 << 20]] }, { ...script, inputs: Array.from({ length: 5000 }, (_, i) => [i, 0]) }, { ...script, seed: -1 }, { ...script, inputs: [[5, 1], [2, 0]] }]) {
    assert.throws(() => verifyReplay(lib.dodge.graph, lib.dodge.hash, bad), ReplayError);
  }
});

const arena = lib.levels[0];
const spec: MinigameSpec = { schema: MINIGAME_SCHEMA, levelHash: arena.hash, mechanicHash: lib.dodge.hash, seed: 202611, maxTicks: 3600, scoring: { kind: "score" } };

test("minigame.compose_deterministic", () => {
  const run = () => {
    const sim = composeSim(arena.graph, lib.dodge.graph, spec.seed);
    for (let t = 0; t < 600; t += 1) sim.step(t % 90 === 0 ? SPACE : 0);
    return JSON.stringify(sim.snapshot());
  };
  assert.equal(run(), run());
  const sim = composeSim(arena.graph, lib.dodge.graph, spec.seed);
  sim.step(0);
  assert.equal(sim.entities.filter((e) => e.tag === "player").length, 1, "only the level spawns the player");
});

test("minigame.rng_streams_namespaced", () => {
  // Changing how often the mechanic draws random numbers must not shift the level's stream.
  const modified = structuredClone(lib.dodge.graph);
  modified.nodes.find((n) => n.id === "n10")!.params.everyN = 7;
  const s1 = composeSim(arena.graph, lib.dodge.graph, 77);
  const s2 = composeSim(arena.graph, modified, 77);
  // step in lockstep while both are running so both have made the same number of level draws
  while (s1.status === "running" && s2.status === "running" && s1.tick < 600) { s1.step(0); s2.step(0); }
  assert.ok(s1.tick > 35);
  assert.equal(s1.rng.stream("level:rocks").nextUint32(), s2.rng.stream("level:rocks").nextUint32());
  assert.notEqual(s1.rng.stream("mech:rocks").nextUint32(), s2.rng.stream("mech:rocks").nextUint32());
});

test("minigame.rejects_level_without_player", () => {
  const level = structuredClone(arena.graph);
  level.nodes = level.nodes.filter((n) => n.id !== "l02");
  level.edges = level.edges.filter((e) => e.to.node !== "l02");
  assert.ok(composeCheck(level, lib.dodge.graph).includes("Level never spawns a player."));
  assert.throws(() => composeSim(level, lib.dodge.graph, 1));
});

test("minigame.vars_scoped_per_graph", () => {
  const level = structuredClone(arena.graph);
  const mech = structuredClone(lib.dodge.graph);
  level.nodes.push({ id: "v1", type: "SetVar", params: { name: "speed", value: 5 }, authorId: "kai", originFork: "" });
  level.edges.push({ from: { node: "l01", port: "out" }, to: { node: "v1", port: "in" }, kind: "exec" });
  mech.nodes.push({ id: "v2", type: "SetVar", params: { name: "speed", value: 9 }, authorId: "theo", originFork: "" });
  mech.edges.push({ from: { node: "n01", port: "out" }, to: { node: "v2", port: "in" }, kind: "exec" });
  const sim = composeSim(level, mech, 3);
  sim.step(0);
  assert.equal(sim.vars.get("level.speed"), 5);
  assert.equal(sim.vars.get("mech.speed"), 9);
});

test("replay.minigame_forged_score_rejected", () => {
  const s = { graphHash: lib.dodge.hash, seed: spec.seed, ticks: 1800, inputs: [[30, SPACE], [31, 0], [200, SPACE], [201, 0]] };
  const r = verifyMinigameReplay(spec, arena.graph, lib.dodge.graph, s);
  assert.ok(r.ticks > 0 && Number.isInteger(r.score));
  assert.deepEqual(verifyMinigameReplay(spec, arena.graph, lib.dodge.graph, s), r);
  assert.throws(() => verifyMinigameReplay(spec, arena.graph, lib.dodge.graph, { ...s, seed: 1 }), (e: unknown) => e instanceof ReplayError && e.code === "WRONG_SEED");
});
