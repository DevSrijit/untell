// Screen space and tilt, for scenes with a camera.
//
// - pin(nodes): the nodes stay in screen space while the camera moves (Base.pinned). Use it for a caption or a
//   status line that rides through a pan or a zoom, so no text has to leave for a move (hard rule 11).
// - tilt(nodes, ctx, moves): tiltX and tiltY tracks on a camera, a box, a text or a picture (lines and circles do
//   not tilt). Each move eases to its angle over the system's move duration (times `scale`) and never overshoots.
//   In a one-frame system the tilt cuts. Keep tilt slight (Graphite: 4-6 degrees) and end it at 0 at rest.
// - whip(camera, ctx, whips): a whip pan (Courtside, Kinetic): the view travels `dx`, `dy` px in a few frames, and
//   the whole view blurs along the direction of travel only while it moves (blur in px = 0.35 x the speed in px per
//   frame, at most 48). It throws in a system that does not allow "motion-blur". The blur is 0 at both ends, so no
//   frame at rest is soft.
import type { Ctx, Key, Node } from "./types";

/** The nodes, drawn in screen space above the camera's world. */
export const pin = (nodes: Node[]): Node[] => nodes.map((n) => (n.kind === "audio" ? n : { ...n, pinned: true }));

export type TiltMove = { at: number; x?: number; y?: number; scale?: number };

/** The nodes with tilt tracks added: each move turns them to `x` (about the horizontal axis) and `y` (about the vertical axis), in degrees. */
export function tilt(nodes: Node[], ctx: Ctx, moves: TiltMove[]): Node[] {
  const tx: Key[] = [{ t: 0, v: 0 }], ty: Key[] = [{ t: 0, v: 0 }];
  let cx = 0, cy = 0;
  const curve = ctx.instant ? "step" as const : ctx.noOvershoot("move");
  for (const m of [...moves].sort((a, b) => a.at - b.at)) {
    const end = m.at + (ctx.instant ? 1 / 30 : ctx.dur.move * (m.scale ?? 1));
    const nx = m.x ?? cx, ny = m.y ?? cy;
    if (nx !== cx) tx.push({ t: m.at, v: cx }, { t: end, v: nx, curve });
    if (ny !== cy) ty.push({ t: m.at, v: cy }, { t: end, v: ny, curve });
    cx = nx; cy = ny;
  }
  return nodes.map((n) => n.kind === "camera" || n.kind === "text" || n.kind === "rect" || n.kind === "image"
    ? { ...n, tracks: { ...n.tracks, ...(tx.length > 1 ? { tiltX: tx } : {}), ...(ty.length > 1 ? { tiltY: ty } : {}) } } : n);
}

export type Whip = { at: number; dx?: number; dy?: number; frames?: number };

/** The camera with whip pans added after its own moves: fast travel with motion blur along it (see the header). */
export function whip(camera: Node[], ctx: Ctx, whips: Whip[]): Node[] {
  if (!ctx.system.allows.includes("motion-blur")) throw new Error(`whip: ${ctx.system.name} does not allow motion-blur`);
  return camera.map((n) => {
    if (n.kind !== "camera") return n;
    const tr = { ...n.tracks };
    const add = (p: "x" | "y" | "blurX" | "blurY", keys: Key[]) => { tr[p] = [...(tr[p] ?? [{ t: 0, v: 0 }]), ...keys].sort((a, b) => a.t - b.t); };
    const last = (p: "x" | "y", t: number) => [...(tr[p] ?? [])].filter((k) => k.t <= t).pop()?.v ?? 0;
    for (const w of [...whips].sort((a, b) => a.at - b.at)) {
      const frames = w.frames ?? 5, d = frames / 30, mid = w.at + d / 2;
      for (const [p, b, delta] of [["x", "blurX", w.dx ?? 0], ["y", "blurY", w.dy ?? 0]] as const) {
        if (!delta) continue;
        const from = last(p, w.at);
        add(p, [{ t: w.at, v: from }, { t: w.at + d, v: from + delta, curve: "move" }]);
        const peak = Math.min(48, Math.round(Math.abs(delta) / frames * 0.35));
        add(b, [{ t: w.at, v: 0 }, { t: mid, v: peak, curve: "linear" }, { t: w.at + d, v: 0, curve: "linear" }]);
      }
    }
    return { ...n, tracks: tr };
  });
}
