// Product: a 3D object shot like a studio product film. The block frames the object from its bounds and
// the frame's shape, moves the camera or the object in one of a few classic shots, and lets a light sweep
// cross it in systems that allow one. The object is built from simple geometry or is a real model (a glTF
// file, see src/system/three/spec.ts and models.ts). A model frames from its size in the media table, so
// the block needs no file and frames it the same way before and after it loads.
//
// Rules this block enforces:
// - One hero object, centred, filling about `fill` of the frame's width at 9:16 (of its height at 16:9),
//   standing on a soft contact shadow. Colours come from roles; finishes from a fixed set.
// - Materials: a real model keeps its own materials by default (`material: "own"`): its maker's finish is what a
//   real object looks like, and Matte asks for real materials. `material: "system"` maps a model to the system's
//   roles; use it only to make a model match a drawn film. Forms built from simple geometry (box, sphere, lathe)
//   always take the system's roles: they have no materials of their own.
// - Shots: "turntable" (the object turns about 55 degrees), "push" (the camera moves in), "orbit" (a wider
//   turn with the camera dropping a little), "rise" (the object rises into place), "still". Every move uses
//   the system's move curve over `seconds`; nothing overshoots.
// - It names where the object sits on screen with anchors, so text can avoid it:
//   `<id>-object` (where the object rests at the end of the shot), `<id>-object-start` (at `at`) and
//   `<id>-object-extent` (the box its drawn bounds cover at their largest over the whole shot: keep text out of it).
// - A light sweep (systems that allow "light-sweep") rises and falls on a half sine: `sweep` is its start, its peak is
//   half its length later. The anchor `<id>-sweep-peak` holds the peak as `at` (data: start, peak, end), for a hit.
// - The view is the whole frame by default; 3D draws below the 2D content of its layer.
// - Framing by silhouette. With no `fill` (and no detail), a real model with a silhouette table (three/silhouette.ts)
//   frames by what the frame shows, not by its box: the share of the frame its silhouette covers at its smallest moment
//   of the shot reaches the system's hook share (Direction: hook.area), its silhouette's bounds stay in the room, and,
//   when the scene gives the object no angle, the object turns (up to BROADEST degrees) to its broadest view. A thin
//   object (a desk lamp) comes closer than its box allows. When the full view cannot reach the share, the block says so
//   and names a detail point (a build note). The anchors then follow the silhouette. `<id>-framing` holds the choice.
import { windows } from "../context";
import { DIRECTION } from "../../direction";
import { valueAt } from "../time";
import type { Geometry, Object3D, Scene3D, Vec3 } from "../../three/spec";
import { viewAt, viewBasis, viewDir, type Silhouette } from "../../three/silhouette";
import { SILHOUETTES } from "../../three/silhouettes.gen";
import type { Block, Key, Node } from "../types";

export type ProductProps = {
  id?: string;
  objects: Object3D[];
  shot?: "turntable" | "push" | "orbit" | "rise" | "still";
  /** How long the shot moves, seconds. Default: until `until`, or 8 s. */
  seconds?: number;
  /**
   * The share of the frame the object fills (width at 9:16, height at 16:9). Default 0.55, then larger until the
   * object's box covers the share of the frame that the system's hook asks for (Direction: hook.area), inside the frame
   * and, at 9:16, under the top third.
   */
  fill?: number;
  /** Where the object's centre sits, as a fraction of the frame height from the top. Default 0.58 at 9:16 (the object
   *  owns the middle and lower frame, under the line of the beat), 0.5 at 16:9 and 1:1. */
  centreY?: number;
  /**
   * The part of the frame the object keeps inside at its largest moment (the start and the end of the shot), px of the
   * frame. Give it to keep room for a line: the object centres in it and grows only as far as it lets. It overrides
   * `centreY`.
   */
  room?: { x: number; y: number; w: number; h: number };
  /**
   * "full" (the default): the whole object, framed by `fill`. "detail": the 3D camera moves in on one part, so the
   * part fills the frame and the rest of the object runs past it. A detail always draws on the whole frame: a `box`
   * given with it is taken as its `room` (where the part sits), so the shot never shows as a crop with hard edges.
   */
  frame?: "full" | "detail";
  /**
   * For `frame: "detail"`: the part, as a point in the object's bounds in fractions [x, y, z] from its lowest corner
   * ([0.5, 0.85, 0.5]: high on the centre line, the shade of a lamp), and `span`, the share of the object's height
   * that fills the frame's height. Default span 0.3.
   */
  detail?: { point: [number, number, number]; span?: number };
  /** The object runs past the frame on purpose, and the overflow check is told so. Default: true with `frame: "detail"`. */
  bleed?: boolean;
  /**
   * A turn about the vertical axis, degrees, added to the object's own (and to the shot's turn). Default: with no
   * `fill`, no detail and no object angle given, the turn (within BROADEST degrees) that shows the broadest silhouette;
   * else 0.
   */
  turn?: number;
  /** When the light sweep starts to cross, s (systems that allow one). It peaks half its length later and ends after its
   *  length (0.35 of the shot, at most 2.4 s). Default: a third into the shot. false: none. The anchor <id>-sweep-peak
   *  holds the peak as its `at`: hit({ at: anchor(nodes, "<id>-sweep-peak").at }) plays on the peak. */
  sweep?: number | false;
  box?: { x: number; y: number; w: number; h: number };
  at: number;
  until?: number;
};

