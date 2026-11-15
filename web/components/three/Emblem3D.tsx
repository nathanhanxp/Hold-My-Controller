"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { prefersReducedMotion } from "@/lib/three/greek";

/** Poseidon's trident as a flat shape: shaft, crossbar, three barbed prongs. Units roughly fit a 2.4 tall box. */
function tridentShape(): THREE.Shape {
  const s = new THREE.Shape();
  const w = 0.09; // half width of the shaft
  s.moveTo(-w, -1.25);
  s.lineTo(w, -1.25);
  s.lineTo(w, 0.18);
  // right prong: crossbar out, up, barb
  s.lineTo(0.5, 0.18);
  s.quadraticCurveTo(0.66, 0.22, 0.66, 0.42);
  s.lineTo(0.66, 0.95);
  s.lineTo(0.78, 0.86);
  s.lineTo(0.62, 1.22);
  s.lineTo(0.47, 0.86);
  s.lineTo(0.57, 0.93);
  s.lineTo(0.57, 0.45);
  s.quadraticCurveTo(0.57, 0.33, 0.45, 0.33);
  s.lineTo(w, 0.33);
  // centre prong
  s.lineTo(w, 1.05);
  s.lineTo(0.2, 0.96);
  s.lineTo(0, 1.36);
  s.lineTo(-0.2, 0.96);
  s.lineTo(-w, 1.05);
  s.lineTo(-w, 0.33);
  // left prong, mirrored
  s.lineTo(-0.45, 0.33);
  s.quadraticCurveTo(-0.57, 0.33, -0.57, 0.45);
  s.lineTo(-0.57, 0.93);
  s.lineTo(-0.47, 0.86);
  s.lineTo(-0.62, 1.22);
  s.lineTo(-0.78, 0.86);
  s.lineTo(-0.66, 0.95);
  s.lineTo(-0.66, 0.42);
  s.quadraticCurveTo(-0.66, 0.22, -0.5, 0.18);
  s.lineTo(-w, 0.18);
  s.closePath();
  return s;
}

/** Soft bokeh discs with a brighter rim, drifting slowly; size falls off with depth like a shallow lens. */
function makeBokeh(count: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const palette = ["#f4c6ec", "#c3b2ff", "#f2d28a", "#9fe6e0", "#ffffff", "#ffb5a1"].map((c) => new THREE.Color(c));
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  for (let i = 0; i < count; i += 1) {
    // two drifting columns either side of the emblem, plus a sparse field everywhere
    const r = Math.random();
    let x: number, y: number;
    if (r < 0.36) { x = -2.7 + gauss() * 0.7; y = -1.4 + Math.random() * 4.6 - Math.abs(gauss()) * 0.8; }
    else if (r < 0.66) { x = 2.9 + gauss() * 0.9; y = -2.2 + Math.random() * 2.6; }
    else { x = (Math.random() - 0.5) * 10; y = (Math.random() - 0.5) * 7; }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
    const c = palette[Math.floor(Math.random() * palette.length)];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = Math.pow(Math.random(), 4) * 30 + 2.5;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uPixel;
      varying vec3 vColor; varying float vFade;
      void main() {
        vec3 p = position;
        p.y = mod(position.y + 4.0 + uTime * (0.04 + fract(aSeed) * 0.07), 8.0) - 4.0;
        p.x += sin(uTime * 0.3 + aSeed) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float focus = abs(-mv.z - 7.0);
        gl_PointSize = aSize * uPixel * (0.6 + focus * 0.35) * (6.0 / -mv.z);
        vColor = aColor;
        vFade = smoothstep(4.2, 2.6, abs(p.y)) * (0.35 + 0.65 * fract(aSeed * 7.13));
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float disc = smoothstep(0.5, 0.42, d);
        float rim = smoothstep(0.28, 0.47, d) * disc;
        float a = (disc * 0.22 + rim * 0.32) * vFade;
        gl_FragColor = vec4(vColor * (0.7 + rim * 0.6), a);
      }`,
  });
  return { points: new THREE.Points(geo, mat), mat };
}

/**
 * The homepage centrepiece: an iridescent glass trident inside a glass ring, a glass ribbon looping beneath,
 * and drifting bokeh, lit by a studio environment map. Follows the cursor a little; pauses off screen.
 */
export function Emblem3D() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.2, 9);

    // dark chrome glass: near-black body, mirror reflections, a thin-film rainbow at grazing angles
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#2b2833", metalness: 0.9, roughness: 0.14, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 1200],
      clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25,
    });
    const smoke = new THREE.MeshPhysicalMaterial({ color: "#1b1822", metalness: 0.85, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [300, 1100], envMapIntensity: 1.1 });

    const emblem = new THREE.Group();
    scene.add(emblem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.1, 48, 220), glass);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.028, 16, 220), glass);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.46, 96), new THREE.MeshPhysicalMaterial({ color: "#05040a", roughness: 0.35, metalness: 0.6, clearcoat: 1, envMapIntensity: 0.6, transparent: true, opacity: 0.85 }));
    disc.position.z = -0.12;
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(tridentShape(), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 5, curveSegments: 24 }), smoke);
    tri.geometry.center();
    tri.scale.setScalar(0.92);
    emblem.add(disc, ring, inner, tri);
    // the ribbon: a figure of eight hanging from the ring, like a lanyard
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(2 * t) * 0.9, -1.75 - (1 - Math.cos(t)) * 1.7, Math.sin(t) * 0.5));
    }
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 300, 0.032, 12, true), glass);
    emblem.add(ribbon);
    const bokeh = makeBokeh(760);
    bokeh.mat.uniforms.uPixel.value = dpr;
    scene.add(bokeh.points);
    // a warm key and a cool rim light sweep across the glass
    const warm = new THREE.PointLight("#ffcf8a", 30, 12, 2);
    const cool = new THREE.PointLight("#7fe3ff", 24, 12, 2);
    scene.add(warm, cool, new THREE.AmbientLight("#ffffff", 0.15));

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // keep the emblem whole on narrow screens
      camera.position.z = camera.aspect < 0.9 ? 15 : 12;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    const mouse = new THREE.Vector2();
    const onMove = (e: PointerEvent) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    window.addEventListener("pointermove", onMove, { passive: true });
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = reduce ? 2 : clock.getElapsedTime();
      emblem.rotation.y += ((mouse.x * 0.35 + Math.sin(t * 0.35) * 0.28) - emblem.rotation.y) * 0.04;
      emblem.rotation.x += ((mouse.y * 0.18) - emblem.rotation.x) * 0.04;
      emblem.position.y = Math.sin(t * 0.6) * 0.08 + 0.55;
      tri.rotation.y = Math.sin(t * 0.5) * 0.25;
      warm.position.set(Math.cos(t * 0.5) * 4, 2 + Math.sin(t * 0.7), 3);
      cool.position.set(-Math.cos(t * 0.4) * 4, -1.5, 2.5);
      bokeh.mat.uniforms.uTime.value = t;
      bokeh.points.rotation.y = mouse.x * 0.06;
      renderer.render(scene, camera);
      if (reduce) cancelAnimationFrame(raf);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={host} className="emblem" aria-hidden="true" />;
}
