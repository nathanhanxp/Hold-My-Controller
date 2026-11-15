"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { makeColumn, makeEmbers, makeIsland, makeSea, makeShip, makeSky, makeStars, makeTemple, marble, prefersReducedMotion } from "@/lib/three/greek";

type Station = { pos: [number, number, number]; look: [number, number, number] };

/** Each page is a different viewpoint over the same sea; navigating flies the camera between them. */
function stationFor(path: string): Station {
  if (path.startsWith("/build")) return { pos: [-22, 6, 14], look: [-6, 3, -32] };
  if (path.startsWith("/library")) return { pos: [14, 4.5, 4], look: [2, 5, -60] };
  if (path.startsWith("/community")) return { pos: [0, 14, 10], look: [0, 3, -60] };
  if (path.startsWith("/m/")) return { pos: [10, 3, 4], look: [-4, 2, -26] };
  if (path.startsWith("/status")) return { pos: [-6, 2.2, 24], look: [-30, 40, -200] };
  if (path.startsWith("/learn") || path.startsWith("/u/")) return { pos: [-12, 4, 18], look: [6, 4, -50] };
  return { pos: [0, 4.5, 30], look: [0, 4, -60] };
}

/**
 * The world behind every page: a wine-dark sea under a moon, a ruined temple on a rock, a trireme under sail,
 * fluted columns rising from the water, stars and embers. The camera eases toward each page's station,
 * drifts with the cursor and sinks a little as you scroll. Pauses when hidden; one still frame under reduced motion.
 */