/** A geometry's local bounds as [min, max] corners, before the object's own transform. */
function boundsOf(g: Geometry): [Vec3, Vec3] {
  switch (g.kind) {
    case "box": return [[-g.size[0] / 2, -g.size[1] / 2, -g.size[2] / 2], [g.size[0] / 2, g.size[1] / 2, g.size[2] / 2]];
    case "sphere": return [[-g.r, -g.r, -g.r], [g.r, g.r, g.r]];
    case "cylinder": return [[-g.r, -g.h / 2, -g.r], [g.r, g.h / 2, g.r]];
    case "torus": { const e = g.r + g.tube; return [[-e, -e, -g.tube], [e, e, g.tube]]; }
    case "lathe": {
      const r = Math.max(...g.profile.map((p) => p[0])), y0 = Math.min(...g.profile.map((p) => p[1])), y1 = Math.max(...g.profile.map((p) => p[1]));
      return [[-r, y0, -r], [r, y1, r]];
    }
    case "extrude": return [[-g.size / 2, -g.size / 2, -g.depth / 2], [g.size / 2, g.size / 2, g.depth / 2]];
    // A model is centred and scaled to its size before it loads (the size comes from the media table).
    case "model": return [[-g.size[0] / 2, -g.size[1] / 2, -g.size[2] / 2], [g.size[0] / 2, g.size[1] / 2, g.size[2] / 2]];
  }
}

type M = number[]; // a 4 x 4 matrix, column-major
const mul = (a: M, b: M): M => { const o: number[] = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0); return o; };
const ID: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function trs(p: Vec3, rDeg: Vec3, s: number): M {
  const [x, y, z] = rDeg.map((v) => (v * Math.PI) / 180) as Vec3;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Euler XYZ, as three.js applies it.
  const r = [cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz, 0, -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1];
  const o = r.map((v, i) => (i % 4 < 3 && i < 12 ? v * s : v));
  o[12] = p[0]; o[13] = p[1]; o[14] = p[2];
  return o;
}
const apply = (m: M, v: Vec3): Vec3 => { const g = (i: number) => m[i] ?? 0; return [g(0) * v[0] + g(4) * v[1] + g(8) * v[2] + g(12), g(1) * v[0] + g(5) * v[1] + g(9) * v[2] + g(13), g(2) * v[0] + g(6) * v[1] + g(10) * v[2] + g(14)]; };

/** Every corner of every object's bounds, in world space, with the tracks evaluated at t. */
function corners(objs: Object3D[], parent: M, t: number, at: (k: Key[] | undefined, b: number) => number): Vec3[] {
  const out: Vec3[] = [];
  for (const o of objs) {
    const p: Vec3 = [at(o.tracks?.position?.x, (o.position ?? [0, 0, 0])[0]), at(o.tracks?.position?.y, (o.position ?? [0, 0, 0])[1]), at(o.tracks?.position?.z, (o.position ?? [0, 0, 0])[2])];
    const r: Vec3 = [at(o.tracks?.rotation?.x, (o.rotation ?? [0, 0, 0])[0]), at(o.tracks?.rotation?.y, (o.rotation ?? [0, 0, 0])[1]), at(o.tracks?.rotation?.z, (o.rotation ?? [0, 0, 0])[2])];
    const m = mul(parent, trs(p, r, at(o.tracks?.scale, o.scale ?? 1)));
    if (o.geometry) {
      const [a, b] = boundsOf(o.geometry);
      for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) out.push(apply(m, [x, y, z]));
    }
    out.push(...corners(o.children ?? [], m, t, at));
  }
  return out;
}

