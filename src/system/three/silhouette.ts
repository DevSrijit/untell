// Silhouettes: how much of a frame a real model covers, from any side, before the file loads.
//
// A model's box says little about what a frame shows: a desk lamp (a thin arm, a small shade) fills its box's corners
// and little else, so a shot framed by the box shows a thin line in an empty frame. So the prepare step draws the
// model's alpha from many sides, once, and keeps a few numbers for each side. The product block frames by them.
//
// The table, for each model:
// - `views`: for each yaw (YAWS steps round the vertical axis) and each pitch (PITCHES, degrees above the model's
//   centre), the model drawn in parallel projection into a square of side S (S = the diagonal of its native box, so
//   every side fits), N x N cells. Each view keeps five numbers: the share of the square that the silhouette covers,
//   and the silhouette's bounds [u0, u1, v0, v1] as fractions of S from the square's centre (u to the right, v up).
// - `dense`: the point of the model with the most surface, as fractions [x, y, z] of its native box from the lowest
//   corner. A detail shot aims there when the full view cannot fill the frame.
// - `hull`: the model's outermost points: for each of HULL directions, the solid point that reaches farthest that
//   way, as [x, y, z] fractions of S from the box's centre (a flat list). The edges of the model on screen, in
//   perspective, from any camera, are the edges of these points within a few thousandths of S. The views cannot
//   give that: a near part shows wider than a far one, and their bounds change fast between two stored yaws.
//   The product block centres a shot by them. A table made before the hull has none.
// - Glass (see-through parts: the renderer draws them almost clear, see render.ts isGlass) does not count.
//
// The views use the same camera basis as the product block's projection (right = forward x up, up = right x forward).
// The drawing is pure: it reads the glTF's positions and indices (float, or normalized integers) without three.js.
//
// The tables are made by src/system/three/make_silhouettes.ts (a command; this file is pure and runs in a page too).
import { gltfJson } from "./model";
import type { Vec3 } from "./spec";

export const YAWS = 24;
export const PITCHES = [-30, -15, 0, 15, 30, 45, 60];
const N = 128;

/** How many directions pick the hull's points (spread evenly over the sphere). */
export const HULL = 512;

/** One model's silhouettes: views[pitch index][yaw index] = [share, u0, u1, v0, v1]. */
export type Silhouette = { views: number[][][]; dense: Vec3; hull?: number[] };

type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean };
type G = ReturnType<typeof gltfJson> & {
  accessors?: Accessor[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
  materials?: { alphaMode?: string; pbrMetallicRoughness?: { metallicFactor?: number; metallicRoughnessTexture?: unknown }; extensions?: Record<string, { transmissionFactor?: number }> }[];
};

/** The camera's direction for a view: from the model's centre towards the camera. */
export function viewDir(yawDeg: number, pitchDeg: number): Vec3 {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
}
/** The view's screen basis: right and up, as the product block's projection builds them. */
export function viewBasis(c: Vec3): { r: Vec3; u: Vec3 } {
  const f: Vec3 = [-c[0], -c[1], -c[2]];
  const rr: Vec3 = [-f[2], 0, f[0]]; // f x (0, 1, 0)
  const l = Math.hypot(rr[0], rr[2]) || 1;
  const r: Vec3 = [rr[0] / l, 0, rr[2] / l];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { r, u };
}

/** True for a part the renderer turns into clear glass (render.ts isGlass, read from the glTF material). */
function glassy(g: G, i: number | undefined): boolean {
  const m = i === undefined ? undefined : g.materials?.[i];
  if (!m) return false;
  if (m.alphaMode === "BLEND") return true;
  const tr = m.extensions?.KHR_materials_transmission?.transmissionFactor ?? 0;
  const metal = m.pbrMetallicRoughness?.metallicFactor ?? 1;
  return tr > 0 && metal < 0.5 && !m.pbrMetallicRoughness?.metallicRoughnessTexture;
}

/** The binary chunk of a .glb file. */
function binChunk(bytes: Uint8Array): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const at = 20 + jsonLen;
  if (at + 8 > bytes.byteLength) throw new Error("glb: no binary chunk");
  const len = dv.getUint32(at, true);
  return bytes.subarray(at + 8, at + 8 + len);
}

