"use client";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { MODEL_IDS, Scene } from "@forklab/engine";
import { makeColumn, marble } from "./greek";

/*
 * The model library. Most models are Kenney's CC0 game kits (kenney.nl), served by jsDelivr straight from
 * the KenneyNL GitHub repositories; a few simple shapes (ball, hoop, rock, orb, box, pillar) are built here.
 * Every model is normalised to fit a 1 x 1 x 1 box centred on the origin, so the renderer can size it to an
 * entity's box, or to a prop height.
 */

export type ModelId = (typeof MODEL_IDS)[number];
/** A built-in model or a Poly Haven model found online ("ph:<id>", real-world size in metres). */
export type ModelRef = ModelId | `ph:${string}`;
export const isOnline = (id: string): id is `ph:${string}` => id.startsWith("ph:");

const K = "https://cdn.jsdelivr.net/gh/KenneyNL";
const PLAT = `${K}/Starter-Kit-3D-Platformer@main/models`;
const FPS = `${K}/Starter-Kit-FPS@main/models`;
const CITY = `${K}/Starter-Kit-City-Builder@main/models`;
const ARENA = `${K}/Starter-Kit-Basic-Scene@main/sample/Mini%20Arena/Models/GLB%20format`;
const RACE = `${K}/Starter-Kit-Racing@main/models`;

