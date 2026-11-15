// Writes the graph and asset JSON Schemas to engine/dist so the API and docs share one contract (res-q pattern).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { graphSchema, GRAPH_SCHEMA } from "../src/schema";
import { assetSchema, ASSET_SCHEMA } from "../src/asset";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, `${GRAPH_SCHEMA}.schema.json`), JSON.stringify(z.toJSONSchema(graphSchema), null, 2));
writeFileSync(join(dist, `${ASSET_SCHEMA}.schema.json`), JSON.stringify(z.toJSONSchema(assetSchema, { unrepresentable: "any" }), null, 2));
console.log(`wrote dist/${GRAPH_SCHEMA}.schema.json and dist/${ASSET_SCHEMA}.schema.json`);
