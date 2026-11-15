"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { prefersReducedMotion, roundedRect } from "@/lib/three/greek";
import type { CardGraph } from "@/lib/serialize";
import { gameShot } from "@/lib/three/shots";

const W = 4.2, H = 2.8;

/** Paint a card face: the mechanic's rendered thumbnail, a dark grade, the title and byline. */
async function paintCard(g: CardGraph): Promise<THREE.CanvasTexture> {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 682;
  const ctx = c.getContext("2d")!;
  const sky = g.theme?.sky ?? "#0a0d14";
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, c.width, c.height);
  try {
    // render a frame of the mechanic's own 3D game onto the card
    const shot = await gameShot(g._id);
    if (shot) ctx.drawImage(shot, 0, 0, c.width, c.height);
  } catch { /* keep the plain sky */ }
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "rgba(6,5,10,0.15)");
  grad.addColorStop(0.55, "rgba(6,5,10,0.35)");
  grad.addColorStop(1, "rgba(6,5,10,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  try { await Promise.all([document.fonts.load("600 96px Cinzel"), document.fonts.load("600 26px Manrope")]); } catch { /* fallback fonts */ }
  ctx.fillStyle = "#f3eadb";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(217,178,111,0.9)";
  ctx.shadowBlur = 28;
  ctx.font = "600 96px Cinzel, Georgia, serif";
  ctx.fillText(g.title.slice(0, 22), c.width / 2, c.height * 0.56);
  ctx.shadowBlur = 0;
  ctx.font = "600 26px Manrope, system-ui, sans-serif";
  ctx.fillStyle = "rgba(243,234,219,0.72)";
  const tag = g.license.type === "paid" ? `${Math.round(g.license.priceLamports / 1e6)} tokens` : "Free to fork";
  ctx.fillText(`@${g.authorId}  ·  ${g.stats.forks} forks  ·  ${tag}`, c.width / 2, c.height * 0.68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cardMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uSize: { value: new THREE.Vector2(W, H) }, uMap: { value: tex }, uBend: { value: 0 }, uOpacity: { value: 1 }, uHover: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uBend, uHover, uTime; varying vec2 vUv;
      void main(){
        vUv = uv; vec3 p = position;
        p.z += sin(uv.x * 3.14159) * uBend + sin(uv.y * 3.14159) * uBend * 0.35;
        p.z += sin(uv.x * 6.0 + uTime * 2.0) * 0.04 * uHover;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOpacity, uHover; uniform vec2 uSize; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * uSize;
        float r = 0.22;
        float d = length(max(abs(p) - (uSize * 0.5 - r), 0.0)) - r;
        if (d > 0.0) discard;
        vec4 c = texture2D(uMap, vUv);
        float edge = 1.0 - smoothstep(0.0, 0.05, -d);
        vec3 bronze = vec3(0.85, 0.66, 0.38);
        vec3 col = c.rgb + bronze * edge * (0.08 + uHover * 0.35);
        float glare = smoothstep(0.35, 0.0, abs(vUv.x - vUv.y * 0.6 - 0.2)) * 0.08 * (0.4 + uHover);
        gl_FragColor = vec4(col + glare, uOpacity);
      }`,
  });
}

/**
 * Full-bleed WebGL carousel of mechanic cards on an arc. Drag, wheel or arrow keys spin it with inertia;
 * cards bend with speed, tilt toward the cursor, and the front card opens on click.
 */
export function CardCarousel3D({ items, onFront }: { items: CardGraph[]; onFront?: (i: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [front, setFront] = useState(0);
  const api = useRef<{ go: (d: number) => void } | null>(null);
  const key = items.map((i) => i._id).join(",");

  useEffect(() => {
    const el = host.current;
    if (!el || !items.length) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.2, 9.5);
    const n = items.length;
    const step = (Math.PI * 2) / Math.max(n, 7);
    const R = 7.2;
    const ring = new THREE.Group();
    ring.position.z = -R;
    scene.add(ring);
    const cards: Array<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial; glow: THREE.Mesh }> = [];
    const glowGeo = roundedRect(W + 0.5, H + 0.5, 0.45);
    items.forEach((g, i) => {
      const holder = new THREE.Group();
      holder.rotation.y = i * step;
      const pivot = new THREE.Group();
      pivot.position.z = R;
      const mat = cardMaterial(new THREE.Texture());
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 24, 16), mat);
      mesh.userData.index = i;
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: "#d9b26f", transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.z = -0.05;
      pivot.add(glow, mesh);
      holder.add(pivot);
      ring.add(holder);
      cards.push({ mesh, mat, glow });
      void paintCard(g).then((tex) => { mat.uniforms.uMap.value = tex; });
    });
    let angle = 0, targetAngle = 0, velocity = 0;
    let hovered = -1;
    const pointer = new THREE.Vector2(9, 9);
    const ray = new THREE.Raycaster();
    const go = (d: number) => { targetAngle -= d * step; };
    api.current = { go };

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.position.z = camera.aspect < 1 ? 13 : 9.5;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let dragging = false, lastX = 0, moved = 0;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; moved = 0; el.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        moved += Math.abs(dx);
        targetAngle += dx * 0.004;
      }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      targetAngle = Math.round(targetAngle / step) * step;
      if (moved < 6 && hovered >= 0) {
        const cur = ((Math.round(-targetAngle / step) % n) + n) % n;
        if (hovered === cur) router.push(`/m/${items[hovered]._id}`);
        else targetAngle = -hovered * step + Math.round((targetAngle + hovered * step) / (Math.PI * 2)) * Math.PI * 2;
      }
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) && !e.shiftKey) return; // vertical wheel scrolls the page
      const now = performance.now();
      if (now - wheelLock < 450) { e.preventDefault(); return; }
      wheelLock = now;
      e.preventDefault();
      go((e.deltaY || e.deltaX) > 0 ? 1 : -1);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", () => { pointer.set(9, 9); });
    el.addEventListener("wheel", onWheel, { passive: false });

    const reduce = prefersReducedMotion();
    const clock = new THREE.Clock();
    let raf = 0, lastFront = -1, idleSince = performance.now();
    const tick = () => {
      const t = clock.getElapsedTime();
      if (!dragging && performance.now() - idleSince > 6000 && !reduce) { idleSince = performance.now(); go(1); }
      if (dragging || Math.abs(targetAngle - angle) > 0.001) idleSince = performance.now();
      const prev = angle;
      angle += (targetAngle - angle) * (reduce ? 1 : 0.07);
      velocity = angle - prev;
      ring.rotation.y = angle;
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(cards.map((c) => c.mesh));
      hovered = hits.length ? (hits[0].object.userData.index as number) : -1;
      el.style.cursor = hovered >= 0 ? "pointer" : dragging ? "grabbing" : "grab";
      const cur = ((Math.round(-angle / step) % n) + n) % n;
      cards.forEach((c, i) => {
        const world = new THREE.Vector3();
        c.mesh.getWorldPosition(world);
        const depth = THREE.MathUtils.clamp((world.z + 2 * R) / (2 * R), 0, 1); // ring centre sits at z = -R
        c.mat.uniforms.uOpacity.value = THREE.MathUtils.clamp(Math.pow(depth, 3.0) * 1.15, 0, 1);
        c.mat.uniforms.uBend.value = THREE.MathUtils.clamp(-velocity * 26, -0.9, 0.9);
        const h = i === hovered ? 1 : 0;
        c.mat.uniforms.uHover.value += (h - c.mat.uniforms.uHover.value) * 0.1;
        c.mat.uniforms.uTime.value = t;
        c.glow.material && ((c.glow.material as THREE.MeshBasicMaterial).opacity = c.mat.uniforms.uHover.value * 0.1);
        const pv = c.mesh.parent!;
        const tiltX = i === hovered ? pointer.y * 0.12 : 0;
        const tiltY = i === hovered ? pointer.x * 0.16 : 0;
        pv.rotation.x += (tiltX - pv.rotation.x) * 0.08;
        pv.rotation.y += (tiltY - pv.rotation.y) * 0.08;
        pv.position.y = Math.sin(t * 0.8 + i) * 0.06;
      });
      if (cur !== lastFront) { lastFront = cur; setFront(cur); onFront?.(cur); }
      renderer.render(scene, camera);
      if (!reduce || dragging) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(tick); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      cards.forEach((c) => { (c.mat.uniforms.uMap.value as THREE.Texture).dispose(); c.mat.dispose(); });
      cards.forEach((c) => c.mesh.geometry.dispose()); glowGeo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const n = items.length;
  return (
    <div className="carousel3d">
      <div
        ref={host}
        className="carousel3d-stage"
        role="region"
        aria-roledescription="carousel"
        aria-label={`Featured mechanics. ${items[front]?.title ?? ""} is in front. Use the arrow keys to turn.`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") api.current?.go(1);
          if (e.key === "ArrowLeft") api.current?.go(-1);
          if (e.key === "Enter" && items[front]) router.push(`/m/${items[front]._id}`);
        }}
      />
      <div className="carousel3d-ui">
        <span className="counter" aria-live="polite">{String(front + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
        <button className="btn quiet sm" onClick={() => api.current?.go(-1)} aria-label="Previous mechanic">Back</button>
        <button className="btn quiet sm" onClick={() => api.current?.go(1)} aria-label="Next mechanic">Next</button>
      </div>
    </div>
  );
}