/** url, and the height in world units (metres) when placed as a prop. */
export const MODELS: Record<ModelId, { url?: string; prop: number; label: string }> = {
  hero: { url: `${PLAT}/character.glb`, prop: 1.2, label: "a small adventurer" },
  soldier: { url: `${ARENA}/character-soldier.glb`, prop: 1.4, label: "a helmeted soldier" },
  drone: { url: `${FPS}/enemy-flying.glb`, prop: 1.2, label: "a flying robot enemy" },
  tree: { url: `${ARENA}/tree.glb`, prop: 4.2, label: "a round tree" },
  trees: { url: `${CITY}/grass-trees-tall.glb`, prop: 4.6, label: "a patch of tall trees" },
  bush: { url: `${CITY}/grass-trees.glb`, prop: 2.6, label: "a patch of small trees" },
  grass: { url: `${PLAT}/grass.glb`, prop: 0.6, label: "a grass tuft" },
  cloud: { url: `${PLAT}/cloud.glb`, prop: 2.2, label: "a cloud" },
  coin: { url: `${PLAT}/coin.glb`, prop: 0.8, label: "a gold coin" },
  flag: { url: `${PLAT}/flag.glb`, prop: 2.2, label: "a goal flag" },
  crate: { url: `${PLAT}/brick.glb`, prop: 1, label: "a brick block" },
  platform: { url: `${PLAT}/platform.glb`, prop: 1, label: "a grassy platform" },
  column: { url: `${ARENA}/column.glb`, prop: 4.5, label: "a stone column" },
  "column-broken": { url: `${ARENA}/column-damaged.glb`, prop: 3, label: "a broken column" },
  statue: { url: `${ARENA}/statue.glb`, prop: 3.2, label: "a statue on a plinth" },
  trophy: { url: `${ARENA}/trophy.glb`, prop: 1.2, label: "a trophy" },
  banner: { url: `${ARENA}/banner.glb`, prop: 3, label: "a hanging banner" },
  wall: { url: `${ARENA}/wall.glb`, prop: 2.5, label: "a stone wall" },
  "wall-low": { url: `${FPS}/wall-low.glb`, prop: 1.2, label: "a low wall" },
  gate: { url: `${ARENA}/wall-gate.glb`, prop: 3, label: "a gate" },
  spear: { url: `${ARENA}/weapon-spear.glb`, prop: 2, label: "a spear" },
  sword: { url: `${ARENA}/weapon-sword.glb`, prop: 1.2, label: "a sword" },
  house: { url: `${CITY}/building-small-a.glb`, prop: 4.5, label: "a small house" },
  shop: { url: `${CITY}/building-small-c.glb`, prop: 5, label: "a shop" },
  fountain: { url: `${CITY}/pavement-fountain.glb`, prop: 1.6, label: "a fountain" },
  truck: { url: `${RACE}/vehicle-truck-red.glb`, prop: 1.6, label: "a red truck" },
  motorbike: { url: `${RACE}/vehicle-motorcycle.glb`, prop: 1.2, label: "a motorbike" },
  tents: { url: `${RACE}/decoration-tents.glb`, prop: 2.4, label: "festival tents" },
  forest: { url: `${RACE}/decoration-forest.glb`, prop: 4, label: "a block of forest" },
  blaster: { url: `${FPS}/blaster.glb`, prop: 0.8, label: "a blaster" },
  ball: { prop: 0.5, label: "a basketball" },
  hoop: { prop: 3.6, label: "a basketball hoop on a pole" },
  rock: { prop: 1.2, label: "a rock" },
  orb: { prop: 0.8, label: "a glowing orb" },
  box: { prop: 1, label: "a plain box" },
  pillar: { prop: 4.5, label: "a fluted marble column" },
  plane: { prop: 2, label: "a propeller plane" },
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();
const inflight = new Set<Promise<unknown>>();
/** Resolves when every model load started so far has finished (or after `ms`). */
export function modelsSettled(ms = 4000): Promise<void> {
  return Promise.race([Promise.allSettled([...inflight]).then(() => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
}

/** Fit inside a unit box centred on the origin, keeping proportions. */
function normalise(obj: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const s = 1 / Math.max(size.x, size.y, size.z, 1e-6);
  const natural = Math.max(size.x, size.y, size.z, 1e-6);
  const wrap = new THREE.Group();
  obj.position.sub(centre);
  wrap.add(obj);
  wrap.scale.setScalar(s);
  const outer = new THREE.Group();
  outer.add(wrap);
  outer.userData.aspect = new THREE.Vector3(size.x * s, size.y * s, size.z * s);
  outer.userData.natural = natural;
  return outer;
}

function built(id: ModelId, color?: string): THREE.Object3D {
  const g = new THREE.Group();
  const c = new THREE.Color(color ?? "#c9c2b4");
  switch (id) {
    case "ball": {
      // a basketball: orange sphere with dark seams painted on a canvas texture
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 128;
      const x = cv.getContext("2d")!;
      x.fillStyle = color ?? "#e2711d"; x.fillRect(0, 0, 256, 128);
      x.strokeStyle = "#2a1408"; x.lineWidth = 5;
      x.beginPath(); x.moveTo(0, 64); x.lineTo(256, 64); x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(192, 0); x.lineTo(192, 128); x.stroke();
      x.beginPath(); x.arc(128, 64, 46, 0, Math.PI * 2); x.stroke();
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));
      break;
    }
    case "hoop": {
      const metal = new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 0.7, roughness: 0.35 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), metal);
      pole.position.set(0, -0.05, -0.22);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.02), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, transparent: true, opacity: 0.9 }));
      board.position.set(0, 0.38, -0.2);
      const square = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.022), new THREE.MeshStandardMaterial({ color: "#e2471d" }));
      square.position.set(0, 0.34, -0.19);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), new THREE.MeshStandardMaterial({ color: "#e2471d", metalness: 0.5, roughness: 0.4 }));
      rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.28, -0.07);
      const net = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.14, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#ffffff", wireframe: true }));
      net.position.set(0, 0.2, -0.07);
      g.add(pole, board, square, rim, net);
      break;
    }
    case "rock":
      g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: color ?? "#8e8a84", roughness: 0.95, flatShading: true })));
      break;
    case "orb":
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshBasicMaterial({ color: color ?? "#bfefff" })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshBasicMaterial({ color: color ?? "#5fc3e4", transparent: true, opacity: 0.25, depthWrite: false })));
      break;
    case "plane": {
      // a small propeller plane, nose toward -z: fuselage, wings, tailplane, fin, cockpit and a propeller disc
      const body = new THREE.MeshStandardMaterial({ color: color ?? "#e9edf2", roughness: 0.45, metalness: 0.2 });
      const trim = new THREE.MeshStandardMaterial({ color: "#5fb8d4", roughness: 0.5, metalness: 0.2 });
      const dark = new THREE.MeshStandardMaterial({ color: "#1d2733", roughness: 0.3, metalness: 0.5 });
      const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.62, 6, 16), body);
      fus.rotation.x = Math.PI / 2;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 0.2), body);
      wing.position.set(0, -0.02, -0.04);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.002, 0.037, 0.05), trim);
      stripe.position.set(0, -0.02, 0.04);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.12), body);
      tail.position.set(0, 0.02, 0.36);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.14), trim);
      fin.position.set(0, 0.12, 0.37);
      const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), dark);
      cockpit.position.set(0, 0.08, -0.12);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), dark);
      hub.rotation.x = -Math.PI / 2; hub.position.set(0, 0, -0.47);
      const prop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.01), dark);
      prop.position.set(0, 0, -0.44);
      prop.userData.spin = true;
      g.add(fus, wing, stripe, tail, fin, cockpit, hub, prop);
      break;
    }
    case "pillar": {
      const col = makeColumn(1, 0.12, 18, marble(color ?? "#ddd2bd"));
      col.position.y = -0.5;
      g.add(col);
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })));
  }
  return normalise(g);
}

