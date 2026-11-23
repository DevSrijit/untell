// Models: the pure part. It reads the bounds of a glTF file (JSON or binary) without three.js, packs a
// .gltf and its files into one .glb, and fits a model's native bounds to a size in scene units.
//
// The prepare step (scripts/media.ts prepare-model) writes each model's native bounds into the media
// table, so the product block can frame a model before the file loads. The renderer measures the loaded
// model again and fits it with the same function, so both agree.
//
// Scale: artists save models in metres, centimetres or millimetres. A model geometry always names its
// size in scene units, and the renderer scales the model to that size. So the unit never reaches the
// framing. Up axis: glTF is Y-up by definition, and the bounds come from the file, so a Z-up export
// shows as a model that lies on its side in the table (its y extent is small). Turn it with the object's
// rotation.
import type { Vec3 } from "./spec";

export type Bounds = { min: Vec3; max: Vec3 };

type Gltf = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { children?: number[]; mesh?: number; matrix?: number[]; translation?: Vec3; rotation?: [number, number, number, number]; scale?: Vec3 }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
};

type M = number[]; // 4 x 4, column-major, as glTF stores it
const ID: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M, b: M): M {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
function local(n: NonNullable<Gltf["nodes"]>[number]): M {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m: M, v: Vec3): Vec3 => [
  m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!,
  m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!,
  m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!,
];

/** The JSON part of a .gltf or .glb file. */
export function gltfJson(bytes: Uint8Array): Gltf {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 20 && dv.getUint32(0, true) === 0x46546c67) {
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("glb: the first chunk is not JSON");
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * The axis-aligned bounds of the default scene, in the file's units, with every node transform applied.
 * Each mesh's box (from its POSITION accessors' min and max, which glTF requires) goes through the node's
 * world matrix corner by corner. three.js's Box3.setFromObject does the same, so the two agree.
 */
export function gltfBounds(g: Gltf): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? (g.nodes ?? []).map((_, i) => i);
  const walk = (i: number, parent: M) => {
    const n = g.nodes?.[i];
    if (!n) return;
    const m = mul(parent, local(n));
    if (n.mesh !== undefined) for (const p of g.meshes?.[n.mesh]?.primitives ?? []) {
      const a = g.accessors?.[p.attributes.POSITION ?? -1];
      if (!a?.min || !a.max) continue;
      for (const x of [a.min[0]!, a.max[0]!]) for (const y of [a.min[1]!, a.max[1]!]) for (const z of [a.min[2]!, a.max[2]!]) {
        const v = apply(m, [x, y, z]);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, v[k]!); max[k] = Math.max(max[k]!, v[k]!); }
      }
    }
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const r of roots) walk(r, ID);
  if (!Number.isFinite(min[0])) throw new Error("gltf: no mesh with bounds in the default scene");
  return { min, max };
}

/**
 * How to place a model of native bounds `b` so that it has `size` in scene units, centred on the origin:
 * scale it by `scale`, then move it by `offset`. The scale comes from the largest axis of `size`, so one
 * uniform scale keeps the model's proportions. `error` is the largest relative difference between the
 * fitted size and `size` on any axis (0 when the table and the file agree).
 */
export function fitModel(b: Bounds, size: Vec3): { scale: number; offset: Vec3; size: Vec3; error: number } {
  const native: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const k = size.indexOf(Math.max(...size));
  if (!(native[k]! > 0)) throw new Error("model: empty bounds");
  const scale = size[k]! / native[k]!;
  const fitted = native.map((v) => v * scale) as Vec3;
  const offset = [0, 1, 2].map((i) => -((b.min[i]! + b.max[i]!) / 2) * scale) as Vec3;
  const error = Math.max(...[0, 1, 2].map((i) => Math.abs(fitted[i]! - size[i]!) / Math.max(size[i]!, 1e-9)));
  return { scale, offset, size: fitted, error };
}

/** The size in scene units of a model with native bounds `b`, scaled so one dimension has a given length. */
export function sizeOf(b: Bounds, by: { height: number } | { width: number } | { longest: number }): Vec3 {
  const n: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const ref = "height" in by ? n[1] : "width" in by ? n[0] : Math.max(...n);
  const want = "height" in by ? by.height : "width" in by ? by.width : by.longest;
  const s = want / ref;
  return [n[0] * s, n[1] * s, n[2] * s];
}

/**
 * Packs a .gltf and its files into one .glb: every buffer and every image goes into the binary chunk.
 * `read` returns a file's bytes by its relative uri. One file loads with one request, so the renderer
 * has fewer ways to wait wrongly, and the media folder holds one model file.
 */
export function packGlb(gltf: Gltf, read: (uri: string) => Uint8Array): Uint8Array {
  const g: Gltf = JSON.parse(JSON.stringify(gltf));
  const parts: Uint8Array[] = [];
  let length = 0;
  const add = (b: Uint8Array) => {
    const at = length;
    parts.push(b);
    length += b.byteLength;
    const pad = (4 - (length % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); length += pad; }
    return at;
  };
  // Buffers first, joined; their views move by the buffer's new offset.
  const bufferAt = (g.buffers ?? []).map((b) => {
    if (!b.uri || b.uri.startsWith("data:")) throw new Error("packGlb: only buffers in files are supported");
    return add(read(decodeURIComponent(b.uri)));
  });
  for (const v of g.bufferViews ?? []) { v.byteOffset = (v.byteOffset ?? 0) + bufferAt[v.buffer]!; v.buffer = 0; }
  for (const im of g.images ?? []) {
    if (!im.uri) continue;
    const bytes = read(decodeURIComponent(im.uri));
    const at = add(bytes);
    g.bufferViews = g.bufferViews ?? [];
    g.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bytes.byteLength });
    im.bufferView = g.bufferViews.length - 1;
    im.mimeType = im.mimeType ?? (/\.png$/i.test(im.uri) ? "image/png" : /\.webp$/i.test(im.uri) ? "image/webp" : "image/jpeg");
    delete im.uri;
  }
  g.buffers = [{ byteLength: length }];
  let json = new TextEncoder().encode(JSON.stringify(g));
  const jpad = (4 - (json.byteLength % 4)) % 4;
  if (jpad) { const j = new Uint8Array(json.byteLength + jpad); j.set(json); j.fill(0x20, json.byteLength); json = j; }
  const total = 12 + 8 + json.byteLength + 8 + length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.byteLength, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  let o = 20 + json.byteLength;
  dv.setUint32(o, length, true); dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}
