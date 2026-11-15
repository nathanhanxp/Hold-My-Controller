// Runs every test suite and records the totals for the status page (.test-count.json, gitignored).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const suites = [
  ["engine", "npx", ["tsx", "--test", "test/*.test.ts"], "engine"],
  ["web", "npx", ["tsx", "--test", "test/*.test.ts"], "web"],
  ["chain", "npx", ["tsx", "--test", "test/*.test.ts", "../programs/forklab/tests/*.test.ts"], "chain"],
] as const;
let total = 0, failed = 0, skipped = 0;
for (const [name, cmd, args, cwd] of suites) {
  const r = spawnSync(cmd, args as unknown as string[], { cwd, encoding: "utf8", shell: true });
  const out = `${r.stdout}\n${r.stderr}`;
  const n = (k: string) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(out)?.[1] ?? 0);
  console.log(`${name}: ${n("pass")} passed, ${n("fail")} failed, ${n("skipped")} skipped`);
  total += n("pass"); failed += n("fail"); skipped += n("skipped");
  if (n("fail")) console.log(out.split("\n").filter((l) => l.startsWith("✖")).join("\n"));
}
const cargo = spawnSync("cargo", ["test", "-p", "forklab", "--quiet"], { encoding: "utf8" });
const rust = Number(/test result: ok\. (\d+) passed/.exec(`${cargo.stdout}`)?.[1] ?? 0);
if (cargo.status === 0) { console.log(`program (cargo): ${rust} passed`); total += rust; }
else console.log("program (cargo): not run (cargo unavailable or failed)");
// C# parity: the exported Unity simulation must match the browser engine tick for tick (needs the .NET SDK)
const home = process.env.HOME ?? "";
const dotnetPath = [`${home}/.dotnet`, process.env.PATH ?? ""].join(":");
const hasDotnet = spawnSync("dotnet", ["--version"], { encoding: "utf8", env: { ...process.env, PATH: dotnetPath } }).status === 0;
if (hasDotnet) {
  const p = spawnSync("npm", ["run", "parity", "-w", "engine"], { encoding: "utf8", env: { ...process.env, PATH: dotnetPath, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } });
  const ok = (`${p.stdout}`.match(/parity\.golden_\w+: ok/g) ?? []).length;
  const bad = (`${p.stdout}`.match(/parity\.golden_\w+: FAIL/g) ?? []).length + (p.status === 0 ? 0 : 1);
  console.log(`unity C# parity: ${ok} passed, ${p.status === 0 ? 0 : Math.max(1, bad)} failed`);
  total += ok; if (p.status !== 0) failed += Math.max(1, bad - 1);
} else console.log("unity C# parity: not run (dotnet unavailable)");
writeFileSync(".test-count.json", JSON.stringify({ total, failed, skipped, at: new Date().toISOString() }));
console.log(`\nTotal: ${total} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
