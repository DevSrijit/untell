// The one 3D renderer. It builds a three.js scene from a Scene3D spec and draws it at any time t, from
// t alone: no clock, no randomness, no state carried from the previous frame. Remotion calls renderAt
// on every frame; HyperFrames calls it from its seek event. Both draw the same frame.
//
// The system decides the look:
// - Colours come from roles. Finishes map to fixed roughness and metalness values.
// - The light rig follows the system's mode: a warm key, a cool rim and a low fill on dark systems;
//   a soft high key and a low fill on light systems. A floor in the ground colour fades into the
//   background, with a soft contact shadow under the objects.
// - A light sweep is drawn only in systems that allow "light-sweep".
// - A floor reflection is drawn only in systems that allow "reflection" (Matte): the scene drawn once more,
//   mirrored in the floor plane, under a veil of the ground colour that lets `texture.reflection` of it through.
//   It is matte and faint: no blur, no gradient, no glow. It follows every track, because it is the same scene.
// - See-through parts of a model (glass) become one clear, reflective glass, so they never read as black holes.
// - Motion uses the system's curves through the same track evaluation as 2D blocks.
//
// Models (geometry kind "model") load from glTF files. Loading is the one async step: the scene exposes
// `ready`, which settles when every model has loaded, been fitted to its size and drawn once (so the
// texture upload and the shader compile never fall on a captured frame). Each renderer waits for it
// before its first frame: Remotion holds the render with delayRender, HyperFrames registers the timeline
// only after it and hands it back on hf-seek through waitUntil, and the recorder's capture page waits on
// globalThis.__vs3dPending. After `ready`, a frame is again a function of t alone.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { System } from "../systems";
import { assetUrl, colorOf } from "../scene/layout";
import { fitModel } from "./model";
import { valueAt } from "../scene/time";
import type { Key } from "../scene/types";
import type { Finish, Geometry, Object3D, Scene3D, Track3, Vec3 } from "./spec";

const FINISH: Record<Finish, { roughness: number; metalness: number; clearcoat?: number }> = {
  matte: { roughness: 0.82, metalness: 0 },
  satin: { roughness: 0.5, metalness: 0 },
  metal: { roughness: 0.38, metalness: 1 },
  gloss: { roughness: 0.18, metalness: 0, clearcoat: 1 },
};

function roundedCylinder(r: number, h: number, rad: number): THREE.Vector2[] {
  rad = Math.max(0, Math.min(rad, r, h / 2));
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + ((a1 - a0) * i) / 12;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
    }
  };
  arc(r - rad, -h / 2 + rad, -Math.PI / 2, 0);
  arc(r - rad, h / 2 - rad, 0, Math.PI / 2);
  pts.push(new THREE.Vector2(0, h / 2));
  return pts;
}

/**
 * One load per file and page; every scene that shows the model clones it. A failed load is not cached,
 * so a later scene can try again.
 */
const loads = new Map<string, Promise<GLTF>>();
function loadModel(src: string): Promise<GLTF> {
  const url = assetUrl(src);
  let p = loads.get(url);
  if (!p) {
    // A page opened from a file (an untell build of a HyperFrames film) may not fetch a file beside it: Chrome blocks it.
    // It may load a script, so `untell media add` writes the model's bytes into <model>.js and the page reads them.
    const fromFile = typeof location !== "undefined" && location.protocol === "file:";
    p = (fromFile ? bytesFromScript(url).then((buf) => new GLTFLoader().parseAsync(buf, url.replace(/[^/]*$/, ""))) : new GLTFLoader().loadAsync(url))
      .catch((e) => { loads.delete(url); throw new Error(`model ${src}: ${e?.message ?? e}`); });
    loads.set(url, p);
  }
  return p;
}

