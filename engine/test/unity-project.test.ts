import { test } from "node:test";
import assert from "node:assert/strict";
import { graphHash, platformerGraph, shooterGraph, unityProjectFiles, zipFiles, unzipNames } from "../src/index";

test("unity.project_has_hub_layout", async () => {
  const g = shooterGraph();
  const files = unityProjectFiles(g, graphHash(g));
  const roots = new Set(Object.keys(files).map((p) => p.split("/")[0]));
  assert.equal(roots.size, 1, "one top-level folder to pick in Unity Hub");
  const root = [...roots][0];
  for (const need of ["Assets/ForkLab/ForkLabCore.cs", "Assets/ForkLab/ForkLabGame.cs", "Assets/ForkLab/ForkLabBootstrap.cs", "Assets/ForkLab/Editor/ForkLabSetup.cs", "Packages/manifest.json", "README.txt"]) {
    assert.ok(files[`${root}/${need}`] !== undefined, need);
  }
  const mech = Object.keys(files).find((p) => /Assets\/ForkLab\/Mechanic_.*\.cs$/.test(p))!;
  const cls = /class (Mechanic_\w+)/.exec(files[mech])![1];
  assert.match(files[`${root}/Assets/ForkLab/ForkLabGame.cs`], new RegExp(`new ${cls}\\(\\)`), "the game runs this mechanic");
  assert.ok(JSON.parse(files[`${root}/Packages/manifest.json`]).dependencies["com.unity.modules.physics"]);
  const back = await unzipNames((await zipFiles(files)) as Uint8Array);
  assert.equal(Object.keys(back).length, Object.keys(files).length);
});

test("unity.project_keeps_view_and_theme", () => {
  const g = platformerGraph();
  const files = unityProjectFiles(g, graphHash(g));
  const game = Object.entries(files).find(([p]) => p.endsWith("ForkLabGame.cs"))![1];
  assert.match(game, /public bool sideView = true;/);
  assert.match(game, /public string title = "Ledges";/);
  assert.ok(!/\$\{/.test(Object.values(files).join("\n")), "no unfilled template placeholders");
});