/** A Poly Haven model: ask our server where its files are, then load the glTF with its textures from Poly Haven. */
async function loadOnline(id: string) {
  const res = await fetch(`/api/models/ph/${encodeURIComponent(id.slice(3))}`);
  if (!res.ok) throw new Error(`model ${id} not found`);
  const files = (await res.json()) as { url: string; include: Record<string, string> };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    const hit = Object.entries(files.include).find(([rel]) => u.endsWith(rel) || u.endsWith(rel.split("/").pop()!));
    return hit ? hit[1] : u;
  });
  return new GLTFLoader(manager).loadAsync(files.url);
}

function load(id: ModelRef): Promise<THREE.Object3D | null> {
  const m = MODELS[id as ModelId];
  if (!isOnline(id) && !m?.url) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    p = (isOnline(id) ? loadOnline(id) : loader.loadAsync(m.url!)).then((gltf) => {
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const n = normalise(gltf.scene);
      n.userData.animations = gltf.animations;
      return n;
    }).catch((e) => { console.warn(`[forklab] model ${id} failed to load`, e); return null; });
    cache.set(id, p);
    inflight.add(p);
    void p.finally(() => inflight.delete(p!));
  }
  return p;
}

/**
 * An instance of a model, returned at once: a group that fills in when the model has loaded (or with a
 * simple stand-in if it cannot). `color` tints the model.
 */
export function modelInstance(id: ModelRef, color?: string, opts: { height?: number; natural?: number } = {}): THREE.Group {
  const holder = new THREE.Group();
  holder.userData.model = id;
  holder.userData.aspect = new THREE.Vector3(1, 1, 1);
  const m = MODELS[id as ModelId];
  const attach = (obj: THREE.Object3D, animations: THREE.AnimationClip[] = []) => {
    const aspect = (obj.userData.aspect as THREE.Vector3 | undefined) ?? new THREE.Vector3(1, 1, 1);
    holder.userData.aspect = aspect;
    const natural = obj.userData.natural as number | undefined;
    if (opts.natural && natural) {
      // an online model at its real size (metres = world units), times the prop's scale
      const k = natural * opts.natural;
      obj.scale.setScalar(k);
      obj.position.y = (aspect.y * k) / 2;
    } else if (opts.height) {
      // as a prop: scale to the requested height and stand it on the ground
      const k = opts.height / Math.max(aspect.y, 1e-3);
      obj.scale.setScalar(k);
      obj.position.y = (aspect.y * k) / 2;
    }
    if (animations.length) {
      const mixer = new THREE.AnimationMixer(obj);
      const clips: Record<string, THREE.AnimationAction> = {};
      for (const c of animations) clips[c.name] = mixer.clipAction(c);
      holder.userData.mixer = mixer;
      holder.userData.clips = clips;
      (clips.idle ?? Object.values(clips)[0])?.play();
      holder.userData.playing = clips.idle ? "idle" : Object.keys(clips)[0];
    }
    holder.add(obj);
  };
  if (!isOnline(id) && !m?.url) { attach(built(id as ModelId, color)); return holder; }
  load(id).then((tpl) => {
    const obj = tpl ? (SkeletonUtils.clone(tpl) as THREE.Object3D) : built("box", color);
    obj.userData.aspect = tpl?.userData.aspect;
    obj.userData.natural = tpl?.userData.natural;
    if (color && tpl) obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { const mat = (mesh.material as THREE.MeshStandardMaterial).clone(); mat.color = new THREE.Color(color); mesh.material = mat; }
    });
    attach(obj, (tpl?.userData.animations as THREE.AnimationClip[] | undefined) ?? []);
  });
  return holder;
}

/** Switch a character between its idle and walk clips. */
export function animate(holder: THREE.Object3D, dt: number, moving: boolean, airborne: boolean) {
  const mixer = holder.userData.mixer as THREE.AnimationMixer | undefined;
  if (!mixer) return;
  const clips = holder.userData.clips as Record<string, THREE.AnimationAction>;
  const want = airborne && clips.jump ? "jump" : moving && clips.walk ? "walk" : clips.idle ? "idle" : holder.userData.playing;
  if (want !== holder.userData.playing && clips[want]) {
    clips[holder.userData.playing]?.fadeOut(0.15);
    clips[want].reset().fadeIn(0.15).play();
    holder.userData.playing = want;
  }
  mixer.update(dt);
}

/** Start loading models a scene will need, so they appear together. */
export function preload(ids: Iterable<string>) { for (const id of ids) void load(id as ModelRef); }

