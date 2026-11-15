// Writes golden input scripts and expected snapshots for the three seed mechanics.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runGraph, seedLibrary, KEYS } from "../src/index";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "golden");
mkdirSync(dir, { recursive: true });
const SPACE = 1 << KEYS.indexOf("Space");
const lib = seedLibrary();
const cases = {
  jump: { seed: 1, ticks: 900, inputs: [[40, SPACE], [42, 0], [150, SPACE], [152, 0], [260, SPACE], [262, 0], [370, SPACE], [371, 0]] },
  dodge: { seed: 2, ticks: 900, inputs: [[10, SPACE], [12, 0], [90, SPACE], [91, 0], [200, SPACE], [202, 0], [330, SPACE], [331, 0]] },
  collect: { seed: 3, ticks: 900, inputs: [[5, SPACE], [6, 0], [120, SPACE], [121, 0], [240, SPACE], [241, 0], [400, SPACE], [401, 0]] },
} as const;
for (const [name, c] of Object.entries(cases)) {
  const graph = lib[name as keyof typeof cases].graph;
  writeFileSync(join(dir, `${name}.input.json`), JSON.stringify({ graphHash: lib[name as keyof typeof cases].hash, ...c }, null, 1));
  writeFileSync(join(dir, `${name}.snapshots.json`), JSON.stringify(runGraph(graph, c.seed, c.inputs as unknown as Array<[number, number]>, c.ticks, 60)));
  console.log(`wrote golden/${name}`);
}
