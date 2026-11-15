"use client";
import type { Graph, Theme } from "@forklab/engine";

/** Render one frame of a game a few seconds in, off screen. Queued so only one GL context exists at a time. */
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

export function graphShot(graph: Graph, opts: { theme?: Theme; w?: number; h?: number; key?: string } = {}): Promise<HTMLCanvasElement | null> {
  const key = opts.key;
  if (key && cache.has(key)) return cache.get(key)!;
  const w = opts.w ?? 1024, h = opts.h ?? 576;
  const job = queue.then(async () => {
    const [{ createGame3D }, engine] = await Promise.all([import("./game3d"), import("@forklab/engine")]);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const theme = opts.theme ?? graph.theme ?? { sky: "#0a0810", ground: "#d8ccb6", accent: "#d9b26f" };
    const drawer = createGame3D(canvas, theme, graph.prefabs ?? {}, engine.viewOf(graph), "shot", graph.scene ?? {});
    drawer.resize(w, h);
    const sim = new engine.Sim([engine.compile(graph)], 7);
    const right = 1 << engine.KEYS.indexOf("KeyD");
    for (let t = 0; t < 170 && sim.status === "running"; t += 1) sim.step((t % 47 === 20 ? 1 : 0) | (t > 30 && t < 70 ? right : 0));
    // models load from the CDN: draw once to start their loads, wait for them, then draw the frame we keep
    drawer.draw(sim, new Map(), 1);
    const { modelsSettled } = await import("./models");
    await modelsSettled(4000);
    drawer.draw(sim, new Map(), 1);
    drawer.draw(sim, new Map(), 1);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d")!.drawImage(canvas, 0, 0);
    drawer.dispose(true);
    return out;
  });
  queue = job.catch(() => null);
  const safe = job.catch(() => null);
  if (key) cache.set(key, safe);
  return safe;
}

export async function gameShot(id: string): Promise<HTMLCanvasElement | null> {
  const res = await fetch(`/api/mechanics/${id}`);
  if (!res.ok) return null;
  const { mechanic } = (await res.json()) as { mechanic: { graph: Graph; theme?: Theme } };
  return graphShot(mechanic.graph, { theme: mechanic.theme, key: `m:${id}` });
}


const THUMB_VERSION = "v3";
/** A game's thumbnail as an image URL, remembered in this browser so it shows instantly next time. */
export async function thumbUrl(id: string): Promise<string | null> {
  const key = `forklab.thumb.${THUMB_VERSION}.${id}`;
  try { const hit = window.localStorage.getItem(key); if (hit) return hit; } catch { /* storage unavailable */ }
  const c = await gameShot(id);
  if (!c) return null;
  // a small JPEG keeps the cache to a few hundred kilobytes for the whole library
  const small = document.createElement("canvas");
  small.width = 480; small.height = 270;
  small.getContext("2d")!.drawImage(c, 0, 0, 480, 270);
  const url = small.toDataURL("image/jpeg", 0.72);
  try { window.localStorage.setItem(key, url); } catch { /* full or unavailable: still return it */ }
  return url;
}
