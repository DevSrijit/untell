// Camera: pans and zooms the whole scene, so the view travels along a diagram or pushes in on a detail.
// Schematic, Graphite and others name a camera move as their transition; this block is that move.
//
// Rules this block enforces:
// - One camera per scene. Moves run one after another; each holds until the next starts.
// - x and y pan the view right and down in px (the content moves the other way); `zoom` scales about
//   the frame centre. A move takes the system's move duration (times `scale`) on the move curve;
//   a zoom never overshoots. In a one-frame system the view cuts.
// - `tiltX` and `tiltY` (degrees) turn the whole view about its horizontal or vertical axis on the same move,
//   with a fixed perspective (Graphite's slight 3D tilt: 4-6 degrees). Keep a tilt slight, and end it at 0 at rest.
// - `whips`: fast pans of a few frames with motion blur along the travel only while the view moves (screen.whip).
//   Only a system whose `allows` lists "motion-blur" (Courtside, Kinetic) may whip; elsewhere the block throws.
//   The pan stays: after a whip of dx the view rests dx further on, and does not come back. So place each later shot
//   at its own x in the world (with dx = the frame width: 0, 1080, 2160 at 9:16), and give a later move's x as a
//   place in the world too. A move after a whip starts from where the whip left the view.
// - The camera moves the view, not the layout: place every block where it sits in the world. Build the
//   blocks that are read after a pan with withView(ctx, { x, y }) from context.ts, so they check the
//   safe area of the view where the camera comes to rest. A caption that rides through moves is `pinned`.
import { whip, type Whip } from "../screen";
import type { Block, Key, Node, Tracks } from "../types";

export type CameraProps = {
  id?: string;
  /** Each stop: when the move starts, where the view goes, its tilt, and how long it takes (a multiple of the move duration). */
  moves: { at: number; x?: number; y?: number; zoom?: number; tiltX?: number; tiltY?: number; scale?: number }[];
  /** Whip pans: at `at`, the view travels dx, dy px in `frames` frames (default 5), blurred along the travel. The
   *  view stays there: place the next shot at its own x in the world. */
  whips?: Whip[];
};

export const camera: Block<CameraProps> = (p, ctx) => {
  const x: Key[] = [{ t: 0, v: 0 }], y: Key[] = [{ t: 0, v: 0 }], s: Key[] = [{ t: 0, v: 1 }], tx: Key[] = [{ t: 0, v: 0 }], ty: Key[] = [{ t: 0, v: 0 }];
  let cx = 0, cy = 0, cs = 1, ctx_ = 0, cty = 0;
  // A whip's pan stays: a move after it starts from where the whip left the view (before, a move with x after a whip
  // jumped back to the place before the whip first).
  const ws = [...(p.whips ?? [])].sort((a, b) => a.at - b.at);
  let wi = 0;
  for (const m of [...p.moves].sort((a, b) => a.at - b.at)) {
    for (; wi < ws.length && ws[wi]!.at < m.at; wi++) { cx += ws[wi]!.dx ?? 0; cy += ws[wi]!.dy ?? 0; }
    const nx = m.x ?? cx, ny = m.y ?? cy, ns = m.zoom ?? cs, ntx = m.tiltX ?? ctx_, nty = m.tiltY ?? cty;
    const end = m.at + (ctx.instant ? 1 / 30 : ctx.dur.move * (m.scale ?? 1.6));
    const pan = ctx.instant ? "step" as const : ctx.noOvershoot("move");
    for (const [keys, from, to] of [[x, cx, nx], [y, cy, ny], [s, cs, ns], [tx, ctx_, ntx], [ty, cty, nty]] as const) {
      if (from === to) continue;
      keys.push({ t: m.at, v: from }, { t: end, v: to, curve: pan });
    }
    cx = nx; cy = ny; cs = ns; ctx_ = ntx; cty = nty;
  }
  // Tilt tracks only when a move tilts, so a camera without tilt has the same nodes as before.
  const tracks: Tracks = { x, y, scale: s, ...(tx.length > 1 ? { tiltX: tx } : {}), ...(ty.length > 1 ? { tiltY: ty } : {}) };
  const out: Node[] = [{ id: p.id ?? "camera", kind: "camera", tracks }];
  return p.whips?.length ? whip(out, ctx, p.whips) : out;
};