export function World() {
  const host = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const target = useRef<Station>(stationFor(path));

  useEffect(() => { target.current = stationFor(path); }, [path]);
  // the editor and the game preview need the GPU: the sea idles there (a frame every half second)
  const calm = useRef(false);
  useEffect(() => { calm.current = path.startsWith("/build"); }, [path]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      el.classList.add("no-webgl");
      return;
    }
    const reduce = prefersReducedMotion();
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0a0812", 0.0085);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900);
    const st = target.current;
    camera.position.set(...st.pos);
    const look = new THREE.Vector3(...st.look);
    camera.lookAt(look);

    // light: cold moon, warm braziers
    scene.add(new THREE.HemisphereLight("#46526e", "#120a10", 0.55));
    const moonLight = new THREE.DirectionalLight("#cdd8ff", 1.15);
    moonLight.position.set(70, 70, -120);
    scene.add(moonLight);

    const { sky, moon } = makeSky();
    moon.position.set(95, 70, -300);
    moon.lookAt(0, 0, 0);
    scene.add(sky, moon);
    const stars = makeStars();
    scene.add(stars.points);
    const sea = makeSea();
    scene.add(sea.mesh);

    // temple on its island
    const island = makeIsland(11);
    island.position.set(0, -0.6, -64);
    const temple = makeTemple(7, marble("#e3d8c4"));
    temple.position.set(0, 0.7, -64);
    temple.rotation.y = -0.18;
    scene.add(island, temple);
    const braziers: THREE.PointLight[] = [];
    for (const x of [-6.5, 6.5]) {
      const l = new THREE.PointLight("#6fc8e6", 18, 26, 2);
      l.position.set(x, 3, -60);
      braziers.push(l);
      scene.add(l);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: "#a8e4f5" }));
      bowl.position.copy(l.position);
      scene.add(bowl);
    }

    // columns rising from the sea at the edges of the frame
    const colMat = marble("#d9cfbc");
    const pillars: Array<[number, number, number, number]> = [[-16, -1.6, -8, 7], [-21, -2.4, -24, 9], [19, -2, -14, 8], [24, -3, -36, 10], [-30, -2, -44, 9], [11, -3.4, 6, 5]];
    for (const [x, y, z, h] of pillars) {
      const c = makeColumn(h, 0.55, 20, colMat);
      c.position.set(x, y, z);
      c.rotation.z = (Math.random() - 0.5) * 0.08;
      scene.add(c);
    }

    const ship = makeShip();
    ship.scale.setScalar(1.15);
    scene.add(ship);
    const embers = makeEmbers();
    embers.points.position.set(0, 0, -40);
    scene.add(embers.points);

    // post: bloom for moon, embers and braziers
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // resolution adapts to keep the motion smooth: drop it when frames run long, raise it back when there's room;
    // the editor runs it at half resolution so the blocks and the game preview get the GPU
    const maxPr = Math.min(1.25, window.devicePixelRatio || 1);
    let pr = maxPr;
    const applyPr = (next: number) => {
      pr = Math.max(0.5, Math.min(maxPr, next));
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      resize();
    };
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    const mouse = new THREE.Vector2(0, 0);
    const smooth = new THREE.Vector2(0, 0);
    const ray = new THREE.Raycaster();
    const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    };
    let scroll = 0;
    const onScroll = () => { scroll = window.scrollY; };

    const clock = new THREE.Clock();
    const camPos = camera.position.clone();
    const camLook = look.clone();
    let raf = 0;
    let lastFrame = performance.now();
    let frameNo = 0;
    let slow = 0, quick = 0;
    let wasCalm = false;
    const tick = () => {
      // a full-screen game covers the background completely: draw nothing until it closes
      if (document.body.classList.contains("game-open")) { lastFrame = performance.now(); if (!reduce) raf = requestAnimationFrame(tick); return; }
      if (calm.current !== wasCalm) { wasCalm = calm.current; applyPr(wasCalm ? 0.5 : maxPr); }
      frameNo += 1;
      // the editor: every other display frame (30 a second), still smooth, half the work
      if (calm.current && frameNo % 2) { if (!reduce) raf = requestAnimationFrame(tick); return; }
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      const budget = calm.current ? 40 : 22;
      if (dt > budget) { slow += 1; quick = 0; } else if (dt < budget * 0.6) { quick += 1; slow = 0; }
      if (slow > 20 && pr > 0.5) { slow = 0; applyPr(pr - 0.15); }
      if (quick > 240 && pr < (calm.current ? 0.5 : maxPr)) { quick = 0; applyPr(pr + 0.1); }
      const t = clock.getElapsedTime();
      const s = target.current;
      smooth.lerp(mouse, 0.04);
      const scrollK = Math.min(scroll / 1200, 1);
      const goal = new THREE.Vector3(s.pos[0] + smooth.x * 2.2, s.pos[1] + smooth.y * 0.9 - scrollK * 2.2, s.pos[2] - scrollK * 6);
      camPos.lerp(goal, 0.025);
      camLook.lerp(new THREE.Vector3(s.look[0] + smooth.x * 4, s.look[1] + smooth.y * 2 - scrollK * 3, s.look[2]), 0.025);
      camera.position.copy(camPos);
      camera.position.y += Math.sin(t * 0.6) * 0.12; // gentle swell
      camera.lookAt(camLook);

      sea.uniforms.uTime.value = t;
      stars.uniforms.uTime.value = t;
      embers.uniforms.uTime.value = t;
      ray.setFromCamera(smooth, camera);
      if (ray.ray.intersectPlane(seaPlane, hit)) sea.uniforms.uCursor.value.set(hit.x, hit.z);

      // ship sails a slow loop between the columns
      const a = t * 0.045;
      ship.position.set(Math.cos(a) * 20, -0.25 + Math.sin(t * 1.1) * 0.18, -26 + Math.sin(a) * 12);
      ship.rotation.y = -a + Math.PI;
      ship.rotation.z = Math.sin(t * 0.9) * 0.05;
      ship.children.forEach((c) => { if (c.userData.oar) c.rotation.z = Math.sin(t * 2.2) * 0.35; });

      braziers.forEach((b, i) => { b.intensity = 16 + Math.sin(t * 9 + i) * 2.5 + Math.sin(t * 23 + i * 2) * 1.5; });
      composer.render();
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { clock.getDelta(); raf = requestAnimationFrame(tick); } };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
      });
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="world" aria-hidden="true" />;
}