/** A model's bytes from the script `media add` wrote beside it (<url>.js), for a page opened from a file. */
function bytesFromScript(url: string): Promise<ArrayBuffer> {
  const g = globalThis as unknown as { __vsModelBytes?: Record<string, string> };
  const read = (): ArrayBuffer => {
    const b64 = g.__vsModelBytes?.[url];
    if (!b64) throw new Error(`${url}.js holds no model. Add the model again: untell media add <file> --as <name> --force`);
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };
  if (g.__vsModelBytes?.[url]) return Promise.resolve(read());
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${url}.js`;
    s.onload = () => { try { resolve(read()); } catch (e) { reject(e); } };
    s.onerror = () => reject(new Error(`the page is opened from a file and cannot fetch ${url}; ${url}.js, which holds its bytes for such a page, is missing. Add the model again: untell media add <file> --as <name> --force`));
    document.head.appendChild(s);
  });
}

/** Loads still in progress in this page, for the recorder's capture page (src/player.tsx). */
const pending = ((globalThis as unknown as { __vs3dPending?: Set<Promise<unknown>> }).__vs3dPending ??= new Set());

/**
 * material: "system": the colour comes from the object's role and the artist's normal and occlusion maps
 * stay, so the surface keeps its detail in the system's palette. Roughness and metalness come from the
 * object's finish when it names one, else from the artist's maps. Glass and other see-through parts stay
 * as the artist made them.
 */
function systemMaterial(m: THREE.Material, color: THREE.Color, finish: (typeof FINISH)[Finish] | null): THREE.Material {
  const src = m as THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;
  if (!src.isMeshStandardMaterial || src.transparent || (src.transmission ?? 0) > 0) return m;
  return new THREE.MeshPhysicalMaterial({
    color, normalMap: src.normalMap, normalScale: src.normalScale, aoMap: src.aoMap, aoMapIntensity: src.aoMapIntensity, side: src.side,
    ...(finish
      ? { roughness: finish.roughness, metalness: finish.metalness, clearcoat: finish.clearcoat ?? 0 }
      : { roughness: src.roughness, roughnessMap: src.roughnessMap, metalness: src.metalness, metalnessMap: src.metalnessMap }),
  });
}

/**
 * Glass that reads on any ground. A see-through part of a model (alpha blend, or transmission on a non-metal) renders
 * near black on a dark system's ground: through it is only the dark ground, its own reflections are weak (the scene's
 * environment is dim on purpose), and the transmission pass speckles. So every such part becomes one glass: almost
 * clear, tinted by the artist's colour, smooth, with a clear coat and a stronger reflection of the studio environment
 * (its own `envMapIntensity`, not the scene's). It draws both faces and writes no depth, so the parts behind it show.
 */
export function isGlass(m: THREE.Material): boolean {
  const src = m as THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;
  if (!src.isMeshStandardMaterial) return false;
  return src.transparent || ((src.transmission ?? 0) > 0 && (src.metalness ?? 0) < 0.5 && !src.metalnessMap);
}

function glassMaterial(m: THREE.Material, env: THREE.Texture | null, dark: boolean): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  const tint = src.color ? src.color.clone().lerp(new THREE.Color(1, 1, 1), 0.6) : new THREE.Color(1, 1, 1);
  return new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: Math.min(src.roughness ?? 0.05, 0.08), clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1,
    transparent: true, opacity: dark ? 0.22 : 0.16, depthWrite: false, side: THREE.DoubleSide,
    envMap: env, envMapIntensity: dark ? 1.4 : 1,
  });
}

function geometryOf(g: Exclude<Geometry, { kind: "model" }>): THREE.BufferGeometry {
  switch (g.kind) {
    case "box": return new RoundedBoxGeometry(g.size[0], g.size[1], g.size[2], 8, g.radius ?? 0);
    case "sphere": return new THREE.SphereGeometry(g.r, 96, 64);
    case "cylinder": return new THREE.LatheGeometry(roundedCylinder(g.r, g.h, g.radius ?? 0), 128);
    case "torus": return new THREE.TorusGeometry(g.r, g.tube, 48, 160);
    case "lathe": return new THREE.LatheGeometry(g.profile.map(([x, y]) => new THREE.Vector2(x, y)), 128);
    case "extrude": {
      const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${g.path}"/></svg>`);
      const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
      const bevel = g.bevel ?? 0;
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: g.depth / g.size, bevelEnabled: bevel > 0, bevelSize: bevel / g.size,
        bevelThickness: bevel / g.size, bevelSegments: 6, curveSegments: 24 });
      geo.center();
      geo.scale(g.size, -g.size, g.size); // SVG y points down
      geo.computeVertexNormals();
      return geo;
    }
  }
}

const deg = (v: number) => (v * Math.PI) / 180;

