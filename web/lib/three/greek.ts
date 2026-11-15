import * as THREE from "three";

/*
 * Procedural Odyssey kit for three.js: fluted marble columns, a temple on a rock, a trireme with a sail,
 * a wine-dark sea shader, a night sky with stars, and drifting embers. No external models or textures.
 */

export const PALETTE = {
  night: new THREE.Color("#07060d"),
  wine: new THREE.Color("#2a0f24"),
  sea: new THREE.Color("#0b2a3a"),
  seaDeep: new THREE.Color("#050b14"),
  moon: new THREE.Color("#f3e6c8"),
  marble: new THREE.Color("#e9e1d0"),
  bronze: new THREE.Color("#c8964e"),
  terracotta: new THREE.Color("#c76a3c"),
  torch: new THREE.Color("#ff9c4a"),
};

/** Marble with a faint warm tint; flat enough to read as stone at night. */
export function marble(color: THREE.ColorRepresentation = PALETTE.marble) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 });
}

/** Fluted column shaft with entasis, a torus base and a simple Ionic capital (volutes as tori). */
export function makeColumn(height = 6, radius = 0.38, flutes = 20, mat: THREE.Material = marble()): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(radius * 0.86, radius, height, flutes * 4, 24, false);
  const pos = shaft.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const t = v.y / height + 0.5;
    const entasis = 1 + Math.sin(t * Math.PI) * 0.04;
    const flute = 1 - 0.06 * Math.pow(Math.max(0, Math.cos(a * flutes)), 2);
    const k = entasis * flute;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  shaft.computeVertexNormals();
  const s = new THREE.Mesh(shaft, mat);
  s.position.y = height / 2 + 0.3;
  s.castShadow = true;
  s.receiveShadow = true;
  g.add(s);
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.4, 0.18, 32), mat);
  base1.position.y = 0.09;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, radius * 0.14, 10, 40), mat);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = 0.24;
  g.add(base1, torus);
  const echinus = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.15, radius * 0.9, 0.22, 32), mat);
  echinus.position.y = height + 0.42;
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(radius * 3, 0.16, radius * 2.4), mat);
  abacus.position.y = height + 0.6;
  g.add(echinus, abacus);
  for (const side of [-1, 1]) {
    const vol = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.32, radius * 0.11, 8, 24), mat);
    vol.position.set(side * radius * 1.25, height + 0.4, 0);
    g.add(vol);
  }
  return g;
}

/** A small temple: stylobate, a row of columns, architrave and pediment. */
export function makeTemple(cols = 6, mat: THREE.Material = marble()): THREE.Group {
  const g = new THREE.Group();
  const spacing = 1.6;
  const width = (cols - 1) * spacing + 2;
  for (let i = 0; i < 3; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2 - i * 0.4, 0.25, 5 - i * 0.4), mat);
    step.position.y = 0.125 + i * 0.25;
    step.receiveShadow = true;
    g.add(step);
  }
  for (const z of [-1.6, 1.6]) {
    for (let i = 0; i < cols; i += 1) {
      if (z < 0 && (i === 1 || i === 4)) continue; // a ruin: some rear columns have fallen
      const c = makeColumn(4.6, 0.32, 18, mat);
      c.position.set(-((cols - 1) * spacing) / 2 + i * spacing, 0.75, z);
      g.add(c);
    }
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 4), mat);
  arch.position.y = 6.25;
  g.add(arch);
  const ped = new THREE.Shape();
  ped.moveTo(-width / 2, 0);
  ped.lineTo(width / 2, 0);
  ped.lineTo(0, 1.4);
  ped.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 4, bevelEnabled: false });
  const pedM = new THREE.Mesh(pedGeo, mat);
  pedM.position.set(0, 6.5, -2);
  g.add(pedM);
  // fallen drum lying on the steps
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.4, 18), mat);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(width / 2 - 0.4, 0.95, 2.4);
  g.add(drum);
  return g;
}

/** A rocky island the temple stands on. */
export function makeIsland(radius = 9): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.75, radius, 2.6, 40, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.35 + Math.sin(x * 3.1 + z * 2.3) * 0.12;
    pos.setXYZ(i, x * (1 + n * 0.12), y + (y > 0 ? n : 0), z * (1 + n * 0.12));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#3a2a22", roughness: 0.95, flatShading: true }));
}

/** A trireme: hull, oars, mast and a terracotta sail with a painted eye on the bow. */
export function makeShip(): THREE.Group {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3, 0.6);
  hullShape.quadraticCurveTo(-3.4, -0.2, -2.2, -0.5);
  hullShape.lineTo(2.4, -0.5);
  hullShape.quadraticCurveTo(3.2, -0.2, 3.6, 1.1);
  hullShape.lineTo(3.1, 0.6);
  hullShape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 1.1, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: "#1c120d", roughness: 0.7 }));
  hull.position.z = -0.55;
  hull.castShadow = true;
  g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.16), new THREE.MeshStandardMaterial({ color: PALETTE.terracotta, roughness: 0.6 }));
  stripe.position.set(0.1, 0.35, 0);
  g.add(stripe);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 8), new THREE.MeshStandardMaterial({ color: "#2a1c14" }));
  mast.position.set(0, 2.4, 0);
  g.add(mast);
  const sailGeo = new THREE.PlaneGeometry(2.8, 2.2, 12, 8);
  const sp = sailGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i += 1) sp.setZ(i, Math.sin((sp.getX(i) / 2.8 + 0.5) * Math.PI) * 0.35);
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: "#b8562e", roughness: 0.85, side: THREE.DoubleSide, emissive: "#3a1306", emissiveIntensity: 0.4 }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0.05, 2.9, 0);
  g.add(sail);
  const oarMat = new THREE.MeshStandardMaterial({ color: "#3b2a1e" });
  for (let i = 0; i < 9; i += 1) {
    for (const side of [-1, 1]) {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 4), oarMat);
      oar.position.set(-2 + i * 0.5, -0.1, side * 0.95);
      oar.rotation.x = side * 1.0;
      oar.userData.oar = side;
      g.add(oar);
    }
  }
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: "#f2e6cf" }));
  eye.position.set(3.05, 0.55, 0.62);
  g.add(eye);
  return g;
}