function read(g: G, bin: Uint8Array, ai: number): Float32Array {
  const a = g.accessors![ai]!;
  const bv = (g as unknown as { bufferViews: { byteOffset?: number; byteStride?: number; byteLength: number }[] }).bufferViews[a.bufferView!]!;
  const comps = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]!;
  const size = ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[a.componentType]!;
  const stride = bv.byteStride || comps * size;
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
  const out = new Float32Array(a.count * comps);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) {
    const o = i * stride + c * size;
    let v: number;
    switch (a.componentType) {
      case 5126: v = dv.getFloat32(o, true); break;
      case 5125: v = dv.getUint32(o, true); break;
      case 5123: v = dv.getUint16(o, true); if (a.normalized) v /= 65535; break;
      case 5122: v = dv.getInt16(o, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
      case 5121: v = dv.getUint8(o); if (a.normalized) v /= 255; break;
      default: v = dv.getInt8(o); if (a.normalized) v = Math.max(v / 127, -1);
    }
    out[i * comps + c] = v;
  }
  return out;
}

type M = number[];
const mul = (a: M, b: M): M => { const o = new Array<number>(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!; return o; };
function local(n: { matrix?: number[]; translation?: Vec3; rotation?: [number, number, number, number]; scale?: Vec3 }): M {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}

/** Every solid (not glass) triangle of the default scene, in world space: a flat list of 9 numbers each. */
export function solidTriangles(bytes: Uint8Array): Float32Array {
  const g = gltfJson(bytes) as G;
  const bin = binChunk(bytes);
  const tris: number[] = [];
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? (g.nodes ?? []).map((_, i) => i);
  const walk = (i: number, parent: M) => {
    const n = g.nodes?.[i];
    if (!n) return;
    const m = mul(parent, local(n));
    if (n.mesh !== undefined) for (const p of g.meshes?.[n.mesh]?.primitives ?? []) {
      if ((p.mode ?? 4) !== 4 || glassy(g, p.material) || p.attributes.POSITION === undefined) continue;
      const pos = read(g, bin, p.attributes.POSITION);
      const count = pos.length / 3;
      const idx = p.indices !== undefined ? read(g, bin, p.indices) : Float32Array.from({ length: count }, (_, k) => k);
      const w = new Float32Array(pos.length);
      for (let k = 0; k < count; k++) {
        const x = pos[k * 3]!, y = pos[k * 3 + 1]!, z = pos[k * 3 + 2]!;
        w[k * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
        w[k * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
        w[k * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      }
      for (let k = 0; k + 2 < idx.length; k += 3) for (let j = 0; j < 3; j++) { const v = idx[k + j]! * 3; tris.push(w[v]!, w[v + 1]!, w[v + 2]!); }
    }
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const r of roots) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return Float32Array.from(tris);
}

/** Draws the triangles in parallel projection along a view and returns [share, u0, u1, v0, v1]. */
function drawView(tris: Float32Array, centre: Vec3, S: number, c: Vec3, grid: Uint8Array): number[] {
  const { r, u } = viewBasis(c);
  grid.fill(0);
  const px = (x: number, y: number, z: number): [number, number] => {
    const dx = x - centre[0], dy = y - centre[1], dz = z - centre[2];
    return [((dx * r[0] + dy * r[1] + dz * r[2]) / S + 0.5) * N, (0.5 - (dx * u[0] + dy * u[1] + dz * u[2]) / S) * N];
  };
  for (let k = 0; k < tris.length; k += 9) {
    const [ax, ay] = px(tris[k]!, tris[k + 1]!, tris[k + 2]!);
    const [bx, by] = px(tris[k + 3]!, tris[k + 4]!, tris[k + 5]!);
    const [cx, cy] = px(tris[k + 6]!, tris[k + 7]!, tris[k + 8]!);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
    if (Math.abs(area) < 1e-9) {
      // An edge-on triangle still covers the cells its points fall in (a thin part seen side on).
      for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]] as const) { const i = Math.floor(x), j = Math.floor(y); if (i >= 0 && j >= 0 && i < N && j < N) grid[j * N + i] = 1; }
      continue;
    }
    const s = area > 0 ? 1 : -1;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      if (grid[j * N + i]) continue;
      const qx = i + 0.5, qy = j + 0.5;
      const w0 = s * ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax));
      const w1 = s * ((cx - bx) * (qy - by) - (cy - by) * (qx - bx));
      const w2 = s * ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx));
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) grid[j * N + i] = 1;
    }
    // A triangle thinner than a cell covers no cell centre: mark the cell of each of its points.
    for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]] as const) { const i = Math.floor(x), j = Math.floor(y); if (i >= 0 && j >= 0 && i < N && j < N) grid[j * N + i] = 1; }
  }
  let n = 0, i0 = N, i1 = -1, j0 = N, j1 = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (grid[j * N + i]) { n++; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  if (!n) return [0, 0, 0, 0, 0];
  const q = (v: number) => Math.round(v * 1e4) / 1e4;
  return [q(n / (N * N)), q(i0 / N - 0.5), q((i1 + 1) / N - 0.5), q(0.5 - (j1 + 1) / N), q(0.5 - j0 / N)];
}