export function createScene3D(canvas: HTMLCanvasElement, spec: Scene3D, system: System, opts: { pixelRatio?: number } = {}) {
  const { w, h } = spec.box;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(opts.pixelRatio ?? 1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const col = (role: Parameters<typeof colorOf>[1]) => new THREE.Color(colorOf(system, role));
  const scene = new THREE.Scene();
  const ground = col("ground");
  scene.background = ground;
  const dark = system.mode === "dark";
  // A dim studio environment, only for reflections on metal and gloss. It is never seen as a background.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = dark ? 0.18 : 0.45;

  // Light rig.
  const key = new THREE.DirectionalLight(0xfff1e0, dark ? 3.4 : 2.2);
  key.position.set(-3.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  // An offset along the normal keeps a surface from shadowing itself in stripes ("shadow acne").
  key.shadow.bias = 0;
  key.shadow.normalBias = 0.04;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdde8ff, dark ? 3.2 : 1.0);
  rim.position.set(3.5, 2.5, -4);
  scene.add(rim);
  // A system that allows rim light (Matte, Keynote) draws the silhouette on both sides: a second rim from behind on
  // the key's side, so a dark object reads against a dark ground at its top and both its edges.
  if (dark && system.allows.includes("rim-light")) {
    const rim2 = new THREE.DirectionalLight(0xfff4e8, 2.4);
    rim2.position.set(-3, 4, -4.5);
    scene.add(rim2);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, ground, dark ? 0.25 : 0.7));
  const sweepLight = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(sweepLight);
  const sweeps = system.allows.includes("light-sweep") ? spec.sweep ?? [] : [];

  // The floor shows only the soft contact shadow: the object stands on the ground colour with no horizon.
  let floor: THREE.Mesh | null = null;
  const floorY = spec.floor ? spec.floor.y ?? 0 : 0;
  if (spec.floor !== false) {
    floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: dark ? 0.6 : 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);
  }
  // The reflection's veil: a plane on the floor in the ground colour, as opaque as the reflection is faint. It is
  // not tone mapped, so it has the exact colour of the background and the floor shows no horizon line.
  const reflection = system.allows.includes("reflection") && spec.floor !== false ? system.texture.reflection ?? 0 : 0;
  const veil = reflection > 0 ? new THREE.Scene() : null;
  if (veil) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ color: ground, transparent: true, opacity: 1 - reflection, depthWrite: false, toneMapped: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = floorY;
    veil.add(plane);
  }

  // Objects.
  const live: { o: Object3D; node: THREE.Object3D; solid: boolean }[] = [];
  const waits: Promise<void>[] = [];
  const build = (o: Object3D, parent: THREE.Object3D) => {
    let node: THREE.Object3D;
    const g = o.geometry;
    if (g?.kind === "model") {
      // A group in the object's place. The model goes in when it loads: scaled to the size and centred.
      node = new THREE.Group();
      const holder = node;
      waits.push(loadModel(g.src).then((gltf) => {
        const model = gltf.scene.clone(true);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const fit = fitModel({ min: box.min.toArray(), max: box.max.toArray() }, g.size);
        if (fit.error > 0.02) console.warn(`model ${g.src}: its bounds differ from the media table by ${(fit.error * 100).toFixed(1)} %; add the model again: \`untell media add <file> --as ${g.src.split("/")[0]} --force\` (in the untell lab: \`bun scripts/media.ts prepare-model ${g.src.split("/")[0]}\`)`);
        const wrap = new THREE.Group();
        wrap.scale.setScalar(fit.scale);
        wrap.position.set(...fit.offset);
        wrap.add(model);
        const f = o.material?.finish ? FINISH[o.material.finish] : null;
        const tint = col(o.material?.role ?? "surface");
        model.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (g.material === "system") mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => systemMaterial(m, tint, f)) : systemMaterial(mesh.material, tint, f);
          // Glass parts become the system glass, whatever the material mode (see glassMaterial).
          const glass = (m: THREE.Material) => (isGlass(m) ? glassMaterial(m, scene.environment, dark) : m);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(glass) : glass(mesh.material);
          if (isGlass(mesh.material as THREE.Material) || (mesh.material as THREE.Material).transparent) mesh.castShadow = false;
        });
        holder.add(wrap);
      }));
    } else if (g) {
      const f = FINISH[o.material?.finish ?? "matte"];
      const mat = new THREE.MeshPhysicalMaterial({ color: col(o.material?.role ?? "ink"), roughness: f.roughness, metalness: f.metalness, clearcoat: f.clearcoat ?? 0 });
      const mesh = new THREE.Mesh(geometryOf(g), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      node = mesh;
    } else node = new THREE.Group();
    parent.add(node);
    live.push({ o, node, solid: !!g });
    for (const c of o.children ?? []) build(c, node);
  };
  for (const o of spec.objects) build(o, scene);
  // The key light's shadow covers the objects: fit its camera to their bounds at rest, so every renderer
  // and every seek order gets the same shadow (a fixed box clipped a tall object's shadow). It runs once
  // now and once more when the models are in; both renderers wait for that before the first frame.
  const fitShadow = () => {
    for (const { o, node } of live) {
      const p = o.position ?? [0, 0, 0], r = o.rotation ?? [0, 0, 0];
      node.position.set(p[0], p[1], p[2]);
      node.rotation.set((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180);
      node.scale.setScalar(o.scale ?? 1);
    }
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const { node, solid } of live) if (solid) box.expandByObject(node);
    if (!box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const half = Math.max(4, (sphere.radius + sphere.center.length()) * 2.2);
      Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: Math.max(20, half * 4) });
      key.shadow.camera.updateProjectionMatrix();
    }
  };
  fitShadow();

  const camera = new THREE.PerspectiveCamera(spec.camera.fov ?? 30, w / h, 0.1, 100);

  const at = (keys: Key[] | undefined, base: number, t: number) => (keys?.length ? valueAt(system, keys, "x", t) : base);
  const vec = (tr: Track3 | undefined, base: Vec3, t: number): Vec3 => [at(tr?.x, base[0], t), at(tr?.y, base[1], t), at(tr?.z, base[2], t)];

  function renderAt(t: number) {
    for (const { o, node } of live) {
      const p = vec(o.tracks?.position, o.position ?? [0, 0, 0], t);
      const r = vec(o.tracks?.rotation, o.rotation ?? [0, 0, 0], t);
      node.position.set(p[0], p[1], p[2]);
      node.rotation.set(deg(r[0]), deg(r[1]), deg(r[2]));
      node.scale.setScalar(at(o.tracks?.scale, o.scale ?? 1, t));
    }
    const cp = vec(spec.camera.tracks?.position, spec.camera.position, t);
    const ct = vec(spec.camera.tracks?.target, spec.camera.target ?? [0, 0, 0], t);
    camera.position.set(cp[0], cp[1], cp[2]);
    camera.lookAt(ct[0], ct[1], ct[2]);
    // The sweep: a light that crosses once, rising and falling in strength on a half sine.
    sweepLight.intensity = 0;
    for (const s of sweeps) {
      const d = s.duration ?? 1.6;
      const u = (t - s.at) / d;
      if (u <= 0 || u >= 1) continue;
      const from = s.from ?? [-6, 3, 2], to = s.to ?? [6, 3, 2];
      sweepLight.position.set(from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u, from[2] + (to[2] - from[2]) * u);
      sweepLight.intensity = 3.2 * Math.sin(Math.PI * u);
    }
    if (veil) mirrorFloor(veil);
    else renderer.render(scene, camera);
  }

  /**
   * The floor reflection in three passes: the scene mirrored about the floor plane (y to 2 floorY - y; three.js
   * turns the faces of a mirrored mesh, so it draws right side out), then the veil over it, then the scene as it is,
   * over both, with no background. The mirror passes the same tracks, so it moves with every object and the camera.
   */
  function mirrorFloor(v: THREE.Scene) {
    renderer.autoClear = false;
    renderer.clear();
    if (floor) floor.visible = false;
    scene.scale.y = -1;
    scene.position.y = 2 * floorY;
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    scene.scale.y = 1;
    scene.position.y = 0;
    scene.updateMatrixWorld(true);
    if (floor) floor.visible = true;
    renderer.clearDepth();
    renderer.render(v, camera);
    renderer.clearDepth();
    const bg = scene.background;
    scene.background = null;
    renderer.render(scene, camera);
    scene.background = bg;
    renderer.autoClear = true;
  }

  // Ready: every model in, the shadow refitted, and one frame drawn so the GPU work is done.
  const ready: Promise<void> = waits.length === 0 ? Promise.resolve() : Promise.all(waits).then(() => {
    fitShadow();
    renderer.compile(scene, camera);
    renderAt(spec.at);
  });
  if (waits.length) { pending.add(ready); ready.then(() => pending.delete(ready), () => pending.delete(ready)); }

  return {
    renderAt,
    ready,
    dispose() {
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
