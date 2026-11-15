import * as THREE from "three";
import { BUILTIN_PREFABS, DEFAULT_Z, WORLD_D, WORLD_H, WORLD_W, type PrefabDef, type Scene, type Sim, type Theme } from "@forklab/engine";
import { makeColumn, makeSea, makeStars, marble } from "./greek";
import { animate, DEFAULT_LOOKS, isOnline, MODELS, modelInstance, PRESET_LOOK, preload, presetProps, type ModelId, type ModelRef } from "./models";

/*
 * 3D renderer for the deterministic engine. The simulation is a real 3D arena (x across, y up, z depth);
 * this draws it as a marble court over the sea with a third-person camera that follows the player.
 * Rendering never feeds back into the simulation, so replays and C# parity are unaffected.
 */

export type Ghost = { x: number; y: number; z: number; w: number; h: number; d: number } | null;
export type Drawer = { draw(sim: Sim, prev: Map<number, { x: number; y: number; z?: number }>, alpha: number, ghost?: Ghost): void; resize(w: number, h: number): void; dispose(loseContext?: boolean): void };

const U = 1000; // milli-units per world unit

function unitBuilder(tag: string, prefab: string, color: string, accent: string): THREE.Object3D {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  if (prefab === "pillar") {
    const col = makeColumn(1, 0.42, 18, marble("#ddd2bd"));
    col.position.y = -0.5;
    g.add(col);
    g.userData.column = true;
    return g;
  }
  switch (tag) {
    case "player": {
      const bronze = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.35, roughness: 0.4, emissive: accent, emissiveIntensity: 0.28 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 6, 14), bronze);
      body.position.y = -0.05;
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), bronze);
      helm.position.y = 0.36;
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: "#b8452a", roughness: 0.8 }));
      crest.position.y = 0.52;
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 28), new THREE.MeshStandardMaterial({ color: "#d9a85a", metalness: 0.4, roughness: 0.35, emissive: "#5a3a10", emissiveIntensity: 0.4 }));
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-0.32, 0, 0.05);
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), new THREE.MeshStandardMaterial({ color: "#6b4a2a" }));
      spear.position.set(0.3, 0.1, 0);
      spear.rotation.x = 0.3;
      g.add(body, helm, crest, shield, spear);
      g.userData.kind = "player";
      break;
    }
    case "rock": {
      g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true })));
      g.userData.spin = new THREE.Vector3(1.3, 0.7, 0.9);
      break;
    }
    case "coin": {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 32), new THREE.MeshStandardMaterial({ color: "#f2c86a", metalness: 0.45, roughness: 0.25, emissive: "#a06a10", emissiveIntensity: 0.75 }));
      m.rotation.x = Math.PI / 2;
      g.add(m);
      g.userData.spin = new THREE.Vector3(0, 2.4, 0);
      g.userData.bob = true;
      break;
    }
    case "enemy": {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, flatShading: true, emissive: c, emissiveIntensity: 0.3 }));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffe7b0" }));
      eye.position.set(0, 0.1, 0.38);
      g.add(m, eye);
      g.userData.roll = true;
      break;
    }
    case "hurdle": {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), marble("#d6c9b0"));
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.01, 0.25, 1.01), new THREE.MeshStandardMaterial({ color: "#b8562e", roughness: 0.7 }));
      band.position.y = 0.2;
      g.add(wall, band);
      g.userData.solid = true;
      break;
    }
    case "sacred": {
      const altar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.6), marble("#efe6d4"));
      altar.position.y = -0.15;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 12), new THREE.MeshBasicMaterial({ color: "#ffb35a" }));
      flame.position.y = 0.4;
      g.add(altar, flame);
      g.userData.flame = flame;
      break;
    }
    case "goal": {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 10, 40), new THREE.MeshStandardMaterial({ color: "#9cc27a", emissive: "#3c5a20", emissiveIntensity: 0.8, roughness: 0.5 })));
      g.userData.spin = new THREE.Vector3(0, 1.2, 0);
      break;
    }
    case "platform":
    case "wall": {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), marble("#d8ccb6")));
      g.userData.solid = true;
      break;
    }
    case "pipe": {
      const col = makeColumn(1, 0.4, 16, marble("#cfc3ad"));
      col.position.y = -0.5;
      g.add(col);
      g.userData.column = true;
      break;
    }
    case "bolt": {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: "#bfefff" })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: "#5fc3e4", transparent: true, opacity: 0.25, depthWrite: false })));
      g.userData.glow = true;
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })));
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Stone tiles in the theme's ground colour, each a little lighter or darker, with grout lines: reads as a floor, not a flat slab. */
function tileTexture(ground: string, ww: number, wd: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const base = new THREE.Color(ground);
  const n = 8;
  const size = 512 / n;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = `#${base.clone().multiplyScalar(0.55).getHexString()}`;
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const k = 0.78 + rnd() * 0.3;
      g.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
      g.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      for (let i = 0; i < 18; i += 1) {
        g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rnd() * 0.05})`;
        g.fillRect(x * size + 2 + rnd() * (size - 8), y * size + 2 + rnd() * (size - 8), 2 + rnd() * 10, 1 + rnd() * 3);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, ww / 8), Math.max(1, wd / 8));
  t.anisotropy = 4;
  return t;
}

export function createGame3D(canvas: HTMLCanvasElement, theme: Theme, prefabs: Record<string, PrefabDef>, view: "2d" | "3d" = "3d", framing: "play" | "shot" = "play", sceneSpec: Scene = {}): Drawer {
  const side = view === "2d";
  const look = PRESET_LOOK[sceneSpec.preset ?? "temple"] ?? {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // if the GPU resets, keep the page alive; the player shows a notice and Restart builds a new renderer
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); canvas.dispatchEvent(new CustomEvent("forklab:lost", { bubbles: true })); }, { once: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const sky = new THREE.Color(sceneSpec.preset && look.sky && !sceneSpec.looks?.sky ? look.sky : theme.sky);
  scene.background = sky;
  scene.fog = side ? new THREE.Fog(sky, 40, 90) : new THREE.Fog(sky, look.fog?.[0] ?? 26, look.fog?.[1] ?? 70);
  const ww = WORLD_W / U, wh = WORLD_H / U, wd = WORLD_D / U;
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 300);
  // 2D: a flat (orthographic) camera that frames the whole 16:9 world from the side
  const ortho = new THREE.OrthographicCamera(-ww / 2, ww / 2, wh / 2, -wh / 2, 0.1, 300);
  const fitOrtho = (aspect: number) => {
    const h = Math.max(wh * 1.06, (ww * 1.04) / Math.max(0.3, aspect));
    ortho.left = (-h * aspect) / 2; ortho.right = (h * aspect) / 2; ortho.top = h / 2; ortho.bottom = -h / 2;
    ortho.updateProjectionMatrix();
  };
  fitOrtho(16 / 9);
  // 2D: a long lens straight at the play plane, framing the whole 16:9 world
  const sideZ = DEFAULT_Z / U + 0.5;
  // distance that fits the whole world: by height, or by width when the view is taller than 16:9
  const sideDistFor = (aspect: number) => Math.max(wh * 1.06, (ww * 1.04) / Math.max(0.3, aspect)) / (2 * Math.tan(THREE.MathUtils.degToRad(14)));
  let sideDist = sideDistFor(16 / 9);
  const focus = new THREE.Vector3(ww / 2, 1, wd * 0.55);
  const offset = framing === "shot" ? new THREE.Vector3(2.2, 5.2, 9.5) : new THREE.Vector3(0, 12, 15.5);
  camera.position.copy(focus).add(offset);
  camera.lookAt(focus);

  scene.add(new THREE.HemisphereLight(look.hemi?.[0] ?? "#9aa6c8", look.hemi?.[1] ?? "#1a0f10", look.hemi?.[2] ?? 0.95));
  const moon = new THREE.DirectionalLight("#e6ecff", 1.7);
  moon.position.set(ww / 2 - 9, 20, wd + 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  moon.target.position.set(ww / 2, 0, wd / 2);
  scene.add(moon, moon.target);
  const torch = new THREE.PointLight("#ff9c4a", 9, 9, 2);
  scene.add(torch);

  // the court: a marble floor with a terracotta border, columns round the edge, the sea beyond
  const floorMat = marble("#ffffff");
  floorMat.map = tileTexture(theme.ground, ww, wd);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ww + 1.2, 0.5, wd + 1.2), floorMat);
  // a wider, darker terrace under the court, so it sits on something instead of floating in the dark
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(ww + 7, 0.7, wd + 7), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ground).multiplyScalar(0.42), roughness: 0.9 }));
  terrace.position.set(ww / 2, -0.62, wd / 2);
  terrace.receiveShadow = true;
  scene.add(terrace);
  floor.position.set(ww / 2, -0.25, wd / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(ww, 8, "#8a6a40", "#8a6a40");
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.12;
  grid.position.set(ww / 2, 0.01, wd / 2);
  scene.add(grid);
  const border = new THREE.MeshStandardMaterial({ color: "#a94f2a", roughness: 0.7 });
  for (const [x, z, w, d] of [[ww / 2, -0.55, ww + 1.2, 0.1], [ww / 2, wd + 0.55, ww + 1.2, 0.1], [-0.55, wd / 2, 0.1, wd + 1.2], [ww + 0.55, wd / 2, 0.1, wd + 1.2]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), border);
    b.position.set(x, 0.02, z);
    scene.add(b);
  }
  const sea = makeSea(160, 100);
  sea.mesh.position.set(ww / 2, -1.4, wd / 2);
  sea.uniforms.uFogColor.value = sky.clone();
  sea.uniforms.uFogNear.value = 20;
  sea.uniforms.uFogFar.value = 70;
  if (look.sea !== false) scene.add(sea.mesh);
  if (look.stars) { const st = makeStars(900, 120); st.points.position.set(ww / 2, 0, wd / 2); scene.add(st.points); }
  // scene props: the preset's scatter plus anything the game places
  const props = [...presetProps(sceneSpec.preset, view), ...(sceneSpec.props ?? [])];
  const lookOf = (prefab: string, tag: string) => sceneSpec.looks?.[prefab] ?? sceneSpec.looks?.[tag];
  preload(new Set<string>([...props.map((p) => p.model), ...(Object.values(sceneSpec.looks ?? {}).map((l) => l.model).filter(Boolean) as string[]), ...Object.values(DEFAULT_LOOKS)]));
  for (const p of props) {
    const inst = isOnline(p.model)
      ? modelInstance(p.model, p.color, { natural: p.scale ?? 1 })
      : modelInstance(p.model as ModelRef, p.color, { height: MODELS[p.model as ModelId].prop * (p.scale ?? 1) });
    inst.position.set(p.x / U, (p.y ?? 0) / U, (p.z ?? (side ? 4000 : -2000)) / U);
    inst.rotation.y = THREE.MathUtils.degToRad(p.rotate ?? 0);
    scene.add(inst);
  }
  // no decorative columns: everything standing in the arena comes from the game itself, so edits can remove it
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: "#f3e6c8", fog: false }));
  moonDisc.position.set(ww * 0.85, wh * 2.2, -30);
  scene.add(moonDisc);

  const objs = new Map<number, { obj: THREE.Object3D; tag: string }>();
  const bursts: Array<{ mesh: THREE.Mesh; t: number }> = [];
  const burstGeo = new THREE.TorusGeometry(0.3, 0.04, 6, 32);
  const clock = new THREE.Clock();
  let shake = 0;
  const camFocus = focus.clone();
  // the ghost: another player's recorded run, drawn as a translucent figure
  const ghostObj = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({ color: "#9fe6e0", transparent: true, opacity: 0.38, depthWrite: false });
  const gBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 6, 14), ghostMat);
  const gGlow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: "#9fe6e0", transparent: true, opacity: 0.12, depthWrite: false }));
  ghostObj.add(gBody, gGlow);
  ghostObj.visible = false;
  scene.add(ghostObj);

  return {
    draw(sim, prev, alpha, ghost) {
      if (ghost) {
        ghostObj.visible = true;
        ghostObj.position.set((ghost.x + ghost.w / 2) / U, (ghost.y + ghost.h / 2) / U, side ? sideZ - 0.4 : (ghost.z + ghost.d / 2) / U);
        ghostObj.scale.setScalar(Math.max(0.6, ghost.h / 600));
      } else ghostObj.visible = false;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      const seen = new Set<number>();
      let player: THREE.Vector3 | null = null;
      for (const e of sim.entities) {
        seen.add(e.id);
        let rec = objs.get(e.id);
        if (!rec) {
          const def = prefabs[e.prefab] ?? BUILTIN_PREFABS[e.prefab];
          const l = lookOf(e.prefab, e.tag);
          const model = (l?.model ?? DEFAULT_LOOKS[e.prefab] ?? DEFAULT_LOOKS[e.tag]) as ModelRef | undefined;
          let obj: THREE.Object3D;
          if (model) {
            obj = modelInstance(model, l?.color ?? (l ? undefined : e.tag === "player" ? undefined : undefined));
            obj.userData.fit = def?.solid ? "box" : "uniform";
            obj.userData.lookScale = l?.scale ?? (["hero", "soldier", "drone"].includes(model) ? 1.5 : 1);
            if (e.tag === "player") obj.userData.kind = "player";
            if (model === "coin") { obj.userData.spin = new THREE.Vector3(0, 2.4, 0); obj.userData.bob = true; }
          } else obj = unitBuilder(e.tag, e.prefab, l?.color ?? def?.color ?? "#9aa4b2", theme.accent);
          scene.add(obj);
          rec = { obj, tag: e.tag };
          objs.set(e.id, rec);
        }
        const p = prev.get(e.id) ?? { x: e.x, y: e.y, z: e.z };
        const pz = p.z ?? e.z;
        const x = (p.x + (e.x - p.x) * alpha + e.w / 2) / U;
        const y = (p.y + (e.y - p.y) * alpha + e.h / 2) / U;
        // 2D flattens depth: everything sits on one plane, so a 3D game reads cleanly from the side
        const z = side ? sideZ : (pz + (e.z - pz) * alpha + e.d / 2) / U;
        const o0 = rec.obj;
        if (o0.userData.model) {
          // models: boxes stretch to the entity's box, characters and items keep proportions
          const a = o0.userData.aspect as THREE.Vector3;
          const sw0 = e.w / U, sh0 = e.h / U, sd0 = e.d / U;
          const k = o0.userData.lookScale ?? 1;
          if (o0.userData.fit === "box") o0.scale.set(sw0 / Math.max(a.x, 0.05), sh0 / Math.max(a.y, 0.05), sd0 / Math.max(a.z, 0.05));
          else o0.scale.setScalar(Math.min(sh0 / Math.max(a.y, 0.05), (1.6 * Math.max(sw0, sd0)) / Math.max(a.x, a.z, 0.05)) * k);
          o0.position.set(x, (p.y + (e.y - p.y) * alpha) / U + (a.y * o0.scale.y) / 2, z);
          animate(o0, dt, e.vx !== 0 || e.vz !== 0, !e.grounded && e.tag === "player" && e.body);
          if (o0.userData.spin) o0.rotation.y += o0.userData.spin.y * dt;
          if (o0.userData.model === "plane") {
            // a plane keeps its nose ahead, banks into turns and spins its propeller
            const bank = e.vx > 0 ? -0.45 : e.vx < 0 ? 0.45 : 0;
            o0.rotation.y = 0;
            o0.rotation.z += (bank - o0.rotation.z) * Math.min(1, dt * 6);
            o0.rotation.x += ((e.vz < 0 ? -0.08 : e.vz > 0 ? 0.1 : 0) - o0.rotation.x) * Math.min(1, dt * 6);
            o0.traverse((c) => { if (c.userData.spin === true) c.rotation.z += dt * 40; });
          }
          if (o0.userData.kind === "player" && o0.userData.model !== "plane") {
            if (e.vx !== 0 || e.vz !== 0) {
              const want = Math.atan2(e.vx, e.vz);
              let diff = want - o0.rotation.y;
              diff = Math.atan2(Math.sin(diff), Math.cos(diff));
              o0.rotation.y += diff * Math.min(1, dt * 12);
            }
          }
          if (o0.userData.kind === "player") {
            torch.position.set(x, y + 1.4, z + 0.8);
            player = new THREE.Vector3(x, y, z);
          }
          continue;
        }
        const sw = e.w / U, sh = e.h / U, sd = e.d / U;
        const o = rec.obj;
        if (o.userData.solid) o.scale.set(sw, sh, sd);
        else if (o.userData.column) o.scale.set(sw, sh, sd);
        else { const s = Math.min(sw, sh, sd); o.scale.set(sw, sh, Math.max(s, Math.min(sw, sd))); }
        o.position.set(x, y, z);
        if (o.userData.spin) { o.rotation.x += o.userData.spin.x * dt; o.rotation.y += o.userData.spin.y * dt; o.rotation.z += o.userData.spin.z * dt; }
        if (o.userData.bob) o.position.y += Math.sin(t * 3 + e.id) * 0.05;
        if (o.userData.roll) { o.rotation.z -= (e.vx / U) * 60 * dt / Math.max(0.2, sh / 2); o.rotation.x += (e.vz / U) * 60 * dt / Math.max(0.2, sh / 2); }
        if (o.userData.flame) { const f = o.userData.flame as THREE.Mesh; f.scale.set(1, 1 + Math.sin(t * 14 + e.id) * 0.18, 1); }
        if (o.userData.kind === "player") {
          // face the way you move
          if (e.vx !== 0 || e.vz !== 0) {
            const want = Math.atan2(e.vx, e.vz);
            let diff = want - o.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            o.rotation.y += diff * Math.min(1, dt * 12);
          }
          torch.position.set(x, y + 1.4, z + 0.8);
          player = new THREE.Vector3(x, y, z);
        }
      }
      for (const [id, rec] of objs) {
        if (seen.has(id)) continue;
        if (rec.tag === "coin" || rec.tag === "player" || rec.tag === "enemy") {
          const ring = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color: rec.tag === "coin" ? "#f6d98a" : rec.tag === "player" ? "#ff7a4a" : "#ffd0a0", transparent: true, opacity: 0.9 }));
          ring.position.copy(rec.obj.position);
          ring.rotation.x = Math.PI / 2;
          scene.add(ring);
          bursts.push({ mesh: ring, t: 0 });
          if (rec.tag === "player") shake = 0.35;
        }
        scene.remove(rec.obj);
        objs.delete(id);
      }
      for (let i = bursts.length - 1; i >= 0; i -= 1) {
        const b = bursts[i];
        b.t += dt;
        b.mesh.scale.setScalar(1 + b.t * 6);
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - b.t * 2.2);
        if (b.t > 0.45) { scene.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); bursts.splice(i, 1); }
      }
      // third-person follow: ease the focus toward the player, keep the whole court in view
      const target = player ? new THREE.Vector3(THREE.MathUtils.lerp(ww / 2, player.x, framing === "shot" ? 0.8 : 0.55), 1, THREE.MathUtils.lerp(wd * 0.55, player.z, framing === "shot" ? 0.6 : 0.45)) : focus;
      if (framing === "shot") camFocus.copy(target); else camFocus.lerp(target, Math.min(1, dt * 3));
      if (sim.status === "lose" && shake === 0) shake = 0.3;
      shake = Math.max(0, shake - dt);
      if (side) {
        // thumbnails of 2D games: zoom in on the player so the frame isn't mostly empty sky
        const zoom = framing === "shot" ? 1.8 : 1;
        if (ortho.zoom !== zoom) { ortho.zoom = zoom; ortho.updateProjectionMatrix(); }
        const halfW = (ortho.right - ortho.left) / (2 * zoom), halfH = (ortho.top - ortho.bottom) / (2 * zoom);
        const cx = framing === "shot" && player ? THREE.MathUtils.clamp(player.x, halfW, ww - halfW) : ww / 2;
        const cy = framing === "shot" && player ? THREE.MathUtils.clamp(player.y + 1.2, halfH - 0.4, wh - halfH) : wh / 2;
        ortho.position.set(cx + (Math.random() - 0.5) * shake * 0.6, cy + (Math.random() - 0.5) * shake * 0.6, sideZ + sideDist);
        ortho.lookAt(cx, cy, sideZ);
      } else {
        camera.position.copy(camFocus).add(offset);
        camera.position.x += (Math.random() - 0.5) * shake * 0.6;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
        camera.lookAt(camFocus);
      }
      sea.uniforms.uTime.value = t;
      renderer.render(scene, side ? ortho : camera);
    },
    resize(w, h) {
      // cap the drawing buffer near 3.5 million pixels: a full-screen game on a large retina display would
      // otherwise ask the GPU for 15+ million pixels per frame, on top of the background scene
      renderer.setPixelRatio(Math.max(0.75, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(3_500_000 / Math.max(1, w * h)))));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      sideDist = sideDistFor(camera.aspect);
      fitOrtho(camera.aspect);
    },
    dispose(loseContext = false) {
      renderer.dispose();
      if (loseContext) renderer.forceContextLoss();
      burstGeo.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
      });
    },
  };
}