/** What each built-in thing looks like when the scene says nothing. */
export const DEFAULT_LOOKS: Record<string, ModelId> = {
  player: "hero", enemy: "soldier", raider: "soldier", coin: "coin", pillar: "column", platform: "platform",
  goal: "flag", sacred: "trophy", hurdle: "wall-low", wall: "wall",
};

export type Prop = NonNullable<Scene["props"]>[number];

/** Props a preset scatters around the play area. 3D: a ring outside the arena. 2D: a row behind the play plane. */
export function presetProps(preset: Scene["preset"], view: "2d" | "3d"): Prop[] {
  const kit: Record<string, Array<[ModelId, number]>> = {
    temple: [["column", 5], ["column-broken", 3], ["statue", 2], ["banner", 2]],
    forest: [["tree", 6], ["trees", 5], ["bush", 4], ["grass", 6]],
    meadow: [["tree", 3], ["bush", 3], ["grass", 10], ["cloud", 4]],
    city: [["house", 4], ["shop", 3], ["fountain", 1], ["truck", 2]],
    arena: [["wall", 6], ["banner", 3], ["gate", 1], ["statue", 2]],
    beach: [["tree", 3], ["tents", 2], ["cloud", 3]],
    court: [["hoop", 0], ["banner", 2]],
    night: [["tree", 3], ["column-broken", 2]],
    volcano: [["rock", 8], ["column-broken", 2]],
    space: [], plain: [],
  };
  const items = kit[preset ?? "plain"] ?? [];
  const out: Prop[] = [];
  let k = 0;
  const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  for (const [model, n] of items) {
    for (let i = 0; i < n; i += 1, k += 1) {
      const r = rnd(k), r2 = rnd(k + 99);
      if (model === "cloud") { out.push({ model, x: Math.round(r * 16000), y: 6500 + Math.round(r2 * 1800), z: view === "2d" ? 2000 : -3000 - Math.round(r2 * 3000), scale: 1 + r2 }); continue; }
      if (view === "2d") {
        // a row behind the play plane, spread along x
        out.push({ model, x: Math.round(((k * 0.618) % 1) * 16000), z: 1200 + Math.round(r2 * 3500), scale: 0.8 + r * 0.6, rotate: Math.round(r2 * 360) });
      } else {
        // around the arena's edge, outside the 16 x 16 court
        const side = k % 4;
        const t = Math.round(r * 16000);
        const off = 1400 + Math.round(r2 * 2600);
        const [x, z] = side === 0 ? [t, -off] : side === 1 ? [16000 + off, t] : side === 2 ? [-off, t] : [t, 16000 + off];
        out.push({ model, x, z, scale: 0.8 + r * 0.6, rotate: Math.round(r2 * 360) });
      }
    }
  }
  return out;
}

/** Sky, fog and light per preset (the game's theme colours still win where set). */
export const PRESET_LOOK: Record<string, { sky?: string; fog?: [number, number]; hemi?: [string, string, number]; sea?: boolean; stars?: boolean }> = {
  temple: { sea: true }, forest: { sky: "#1d3b2a", fog: [18, 60], hemi: ["#cfe8c0", "#26331c", 1.1], sea: false },
  meadow: { sky: "#8ccbf0", fog: [30, 90], hemi: ["#ffffff", "#5a7a3a", 1.3], sea: false }, city: { sky: "#9fb7d6", fog: [30, 90], hemi: ["#ffffff", "#6b6b6b", 1.2], sea: false },
  arena: { sea: false, hemi: ["#ffe9c9", "#3a2a20", 1.1] }, beach: { sky: "#9fd8f0", hemi: ["#ffffff", "#e8d2a0", 1.3], sea: true },
  night: { sky: "#05060f", stars: true, sea: true }, space: { sky: "#020208", stars: true, sea: false, fog: [60, 200] },
  court: { sky: "#1a1a24", sea: false, hemi: ["#ffffff", "#444", 1.4] }, volcano: { sky: "#2a0a06", fog: [16, 55], hemi: ["#ff9a6a", "#2a0a06", 1.0], sea: false },
  plain: {},
};


/** A fresh normalised copy of a model (unit box, centred), for exporting. Null if it can't load. */
export async function templateFor(id: ModelRef): Promise<THREE.Object3D | null> {
  const m = MODELS[id as ModelId];
  if (!isOnline(id) && !m?.url) return built(id as ModelId);
  const tpl = await load(id);
  if (!tpl) return null;
  const c = SkeletonUtils.clone(tpl) as THREE.Object3D;
  c.userData.aspect = tpl.userData.aspect;
  c.userData.natural = tpl.userData.natural;
  return c;
}
