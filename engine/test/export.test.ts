import { test } from "node:test";
import assert from "node:assert/strict";
import { assetHash, exportAssetFiles, exportCSharpFiles, parseExportedAsset, seedLibrary, unzipNames, zipFiles, ASSET_SCHEMA, type Asset } from "../src/index";

const lib = seedLibrary();
const prefab: Asset = { schema: ASSET_SCHEMA, kind: "prefab", title: "Big rock", tags: ["hazard"], authorId: "ana", parent: null, license: { type: "free" }, prefab: { tag: "rock", w: 900, h: 900, vx: 0, vy: -60, color: "#5E6B70" } };

test("export.mechanic_zip_unchanged", async () => {
  const files = exportCSharpFiles(lib.dodge.graph, lib.dodge.hash);
  assert.deepEqual(Object.keys(files).sort(), ["ForkLabCore.cs", "MechanicBehaviour.cs", "Mechanic_Dodge.cs"]);
  assert.match(files["Mechanic_Dodge.cs"], new RegExp(lib.dodge.hash));
  assert.match(files["Mechanic_Dodge.cs"], /@mira/);
  assert.doesNotMatch(files["ForkLabCore.cs"], /using UnityEngine/);
  const zip = (await zipFiles(files)) as Uint8Array;
  const back = await unzipNames(zip);
  assert.deepEqual(back, files);
});

test("export.asset_zip_has_importer", async () => {
  const h = assetHash(prefab);
  const files = exportAssetFiles(prefab, h);
  assert.ok(files["Editor/ForkLabAssetImporter.cs"].includes("PrefabUtility.SaveAsPrefabAsset"));
  assert.ok(files["ForkLabAssets.cs"].includes("ForkLabPrefabAsset"));
  const back = await unzipNames((await zipFiles(files)) as Uint8Array);
  assert.ok(back["BigRock.asset.json"]);
});

test("export.asset_json_roundtrips_schema", () => {
  const h = assetHash(prefab);
  const files = exportAssetFiles(prefab, h);
  const parsed = parseExportedAsset(files["BigRock.asset.json"]);
  assert.equal(parsed.hash, h);
  assert.equal(assetHash(parsed.asset), h);
});