/** The silhouette table of one model file (.glb). */
export function silhouetteOfGlb(bytes: Uint8Array, bounds: { min: Vec3; max: Vec3 }): Silhouette {
  const tris = solidTriangles(bytes);
  if (!tris.length) throw new Error("silhouette: the model has no solid triangles");
  const { min, max } = bounds;
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const S = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const grid = new Uint8Array(N * N);
  const views = PITCHES.map((p) => Array.from({ length: YAWS }, (_, k) => drawView(tris, centre, S, viewDir((k * 360) / YAWS, p), grid)));
  // The densest point: surface area in an 8 x 8 x 8 grid over the box, summed over each cell and its neighbours.
  const D = 8, mass = new Float64Array(D * D * D);
  const cell = (v: number, k: number) => Math.min(D - 1, Math.max(0, Math.floor(((v - min[k]!) / Math.max(1e-9, max[k]! - min[k]!)) * D)));
  for (let k = 0; k < tris.length; k += 9) {
    const a = [tris[k]!, tris[k + 1]!, tris[k + 2]!], b = [tris[k + 3]!, tris[k + 4]!, tris[k + 5]!], c = [tris[k + 6]!, tris[k + 7]!, tris[k + 8]!];
    const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const ar = Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
    const m = [0, 1, 2].map((i) => (a[i]! + b[i]! + c[i]!) / 3);
    const ci = (cell(m[0]!, 0) * D + cell(m[1]!, 1)) * D + cell(m[2]!, 2);
    mass[ci] = mass[ci]! + ar;
  }
  let best = -1, at: Vec3 = [0.5, 0.5, 0.5];
  for (let x = 0; x < D; x++) for (let y = 0; y < D; y++) for (let z = 0; z < D; z++) {
    let s = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X >= 0 && Y >= 0 && Z >= 0 && X < D && Y < D && Z < D) s += mass[(X * D + Y) * D + Z]!;
    }
    if (s > best) { best = s; at = [(x + 0.5) / D, (y + 0.5) / D, (z + 0.5) / D]; }
  }
  return { views, dense: at, hull: hullOf(tris, centre, S) };
}

/**
 * The model's outermost points (see `hull` above): for HULL directions spread evenly over the sphere (a Fibonacci
 * spiral), the point that reaches farthest along each, without repeats, as fractions of S from the centre.
 */
function hullOf(tris: Float32Array, centre: Vec3, S: number): number[] {
  const best = new Int32Array(HULL).fill(-1), reach = new Float64Array(HULL).fill(-Infinity);
  const dirs = Array.from({ length: HULL }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / HULL, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  });
  for (let k = 0; k < tris.length; k += 3) {
    const x = tris[k]! - centre[0], y = tris[k + 1]! - centre[1], z = tris[k + 2]! - centre[2];
    for (let i = 0; i < HULL; i++) {
      const d = dirs[i]!, v = x * d[0] + y * d[1] + z * d[2];
      if (v > reach[i]!) { reach[i] = v; best[i] = k; }
    }
  }
  // `|| 0` turns -0 into 0, so the table reads back from its JSON as it was made.
  const q = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
  const seen = new Set<string>(), out: number[] = [];
  for (const k of best) {
    if (k < 0) continue;
    const p = [q((tris[k]! - centre[0]) / S), q((tris[k + 1]! - centre[1]) / S), q((tris[k + 2]! - centre[2]) / S)];
    const key = p.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(...p); }
  }
  return out;
}

/** One view of a table, between its stored views: [share, u0, u1, v0, v1], bilinear in yaw (round) and pitch. */
export function viewAt(s: Silhouette, yawDeg: number, pitchDeg: number): number[] {
  const yf = ((((yawDeg % 360) + 360) % 360) / 360) * YAWS;
  const y0 = Math.floor(yf) % YAWS, y1 = (y0 + 1) % YAWS, ty = yf - Math.floor(yf);
  const pc = Math.min(PITCHES[PITCHES.length - 1]!, Math.max(PITCHES[0]!, pitchDeg));
  let p0 = 0;
  while (p0 < PITCHES.length - 2 && PITCHES[p0 + 1]! <= pc) p0++;
  const tp = (pc - PITCHES[p0]!) / (PITCHES[p0 + 1]! - PITCHES[p0]!);
  const v = (p: number, y: number) => s.views[p]![y]!;
  return [0, 1, 2, 3, 4].map((i) => {
    const a = v(p0, y0)[i]! * (1 - ty) + v(p0, y1)[i]! * ty, b = v(p0 + 1, y0)[i]! * (1 - ty) + v(p0 + 1, y1)[i]! * ty;
    return a * (1 - tp) + b * tp;
  });
}
