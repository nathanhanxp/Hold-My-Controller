import { BUILTIN_PREFABS, WORLD_H, WORLD_W, compile, Sim, prefabRegistry } from "@forklab/engine";
import { getStore } from "@/lib/runtime";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ hash: string }> };

/** The editor's canvas thumbnail when one was uploaded; otherwise an SVG drawn from a headless run at tick 150. */
export async function GET(_req: Request, { params }: P) {
  const { hash: raw } = await params;
  const hash = raw.replace(/\.(png|svg)$/, "");
  const store = await getStore();
  const d = await store.getGraph(hash);
  if (!d) return new Response("not found", { status: 404 });
  if (d.thumb) {
    const b64 = d.thumb.split(",")[1] ?? "";
    return new Response(Buffer.from(b64, "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  }
  const assets = (await Promise.all(d.assetRefs.map((a) => store.getAsset(a)))).filter(Boolean).map((a) => ({ hash: a!._id, asset: a!.asset }));
  const prefabs = prefabRegistry(assets);
  const sim = new Sim([compile(d.graph)], 7, prefabs);
  for (let t = 0; t < 150 && sim.status === "running"; t += 1) sim.step(t % 50 === 10 ? 1 : 0);
  const theme = d.theme ?? { sky: "#070A10", ground: "#D27A45", accent: "#5FC3E4" };
  const s = 0.03; // 16000 x 9000 -> 480 x 270
  const rects = sim.entities.map((e) => {
    const color = (prefabs[e.prefab] ?? BUILTIN_PREFABS[e.prefab])?.color ?? "#1B2A33";
    const fill = e.tag === "player" ? theme.accent : color;
    return `<rect x="${(e.x * s).toFixed(1)}" y="${((WORLD_H - e.y - e.h) * s).toFixed(1)}" width="${(e.w * s).toFixed(1)}" height="${(e.h * s).toFixed(1)}" fill="${fill}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD_W * s} ${WORLD_H * s}" width="480" height="270"><rect width="100%" height="100%" fill="${theme.sky}"/><rect y="${WORLD_H * s - 6}" width="100%" height="6" fill="${theme.ground}"/>${rects}</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=600" } });
}
