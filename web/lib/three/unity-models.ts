"use client";
import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { BUILTIN_PREFABS, viewOf, type Graph, type UnityScenePlan } from "@forklab/engine";
import { DEFAULT_LOOKS, isOnline, MODELS, PRESET_LOOK, presetProps, templateFor, type ModelId, type ModelRef } from "./models";

/*
 * Unity export of what the browser shows. Unity imports OBJ models natively, so every model the game uses
 * (Kenney kits, built shapes, Poly Haven finds) is converted here to OBJ + MTL + PNG textures, and the scene
 * (preset sky, fog and light, looks, props, HUD) is resolved into a plan the generated C# rebuilds.
 */

const fileOf = (id: string) => id.replace(/^ph:/, "ph_").replace(/[^A-Za-z0-9_-]/g, "_");

async function imagePng(img: CanvasImageSource & { width: number; height: number }): Promise<Uint8Array | null> {
  try {
    const c = document.createElement("canvas");
    c.width = Math.min(512, img.width); c.height = Math.min(512, img.height);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** One model as OBJ text, its MTL and its textures. Texture v is flipped: glTF counts from the top, OBJ from the bottom. */
async function convert(id: ModelRef): Promise<{ files: Record<string, string | Uint8Array>; aspect: THREE.Vector3; natural: number } | null> {
  const obj = await templateFor(id);
  if (!obj) return null;
  const name = fileOf(id);
  const files: Record<string, string | Uint8Array> = {};
  const mtl: string[] = [];
  let n = 0;
  const pngs = new Map<unknown, string>(); // one PNG per distinct image, shared by every material that uses it
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[0] as THREE.MeshStandardMaterial;
    const mname = `${name}_m${n++}`;
    const copy = mat.clone();
    copy.name = mname;
    mesh.material = copy;
    const c = mat.color ?? new THREE.Color(1, 1, 1);
    mtl.push(`newmtl ${mname}`, `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`, "Ka 0 0 0", "Ks 0.1 0.1 0.1", "d 1");
    const img = mat.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (img && img.width) {
      let file = pngs.get(img);
      if (!file) {
        const png = await imagePng(img);
        if (png) { file = `${name}_t${pngs.size}.png`; files[file] = png; pngs.set(img, file); }
      }
      if (file) mtl.push(`map_Kd ${file}`);
    }
    mtl.push("");
  }
  obj.updateMatrixWorld(true);
  let text = new OBJExporter().parse(obj);
  text = text.replace(/^vt ([-\d.e]+) ([-\d.e]+)$/gm, (_m, u: string, v: string) => `vt ${u} ${(1 - Number(v)).toFixed(6)}`);
  files[`${name}.obj`] = `mtllib ${name}.mtl\n${text}`;
  files[`${name}.mtl`] = mtl.join("\n");
  return { files, aspect: (obj.userData.aspect as THREE.Vector3) ?? new THREE.Vector3(1, 1, 1), natural: (obj.userData.natural as number) ?? 1 };
}

const converted = new Map<string, Promise<Awaited<ReturnType<typeof convert>>>>();

/** The scene plan plus every model file, keyed by file name inside Resources/ForkLabModels. */
export async function unityExport(graph: Graph, onProgress?: (done: number, total: number) => void): Promise<{ plan: UnityScenePlan; files: Record<string, string | Uint8Array> }> {
  const scene = graph.scene ?? {};
  const view = viewOf(graph);
  const preset = PRESET_LOOK[scene.preset ?? "temple"] ?? {};
  // the prefabs this game actually creates, resolved to a model the same way the browser does
  const used = new Set<string>();
  for (const nd of graph.nodes) if ((nd.type === "Spawn" || nd.type === "Shoot") && nd.params.prefab) used.add(String(nd.params.prefab));
  const defs = { ...BUILTIN_PREFABS, ...(graph.prefabs ?? {}) };
  const looks: UnityScenePlan["looks"] = {};
  const need = new Set<ModelRef>();
  for (const prefab of used) {
    const def = defs[prefab];
    if (!def) continue;
    const look = scene.looks?.[prefab] ?? scene.looks?.[def.tag];
    const model = (look?.model ?? DEFAULT_LOOKS[prefab] ?? DEFAULT_LOOKS[def.tag]) as ModelRef | undefined;
    if (!model) continue;
    need.add(model);
    looks[prefab] = { file: fileOf(model), color: look?.color, scale: look?.scale ?? (["hero", "soldier", "drone"].includes(model) ? 1.5 : 1), box: !!def.solid };
  }
  const props = [...presetProps(scene.preset, view), ...(scene.props ?? [])];
  for (const p of props) need.add(p.model as ModelRef);
  // convert each model once per page visit (cached), four at a time
  const files: Record<string, string | Uint8Array> = {};
  const info = new Map<string, { aspect: THREE.Vector3; natural: number }>();
  let done = 0;
  const ids = [...need];
  onProgress?.(0, ids.length);
  const worker = async () => {
    for (let id = ids.shift(); id; id = ids.shift()) {
      let job = converted.get(id);
      if (!job) { job = convert(id).catch(() => null); converted.set(id, job); }
      const r = await job;
      done += 1;
      onProgress?.(done, need.size);
      if (!r) continue;
      Object.assign(files, r.files);
      info.set(id, { aspect: r.aspect, natural: r.natural });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const planProps: UnityScenePlan["props"] = [];
  for (const p of props) {
    const i = info.get(p.model);
    if (!i) continue;
    const height = isOnline(p.model) ? i.aspect.y * i.natural * (p.scale ?? 1) : MODELS[p.model as ModelId].prop * (p.scale ?? 1);
    planProps.push({ file: fileOf(p.model), x: p.x, y: p.y ?? 0, z: p.z ?? (view === "2d" ? 4000 : -2000), height, rotate: p.rotate ?? 0 });
  }
  for (const [k, l] of Object.entries(looks)) if (![...info.keys()].some((id) => fileOf(id) === l.file)) delete looks[k];
  const sky = scene.preset && preset.sky ? preset.sky : graph.theme?.sky;
  return {
    plan: { sky, fog: preset.fog, hemi: preset.hemi, sea: preset.sea !== false, looks, props: planProps, hud: scene.hud },
    files,
  };
}