/** Projects world points through a look-at perspective camera to a screen box in px. */
function project(pts: Vec3[], cam: { pos: Vec3; target: Vec3; fov: number }, box: { x: number; y: number; w: number; h: number }) {
  const f = norm(sub(cam.target, cam.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const th = Math.tan((cam.fov * Math.PI) / 360), aspect = box.w / box.h;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const v = sub(p, cam.pos), z = dot(v, f);
    if (z <= 0.01) continue;
    const nx = dot(v, r) / z / (th * aspect), ny = dot(v, u) / z / th;
    const sx = box.x + ((nx + 1) / 2) * box.w, sy = box.y + ((1 - ny) / 2) * box.h;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** How far the block may turn an object to its broadest view when the scene gives no angle, degrees either way. */
export const BROADEST = 45;

/** The silhouette table of a model geometry, when the prepare step made one. */
export function silhouetteOf(g: Geometry | undefined): Silhouette | undefined {
  return g?.kind === "model" ? SILHOUETTES[g.src.split("/")[0]!] : undefined;
}

type Rect = { x: number; y: number; w: number; h: number };
type Sight = { rect: Rect; area: number };

/**
 * What the frame shows of the objects at time t: the bounds of their silhouettes on screen and the area they cover,
 * px. A model with a silhouette table: its view from the camera's side, scaled by its depth. Any other object: its
 * box's corners (a sphere covers pi / 4 of its box).
 */
function sightOf(objs: Object3D[], parent: M, at: (k: Key[] | undefined, b: number) => number, cam: { pos: Vec3; target: Vec3; fov: number }, box: Rect): Sight {
  const f = norm(sub(cam.target, cam.pos)), th = Math.tan((cam.fov * Math.PI) / 360);
  let rect: Rect | null = null, area = 0;
  const join = (r: Rect) => {
    if (!(r.w > 0 && r.h > 0)) return;
    if (!rect) { rect = { ...r }; return; }
    const x0 = Math.min(rect.x, r.x), y0 = Math.min(rect.y, r.y);
    rect = { x: x0, y: y0, w: Math.max(rect.x + rect.w, r.x + r.w) - x0, h: Math.max(rect.y + rect.h, r.y + r.h) - y0 };
  };
  const walk = (list: Object3D[], par: M) => {
    for (const o of list) {
      const p: Vec3 = [at(o.tracks?.position?.x, (o.position ?? [0, 0, 0])[0]), at(o.tracks?.position?.y, (o.position ?? [0, 0, 0])[1]), at(o.tracks?.position?.z, (o.position ?? [0, 0, 0])[2])];
      const r: Vec3 = [at(o.tracks?.rotation?.x, (o.rotation ?? [0, 0, 0])[0]), at(o.tracks?.rotation?.y, (o.rotation ?? [0, 0, 0])[1]), at(o.tracks?.rotation?.z, (o.rotation ?? [0, 0, 0])[2])];
      const m = mul(par, trs(p, r, at(o.tracks?.scale, o.scale ?? 1)));
      const g = o.geometry, sil = silhouetteOf(g);
      if (g && sil && g.kind === "model") {
        const c = apply(m, [0, 0, 0]), sc = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
        const col = (i: number): Vec3 => [m[i * 4]! / sc, m[i * 4 + 1]! / sc, m[i * 4 + 2]! / sc];
        const X = col(0), Y = col(1), Z = col(2);
        const d = sub(cam.pos, c), l: Vec3 = [dot(d, X), dot(d, Y), dot(d, Z)];
        const yaw = (Math.atan2(l[0], l[2]) * 180) / Math.PI, pitch = (Math.atan2(l[1], Math.hypot(l[0], l[2])) * 180) / Math.PI;
        const v = viewAt(sil, yaw, pitch);
        const { r: rl, u: ul } = viewBasis(viewDir(yaw, pitch));
        const toW = (q: Vec3): Vec3 => [X[0] * q[0] + Y[0] * q[1] + Z[0] * q[2], X[1] * q[0] + Y[1] * q[1] + Z[1] * q[2], X[2] * q[0] + Y[2] * q[1] + Z[2] * q[2]];
        const rW = toW(rl), uW = toW(ul), S = Math.hypot(...g.size) * sc;
        const pts: Vec3[] = [];
        for (const a of [v[1]!, v[2]!]) for (const b of [v[3]!, v[4]!]) pts.push([c[0] + S * (a * rW[0] + b * uW[0]), c[1] + S * (a * rW[1] + b * uW[1]), c[2] + S * (a * rW[2] + b * uW[2])]);
        join(project(pts, cam, box));
        const z = dot(sub(c, cam.pos), f);
        if (z > 0.01) area += v[0]! * (S * (box.h / (2 * th * z))) ** 2;
      } else if (g) {
        const [a, b] = boundsOf(g);
        const pts: Vec3[] = [];
        for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) pts.push(apply(m, [x, y, z]));
        const q = project(pts, cam, box);
        join(q);
        if (q.w > 0 && q.h > 0) area += q.w * q.h * (g.kind === "sphere" ? Math.PI / 4 : 1);
      }
      walk(o.children ?? [], m);
    }
  };
  walk(objs, parent);
  const out = rect ?? { x: box.x + box.w / 2, y: box.y + box.h / 2, w: 0, h: 0 };
  return { rect: out, area: Math.min(area, out.w * out.h) };
}

/** Notes already said, so a scene built many times (every frame of a preview) says each once. */
const said = new Set<string>();

export const product: Block<ProductProps> = (p0, ctx) => {
  const id = p0.id ?? "product";
  // A detail shot fills the frame: the part runs past the frame's edges onto the ground, never onto the hard edges of a
  // box. A box given with frame "detail" is where the part sits (its room); the canvas stays the whole frame. Before:
  // a Keynote detail shot given a box showed as a clipped crop with hard edges on the black ground.
  const full = { x: 0, y: 0, w: ctx.width, h: ctx.height };
  const p = p0.frame === "detail" && p0.box ? { ...p0, box: undefined, room: p0.room ?? p0.box } : p0;
  if (p0.frame === "detail" && p0.box && !said.has(`${id} detail box`)) {
    said.add(`${id} detail box`);
    console.warn(`product ${id}: a detail shot fills the frame (the part runs past its edges), so its box is its room: the part sits there and the canvas is the whole frame. Give room for that, or frame: "full" for an object clipped to a box.`);
  }
  const box = p.box ?? full;
  const shot = ctx.instant ? "still" : p.shot ?? "turntable";
  const dur = p.seconds ?? (p.until !== undefined ? p.until - p.at : 8);
  const t0 = p.at, t1 = p.at + dur;
  const mv = ctx.noOvershoot("move");
  const fov = box.h > box.w ? 32 : 24;
  const tall = box.h > box.w;

  // The object's rest bounds (no tracks), to frame it.
  const rest = corners(p.objects, ID, 0, (_k, b) => b);
  const lo = [0, 1, 2].map((i) => Math.min(...rest.map((c) => c[i]!))), hi = [0, 1, 2].map((i) => Math.max(...rest.map((c) => c[i]!)));
  const size = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
  const centre: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  const fill = p.fill ?? 0.55;
  const th = Math.tan((fov * Math.PI) / 360), aspect = box.w / box.h;
  // Distance so the object's width (9:16) or height (16:9) fills `fill` of the view.
  const span = Math.max(size[0]!, size[2]!);
  let dist = tall ? span / (fill * 2 * th * aspect) : size[1]! / (fill * 2 * th);
  // Put the object's centre at centreY of the frame: aim the camera above or below it.
  const room = p.room;
  let cy = room ? (room.y + room.h / 2 - box.y) / box.h : p.centreY ?? (tall ? 0.58 : 0.5);
  let detail = p.frame === "detail";
  if (detail && !p.detail) throw new Error(`product ${id}: frame "detail" needs detail: { point: [x, y, z] } (a point in the object's bounds, fractions from its lowest corner)`);

  // The rig for a camera distance: the object group and the camera, with the shot's tracks.
  const keys = (a: number, b: number): Key[] => [{ t: t0, v: a }, { t: t1, v: b, curve: mv }];
  // Framing by silhouette: no fill, no detail, and a real model with a silhouette table among the objects.
  const bySight = p.fill === undefined && !detail && (() => { const has = (os: Object3D[]): boolean => os.some((o) => !!silhouetteOf(o.geometry) || has(o.children ?? [])); return has(p.objects); })();
  // The object may turn to its broadest view only when the scene gives no angle and no turn.
  const free = bySight && p.turn === undefined && p.objects.every((o) => !o.rotation && !o.tracks?.rotation);
  let turn = p.turn ?? 0;
  // The detail the camera moves in on: the scene's, or the block's own when the full view cannot fill the hook.
  let dt: { point: [number, number, number]; span?: number } | undefined = detail ? p.detail : undefined;
  let lower = 0;
  const rig = (d: number) => {
    let aimY = centre[1] + (cy - 0.5) * 2 * th * d, camY = centre[1] + d * 0.28, aimX = 0, aimZ = centre[2];
    // A detail: the camera aims at the part from the distance at which `span` of the object's height fills 80 % of
    // the frame's height, a little above it, as a macro lens would.
    if (dt) {
      const f = dt.point.map((v) => Math.min(1, Math.max(0, v)));
      const P0: Vec3 = [lo[0]! + f[0]! * size[0]!, lo[1]! + f[1]! * size[1]!, lo[2]! + f[2]! * size[2]!];
      // The group's turn moves the part round the vertical axis (three.js turns x towards -z).
      const a = (turn * Math.PI) / 180;
      const P: Vec3 = [P0[0] * Math.cos(a) + P0[2] * Math.sin(a), P0[1], -P0[0] * Math.sin(a) + P0[2] * Math.cos(a)];
      d = ((dt.span ?? 0.3) * size[1]!) / (0.8 * 2 * th);
      // `lower` moves the part down the frame by that share of its height (the aim rises), to keep a room's top clear.
      aimX = P[0]; aimY = P[1] + lower * 2 * th * d; aimZ = P[2]; camY = P[1] + d * 0.12;
    }
    const group: Object3D = { id: `${id}-group`, children: p.objects, tracks: {}, ...(turn ? { rotation: [0, turn, 0] as Vec3 } : {}) };
    const camera: Scene3D["camera"] = { fov, position: [aimX, camY, aimZ + d], target: [aimX, aimY, aimZ], tracks: {} };
    if (shot === "turntable") group.tracks = { rotation: { y: keys(-28 + turn, 27 + turn) } };
    if (shot === "orbit") { group.tracks = { rotation: { y: keys(-55 + turn, 40 + turn) } }; camera.tracks = { position: { y: keys(camY * 1.35, camY * 0.85) } }; }
    if (shot === "push") camera.tracks = { position: { z: keys(aimZ + d * 1.14, aimZ + d * 0.94) } };
    if (shot === "rise") group.tracks = { position: { y: keys(-size[1]! * 0.25, 0) }, rotation: { y: keys(-12 + turn, 8 + turn) } };
    return { group, camera };
  };
  // Where the object's drawn bounds sit on screen at time t, and their union over the whole shot (its largest extent).
  const atT = (t: number) => (k: Key[] | undefined, b: number) => (k?.length ? valueAt(ctx.system, k, "x", t) : b);
  const camAt = (r: ReturnType<typeof rig>, t: number) => ({
    pos: [atT(t)(r.camera.tracks?.position?.x, r.camera.position[0]), atT(t)(r.camera.tracks?.position?.y, r.camera.position[1]), atT(t)(r.camera.tracks?.position?.z, r.camera.position[2])] as Vec3,
    target: r.camera.target!, fov,
  });
  // What the frame shows at t: the silhouette in sight mode, else the box's corners (the block's framing before sight).
  const sightAt = (r: ReturnType<typeof rig>, t: number): Sight => {
    if (bySight) {
      // Only the part inside the frame counts (a detail runs past it).
      const q = sightOf([r.group], ID, atT(t), camAt(r, t), box), b = q.rect;
      const iw = Math.max(0, Math.min(b.x + b.w, box.x + box.w) - Math.max(b.x, box.x)), ih = Math.max(0, Math.min(b.y + b.h, box.y + box.h) - Math.max(b.y, box.y));
      return { rect: b, area: b.w * b.h > 0 ? (q.area * iw * ih) / (b.w * b.h) : 0 };
    }
    const q = project(corners([r.group], ID, t, atT(t)), camAt(r, t), box);
    return { rect: q, area: q.w * q.h };
  };
  const screenAt = (r: ReturnType<typeof rig>, t: number) => sightAt(r, t).rect;
  const extent = (r: ReturnType<typeof rig>) => {
    const ss = Array.from({ length: 9 }, (_, k) => sightAt(r, t0 + ((t1 - t0) * k) / 8)), bs = ss.map((q) => q.rect);
    const x0 = Math.min(...bs.map((q) => q.x)), y0 = Math.min(...bs.map((q) => q.y));
    // The smallest the object draws over the shot (an orbit turns it edge on for a moment): the share it keeps.
    const least = ss.reduce((a, q) => (q.area < a.area ? q : a));
    return { x: x0, y: y0, w: Math.max(...bs.map((q) => q.x + q.w)) - x0, h: Math.max(...bs.map((q) => q.y + q.h)) - y0, rest: bs[8]!, least: { ...least.rect, area: least.area } };
  };

  // The system's hook asks the picture to cover a share of the frame (Direction: hook.area). With the default fill, the
  // object grows until its box covers that share at its smallest moment of the shot, so the subject owns the frame as the system describes. Its bounds at
  // their largest over the shot stay inside the room: the frame's width (86 %), the frame's foot and, at 9:16, under
  // the top third (the line of the beat sits there); or the room the scene gives.
  const area = DIRECTION[ctx.system.id]?.hook.area;
  if (p.fill === undefined && !detail) {
    const R0 = room ?? (() => {
      const top = box.y + box.h * (tall ? 0.3 : 0.07), foot = box.y + box.h * 0.97;
      const half = Math.min(box.y + box.h * cy - top, foot - (box.y + box.h * cy));
      return { x: box.x + box.w * 0.07, y: box.y + box.h * cy - half, w: box.w * 0.86, h: half * 2 };
    })();
    // One px inside the room, so a bound that rests on its edge stays on the room's side of it (lineAbove's test).
    const R = { x: R0.x + 1, y: R0.y + 1, w: R0.w - 2, h: R0.h - 2 };
    // The broadest view: the turn whose silhouette, at its smallest over the shot, covers the most. A turn must win by
    // 5 % over facing the camera as the scene stood the object, so a round object keeps its angle.
    if (free) {
      let best = 0, bestShare = extent(rig(dist)).least.area * 1.05;
      for (let a = -BROADEST; a <= BROADEST; a += 15) {
        if (!a) continue;
        turn = a;
        const sh = extent(rig(dist)).least.area;
        if (sh > bestShare) { best = a; bestShare = sh; }
      }
      turn = best;
    }
    for (let i = 0; i < 24; i++) {
      const b = extent(rig(dist));
      // The share it covers at its smallest over the shot, so the hook's share holds at every moment.
      const share = b.least.area / (box.w * box.h);
      const grow = Math.max(1, area ? Math.sqrt(area / share) : 1);
      const k = Math.min(grow, R.w / b.w, R.h / b.h);
      // Centre the extent in the room: move the aim by the offset (a fraction of the frame height).
      const dy = (R.y + R.h / 2 - (b.y + b.h / 2)) / box.h;
      if (Math.abs(k - 1) < 0.0005 && Math.abs(dy) < 0.0003) break;
      dist /= k;
      cy += dy;
    }
  }
  let reached = extent(rig(dist)).least.area / (box.w * box.h);
  const name = bySight ? (() => { const find = (os: Object3D[]): string | undefined => { for (const o of os) { if (silhouetteOf(o.geometry)) return (o.geometry as { src: string }).src.split("/")[0]; const c = find(o.children ?? []); if (c) return c; } }; return find(p.objects); })() : undefined;
  const dense = name ? SILHOUETTES[name]?.dense : undefined;
  // A thin object in the hook: when its whole view covers under half the hook's share, and the scene gave no room and
  // no frame, the shot frames a detail of its densest part, as large a part as still covers the share (a lamp's shade
  // and the top of its arm). Later shots keep the whole object; the note says how to ask for a detail there.
  const hookBy = DIRECTION[ctx.system.id]?.hook.by ?? 1;
  // Thin: the silhouette covers under 30 % of its own bounds on screen (a lamp's arm; not a lantern or a vase, whose
  // whole view at the room's full height is the better picture).
  const least0 = extent(rig(dist)).least, thin = least0.area < 0.3 * least0.w * least0.h;
  // With a room (the line above the object), the detail keeps the room's top: the object may run past the room's
  // sides and foot, never up into the line.
  const auto = bySight && thin && !!area && !!dense && reached < area * 0.5 && p.frame === undefined && p.at <= hookBy;
  const keepTop = () => {
    if (!room) return;
    for (let i = 0; i < 8; i++) {
      const e = extent(rig(dist));
      if (e.y >= room.y - 0.5) break;
      lower += (room.y - e.y + 1) / box.h;
    }
  };
  if (auto) {
    let best: { span: number; share: number } | null = null;
    for (const sp of [0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.3]) {
      dt = { point: dense!, span: sp };
      lower = 0;
      keepTop();
      const sh = extent(rig(dist)).least.area / (box.w * box.h);
      if (!best || sh > best.share) best = { span: sp, share: sh };
      if (sh >= area!) { best = { span: sp, share: sh }; break; }
    }
    dt = { point: dense!, span: best!.span };
    lower = 0;
    keepTop();
    detail = true;
    reached = best!.share;
  }
  const { group, camera } = rig(dist);
  // The choice, for the checks and the lint: how it framed, the share it reached at its smallest, the share asked.
  if (bySight) {
    const msg = auto
      ? `product ${id}: ${name}'s whole view covers too little of the frame for ${ctx.system.id}'s hook (${(area! * 100).toFixed(0)} %), so the shot frames a detail of its densest part: detail: { point: [${dense!.map((v) => v.toFixed(2)).join(", ")}], span: ${dt!.span} } (about ${(reached * 100).toFixed(0)} % of the frame by the table's estimate${room ? "; the room's top stays clear" : ""}). Give fill, room or frame: "full" for the whole object.`
      // A note only where it matters: a shot in the hook whose share is under half of what the hook asks. Later shots
      // and a tall object that fills the room's height keep their share in the framing anchor, without a note.
      : area && p.at <= hookBy && reached < area * 0.5
      ? `product ${id}: framed by its silhouette${turn ? `, turned ${turn} degrees to its broadest view` : ""}; ${name} covers ${(reached * 100).toFixed(0)} % of the frame at its smallest, under the ${(area * 100).toFixed(0)} % that ${ctx.system.id}'s hook asks, because the whole of it must stay in the room (a tall or thin object). Give frame: "detail", detail: { point: [${(dense ?? [0.5, 0.5, 0.5]).map((v) => v.toFixed(2)).join(", ")}] } (its densest part) for a shot that fills the frame, or a larger room.`
      // A turn to the broadest view is the block's default, not a fault: the framing anchor (<id>-framing) holds it.
      : "";
    if (msg && !said.has(msg)) { said.add(msg); console.warn(msg); }
  }

  const spec: Scene3D = {
    id, box, camera, objects: [group], at: p.at, until: p.until,
    sweep: p.sweep === false ? [] : [{ at: typeof p.sweep === "number" ? p.sweep : t0 + dur * 0.33, duration: Math.min(2.4, dur * 0.35) }],
  };

  // Anchors: where the object sits on screen at the start, at rest, and its bounds at their largest over the shot.
  const r = { group, camera }, ext = extent(r);
  const screenAtT = (t: number) => screenAt(r, t);
  // Shown from `at`; a shot that starts at 0 is on screen from the first frame (the thumbnail).
  const opacity: Key[] = windows([[p.at, p.until]]);
  const sw = ctx.system.allows.includes("light-sweep") ? spec.sweep?.[0] : undefined;
  const peak = sw ? sw.at + (sw.duration ?? 0) / 2 : 0;
  const out: Node[] = [
    { id, kind: "scene3d", spec, tracks: { opacity }, ...((p.bleed ?? detail) ? { bleed: true } : {}) },
    { id: `${id}-object`, kind: "anchor", ...screenAtT(t1), at: t1 },
    { id: `${id}-object-start`, kind: "anchor", ...screenAtT(t0), at: t0 },
    { id: `${id}-object-extent`, kind: "anchor", x: ext.x, y: ext.y, w: ext.w, h: ext.h, at: t0 },
    { id: `${id}-framing`, kind: "anchor", x: ext.least.x, y: ext.least.y, w: ext.least.w, h: ext.least.h, at: t0,
      data: { by: auto ? "silhouette detail" : bySight ? "silhouette" : p.fill !== undefined ? "fill" : detail ? "detail" : "box", share: Math.round(reached * 1000) / 1000, asked: area ?? 0, turn } },
    ...(sw ? [{ id: `${id}-sweep-peak`, kind: "anchor" as const, x: ext.x, y: ext.y, w: ext.w, h: ext.h, at: peak, data: { start: sw.at, peak, end: sw.at + (sw.duration ?? 0) } }] : []),
  ];
  return out;
};
