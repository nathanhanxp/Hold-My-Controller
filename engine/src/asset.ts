import { z } from "zod";
import { hashOf } from "./hash";
import { themeSchema } from "./schema";
import type { PrefabDef } from "./world";

export const ASSET_SCHEMA = "forklab.asset.v1" as const;

const hex = /^#[0-9a-fA-F]{6}$/;
export const assetSchema = z.object({
  schema: z.literal(ASSET_SCHEMA),
  kind: z.enum(["prefab", "theme"]),
  title: z.string().min(1).max(80),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,24}$/)).max(8),
  authorId: z.string().regex(/^[a-z0-9_]{1,24}$/),
  parent: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  license: z.object({ type: z.literal("free") }),
  prefab: z.object({
    tag: z.string().regex(/^[a-z0-9_]{1,24}$/),
    w: z.number().int().min(50).max(16000),
    h: z.number().int().min(50).max(9000),
    vx: z.number().int().min(-2000).max(2000),
    vy: z.number().int().min(-2000).max(2000),
    color: z.string().regex(hex),
  }).optional(),
  theme: themeSchema.optional(),
}).refine((a) => (a.kind === "prefab" ? !!a.prefab && !a.theme : !!a.theme && !a.prefab), { message: "A prefab asset needs prefab fields only; a theme asset needs theme fields only." });

export type Asset = z.infer<typeof assetSchema>;

export function assetHash(a: Asset): string {
  return hashOf(a);
}

/** Prefab assets become spawnable as "asset:<hash>". */
export function prefabFromAsset(a: Asset): PrefabDef | null {
  if (a.kind !== "prefab" || !a.prefab) return null;
  return { tag: a.prefab.tag, w: a.prefab.w, h: a.prefab.h, vx: a.prefab.vx, vy: a.prefab.vy, color: a.prefab.color };
}

export function prefabRegistry(assets: Array<{ hash: string; asset: Asset }>): Record<string, PrefabDef> {
  const out: Record<string, PrefabDef> = {};
  for (const { hash, asset } of assets) {
    const p = prefabFromAsset(asset);
    if (p) out[`asset:${hash}`] = p;
  }
  return out;
}