/** Wine-dark sea: layered sine swells in the vertex shader, moon glitter and fresnel in the fragment shader. */
export function makeSea(size = 400, segments = 220) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.3, 0.25, -1).normalize() },
    uDeep: { value: PALETTE.seaDeep.clone() },
    uShallow: { value: PALETTE.sea.clone() },
    uWine: { value: PALETTE.wine.clone() },
    uMoon: { value: PALETTE.moon.clone() },
    uFogColor: { value: new THREE.Color("#0a0812") },
    uFogNear: { value: 30 },
    uFogFar: { value: 190 },
    uCursor: { value: new THREE.Vector2(0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uCursor;
      varying vec3 vWorld; varying vec3 vNormal; varying float vH;
      float wave(vec2 p, vec2 d, float f, float a, float s){ return sin(dot(p, d) * f + uTime * s) * a; }
      float h(vec2 p){
        float y = wave(p, normalize(vec2(1.0, 0.3)), 0.18, 0.55, 0.9)
                + wave(p, normalize(vec2(-0.4, 1.0)), 0.31, 0.28, 1.3)
                + wave(p, normalize(vec2(0.7, -0.7)), 0.6, 0.12, 1.9)
                + wave(p, normalize(vec2(-1.0, -0.2)), 1.3, 0.05, 2.6);
        float dc = length(p - uCursor);
        y += sin(dc * 1.6 - uTime * 3.0) * 0.18 * exp(-dc * 0.12);
        return y;
      }
      void main(){
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float y = h(wp.xz);
        float e = 0.25;
        float hx = h(wp.xz + vec2(e, 0.0)) - y;
        float hz = h(wp.xz + vec2(0.0, e)) - y;
        vNormal = normalize(vec3(-hx / e, 1.0, -hz / e));
        wp.y += y;
        vH = y;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep, uShallow, uWine, uMoon, uFogColor, uMoonDir; uniform float uFogNear, uFogFar, uTime;
      varying vec3 vWorld; varying vec3 vNormal; varying float vH;
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormal);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, smoothstep(-0.6, 0.8, vH));
        col = mix(col, uWine, 0.35 * smoothstep(0.2, 1.0, fres));
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, uMoonDir), 0.0), 120.0);
        float glitter = pow(max(dot(R, uMoonDir), 0.0), 900.0) * 6.0;
        col += uMoon * (spec * 0.45 + glitter * 0.6);
        col += uMoon * fres * 0.025;
        float d = length(cameraPosition - vWorld);
        float fog = smoothstep(uFogNear, uFogFar, d);
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, uniforms };
}

/** Sky dome: indigo zenith, wine band, a warm glow on the horizon; plus a moon with halo. */
export function makeSky(radius = 380) {
  const geo = new THREE.SphereGeometry(radius, 40, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color("#04040a") }, uMid: { value: new THREE.Color("#1a0d22") }, uHorizon: { value: new THREE.Color("#5a2a1e") } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uMid, uHorizon; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.12, y)); c = mix(c, uTop, smoothstep(0.12, 0.6, y)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  const moon = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false }));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uC: { value: PALETTE.moon.clone() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uC; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.15, d) * 0.35; gl_FragColor = vec4(uC, a); }`,
  }));
  halo.position.z = -0.1;
  moon.add(halo, disc);
  return { sky, moon };
}

export function makeStars(count = 1600, radius = 340) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.95);
    pos[i * 3] = radius * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = radius * Math.cos(ph) * 0.9 + 6;
    pos[i * 3 + 2] = radius * Math.sin(ph) * Math.sin(th);
    size[i] = Math.random() * 1.8 + 0.4;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSize; uniform float uTime; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * 2.0; vA = 0.55 + 0.45 * sin(uTime * 1.5 + position.x * 0.13 + position.z * 0.07); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.95, 0.85, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const points = new THREE.Points(geo, mat);
  return { points, uniforms: mat.uniforms };
}

/** Sea-glow sparks rising from the temple braziers (Aegean blue, matching the accent). */
export function makeEmbers(count = 260, spread = 60) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = Math.random() * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread - 20;
    seed[i] = Math.random() * 100;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSeed; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float t = mod(uTime * (0.4 + fract(aSeed) * 0.6) + aSeed, 20.0);
        p.y = mod(position.y + t, 20.0); p.x += sin(t * 0.7 + aSeed) * 1.2; p.z += cos(t * 0.5 + aSeed) * 0.8;
        vA = smoothstep(0.0, 2.0, p.y) * smoothstep(20.0, 12.0, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (3.0 + fract(aSeed * 7.0) * 4.0) * (30.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.55, 0.85, 1.0, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  return { points: new THREE.Points(geo, mat), uniforms: mat.uniforms };
}

/** Rounded-corner card shape for 3D glass cards. */
export function roundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ShapeGeometry(s, 12);
  // map UVs to 0..1 over the card
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = (pos.getX(i) - x) / w; uv[i * 2 + 1] = (pos.getY(i) - y) / h; }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
