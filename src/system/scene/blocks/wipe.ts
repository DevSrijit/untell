// Wipe: a transition. A flat shape sweeps across the frame, covers the old scene, and uncovers the next.
// Each system wipes in its own way (its SYSTEM.md "Transitions" line):
// - sweep (Spec, Graphite and the other quiet systems): a ground-coloured panel with a hairline edge.
//   It erases the old scene and draws the new one in, like a scan.
// - panel (Cutout, Kinetic, Courtside, Riso): a hard panel in ink or accent slides across. A wipe crosses the
//   frame and leaves. A coloured panel that stays behind content (Courtside's volt ground) is not a wipe: use
//   `ground({ color: "accent", at, until })`, with `enter`/`exit` "cut" or "dissolve".
// - turn (Primary): a square in the accent slides on its axis and turns 90 degrees as it crosses.
// - iris (Pop): a big round shape scales up from a point, covers the frame, then shrinks away.
// - cut (Studio, Ma, Title, Console and the others that never wipe): nothing is drawn; the scenes cut.
//
// Rules this block enforces:
// - No blur, no gradient, no soft edge: one flat shape, and a hairline for the sweep.
// - The shape never opens a gap: every leg uses a curve that does not overshoot, except the iris
//   growing, where an overshoot only makes the cover larger.
// - The shape is hidden while it waits off frame, so it adds nothing to the checks.
// - Both renderers draw every text above every box, so a box cannot hide text. wipeTimes() says when
//   the shape reaches each part of the frame, and wipeOut() hides old text as the shape passes it.
//   The next scene starts each text with wipeTimes().show(box). See the report for the core change
//   that would let a box cover text.
// - In a one-frame system (ctx.instant) every move is a single frame.
// - The shape draws in the overlay layer (1) by default, above all content. `layer` moves it: with
//   layer -1 the panel slides in behind the content, and the content stays above it. Then check that the
//   text still reads on the panel's colour (in Spec, Noir and Title the accent equals the ink).
import { present, cut } from "../context";
import type { ColorRole } from "../roles";
import { stepOf, valueAt } from "../time";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import type { Box } from "./util";
import { baseOf } from "../../own";
import { noteWipe } from "./handover";

export type WipeStyle = "sweep" | "panel" | "turn" | "iris" | "cut";

/** How each system wipes, from its Transitions line. A system not listed sweeps (or cuts, if instant). */
const STYLE: Record<string, { style: WipeStyle; fill?: ColorRole }> = {
  spec: { style: "sweep" }, graphite: { style: "sweep" }, manual: { style: "sweep" }, schematic: { style: "sweep" },
  noir: { style: "sweep" }, matte: { style: "sweep" },
  cutout: { style: "panel", fill: "ink" }, kinetic: { style: "panel", fill: "accent" }, courtside: { style: "panel", fill: "accent" },
  riso: { style: "panel", fill: "accent" },
  primary: { style: "turn", fill: "accent" },
  pop: { style: "iris", fill: "accent" },
  studio: { style: "cut" }, ma: { style: "cut" }, keynote: { style: "cut" }, title: { style: "cut" }, raw: { style: "cut" },
  mark: { style: "cut" }, nocturne: { style: "cut" }, console: { style: "cut" },
};

export type WipeProps = {
  id?: string;
  /** When the shape starts to enter. */
  at: number;
  /** The frame edge the shape enters from (the name every block uses: shape, photo's sweep). Default "left". The iris ignores it. */
  from?: "left" | "right" | "top" | "bottom";
  /** The old form: the way the shape travels ("right" enters at the left edge). `from` wins when both are given. */
  direction?: "left" | "right" | "up" | "down";
  /** Default: the system's own way. */
  style?: WipeStyle;
  /** The shape's colour. Default: the system's own (ground for a sweep). */
  fill?: ColorRole;
  /** Seconds the frame stays covered. Default 2 frames. */
  hold?: number;
  /** For the iris: the point it grows from and shrinks to. Default: low on the right, away from where
   *  text starts, so text goes under it last and comes out first. */
  origin?: [number, number];
  /** Multiplies the leg durations. Default 1. */
  speed?: number;
  /** The draw layer of the shape: -1 backdrop, 0 content, 1 overlay (default). */
  layer?: number;
};

type Plan = {
  style: WipeStyle; fill: ColorRole; at: number; covered: number; end: number;
  /** The shape's own geometry and its tracks. */
  rect: Box & { radius: number }; tracks: Tracks;
  /** The shape's outline at time t, as a polygon (for the timing helpers). */
  shape: (t: number) => [number, number][];
};

const F = 1 / 30;

/** The way a wipe travels: away from the edge `from` names, or the old `direction`. Default: from the left. */
const FROM_TO_TRAVEL = { left: "right", right: "left", top: "down", bottom: "up" } as const;
const travelOf = (p: Pick<WipeProps, "from" | "direction">): "left" | "right" | "up" | "down" => (p.from ? FROM_TO_TRAVEL[p.from] : p.direction ?? "right");

function plan(p: WipeProps, ctx: Ctx): Plan {
  const W = ctx.width, H = ctx.height;
  const def = STYLE[baseOf(ctx.system.id)] ?? { style: ctx.instant ? "cut" : "sweep" };
  const style = p.style ?? def.style;
  const fill = p.fill ?? (style === "sweep" ? "ground" : def.fill ?? "ink");
  const hold = p.hold ?? 2 * F;
  const sp = p.speed ?? 1;
  const dir = travelOf(p);
  const leg = (at: number, from: number, to: number, curve: "enter" | "exit" | "move", base: "enter" | "exit" | "move"): Key[] =>
    ctx.instant ? cut(at, from, to) : [{ t: at, v: from }, { t: at + ctx.dur[base] * sp, v: to, curve: ctx.noOvershoot(curve) }];
  const len = (curve: "enter" | "exit" | "move") => (ctx.instant ? F : ctx.dur[curve] * sp);
  const at = p.at;
  const val = (keys: Key[] | undefined, prop: "x" | "y" | "scale" | "rotate", t: number) => valueAt(ctx.system, keys, prop, t);

  if (style === "cut") {
    return { style, fill, at, covered: at, end: at, rect: { x: 0, y: 0, w: 0, h: 0, radius: 0 }, tracks: {}, shape: () => [] };
  }

  if (style === "iris") {
    const [ox, oy] = p.origin ?? [W * 0.78, H * 0.74];
    const R = Math.ceil(Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x! - ox, y! - oy)))) + 2;
    // Growing may overshoot (the cover only gets larger); shrinking must not pass zero.
    const grow: Key[] = ctx.instant ? cut(at, 0, 1) : [{ t: at, v: 0 }, { t: at + ctx.dur.move * sp, v: 1, curve: "move" }];
    const covered = grow[grow.length - 1]!.t;
    const shrink = leg(covered + hold, 1, 0, "exit", "move");
    const end = shrink[shrink.length - 1]!.t;
    const scale = [...grow, ...shrink];
    const shape = (t: number) => {
      const r = R * Math.max(0, val(scale, "scale", t));
      return Array.from({ length: 48 }, (_, i) => [ox + Math.cos((i / 48) * Math.PI * 2) * r, oy + Math.sin((i / 48) * Math.PI * 2) * r] as [number, number]);
    };
    return { style, fill, at, covered, end, rect: { x: ox - R, y: oy - R, w: 2 * R, h: 2 * R, radius: R }, tracks: { scale }, shape };
  }

  const horiz = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;
  const span = horiz ? W : H;

  if (style === "turn") {
    // A square as wide as the frame's diagonal covers the frame at any angle about its centre.
    const S = Math.ceil(Math.hypot(W, H)) + 4;
    const off = S * Math.SQRT1_2 + span / 2 + 2; // fully off frame at any angle
    const cover = leg(at, -sign * off, 0, "move", "move");
    const covered = at + len("move");
    const out = leg(covered + hold, 0, sign * off, "move", "move");
    const end = covered + hold + len("move");
    const travel = [...cover, ...out];
    const rotate = [...leg(at, -90 * sign, 0, "move", "move"), ...leg(covered + hold, 0, 90 * sign, "move", "move")];
    const tracks: Tracks = { [horiz ? "x" : "y"]: travel, rotate };
    const shape = (t: number) => {
      const d = val(travel, horiz ? "x" : "y", t), a = (val(rotate, "rotate", t) * Math.PI) / 180;
      const cx = W / 2 + (horiz ? d : 0), cy = H / 2 + (horiz ? 0 : d);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const x = (u! * S) / 2, y = (v! * S) / 2;
        return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as [number, number];
      });
    };
    return { style, fill, at, covered, end, rect: { x: W / 2 - S / 2, y: H / 2 - S / 2, w: S, h: S, radius: 0 }, tracks, shape };
  }

  // sweep and panel: a frame-sized panel that slides across. It speeds into the cover and speeds out as it leaves.
  // The sweep's shape reaches 8 px past the frame, so its hairline edges stay out of view while it covers. The panel has
  // no edge to hide: it is exactly the frame, so no strip of it shows in the next view after a whip (an agent's film).
  const pad = style === "sweep" ? 8 : 0;
  const cover = leg(at, -sign * (span + pad * 2), 0, "exit", "exit");
  const covered = at + len("exit");
  // It leaves on the exit curve: it speeds up as it goes, so it never crawls out as a thin strip at the frame's edge
  // (on the enter curve its last frames were a narrow moving strip in an agent's film).
  const out = leg(covered + hold, 0, sign * (span + pad * 2), "exit", "exit");
  const end = covered + hold + len("enter");
  const travel = [...cover, ...out];
  const shape = (t: number) => {
    const d = val(travel, horiz ? "x" : "y", t);
    const x0 = horiz ? d - pad : -pad, y0 = horiz ? -pad : d - pad;
    return [[x0, y0], [x0 + W + pad * 2, y0], [x0 + W + pad * 2, y0 + H + pad * 2], [x0, y0 + H + pad * 2]] as [number, number][];
  };
  return { style, fill, at, covered, end, rect: { x: pad ? -pad : 0, y: pad ? -pad : 0, w: W + pad * 2, h: H + pad * 2, radius: 0 }, tracks: { [horiz ? "x" : "y"]: travel }, shape };
}

// Is a point inside a convex polygon?
function inside(poly: [number, number][], x: number, y: number) {
  if (poly.length < 3) return false;
  // A shape of no size (an iris at scale 0) covers nothing.
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i]!, [bx, by] = poly[(i + 1) % poly.length]!; area += ax * by - bx * ay; }
  if (Math.abs(area) < 1) return false;
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!, [bx, by] = poly[(i + 1) % poly.length]!;
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
}

export type WipeTimes = {
  style: WipeStyle;
  /** The frame is fully covered: the moment to swap scenes. */
  covered: number;
  /** The shape has left the frame. */
  end: number;
  /** The first frame on which the shape covers the centre of `b`. Old text there must be gone by then. */
  hide: (b: Box) => number;
  /** The first frame after the cover on which the centre of `b` is clear. New text there may start then. */
  show: (b: Box) => number;
};

/** When the wipe reaches each part of the frame. Times are on the 30 fps frame grid. */
export function wipeTimes(ctx: Ctx, p: WipeProps): WipeTimes {
  const pl = plan(p, ctx);
  const frame = (t: number) => Math.round(t * 30) / 30;
  // A stepped system (Cutout and Riso, 12 fps) shows on each frame the shape of its last tick (time.ts stepKeys:
  // ticks on whole frames, round(k x 30 / step)), so a box is uncovered on the first frame whose tick uncovers it, up
  // to 2.5 frames after the continuous shape does. Before, show() said 7.2 s where the render showed 7.27 s.
  const step = stepOf(ctx.system);
  const shown = (t: number) => { if (!step) return t; let k = Math.floor(t * step) + 1; while (Math.round((k * 30) / step) / 30 > t + 1e-6) k--; return Math.round((k * 30) / step) / 30; };
  const hide = (b: Box) => {
    if (pl.style === "cut") return frame(pl.at);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let t = frame(pl.at); t <= pl.covered + 4 * F; t += F) if (inside(pl.shape(Math.max(pl.at, shown(t))), cx, cy)) return frame(t);
    return frame(pl.covered);
  };
  const show = (b: Box) => {
    if (pl.style === "cut") return frame(pl.at);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let t = frame(pl.covered) + F; t <= pl.end + 4 * F; t += F) if (!inside(pl.shape(Math.max(pl.covered, shown(t))), cx, cy)) return frame(t);
    return frame(pl.end) + F;
  };
  // The hand-over rule (handover.ts) reads this: a text the wipe hides before a later text starts needs no note.
  noteWipe(ctx, hide);
  return { style: pl.style, covered: pl.covered, end: pl.end, hide, show };
}

/**
 * Hides an old scene under a wipe. Each text node disappears on the frame the shape covers its centre;
 * every other node disappears when the frame is fully covered (the shape is on top of it until then).
 * The nodes keep their own tracks before that.
 */
export function wipeOut(ctx: Ctx, nodes: Node[], w: WipeTimes): Node[] {
  return nodes.map((n) => {
    let t = w.covered;
    if (n.kind === "text") {
      const lh = ctx.lineHeight(n.role);
      t = w.hide({ x: n.x, y: n.y, w: n.width ?? ctx.measure(n.text, n.role), h: lh });
    }
    // Hidden from frame t: the step ends a hair before it, so both renderers agree on the frame.
    const end = t - 0.002;
    const keys = (n.tracks?.opacity ?? [{ t: 0, v: 1 }]).filter((k) => k.t < end - F);
    const now = valueAt(ctx.system, n.tracks?.opacity, "opacity", end - F);
    const opacity: Key[] = [...keys, { t: end - F, v: now }, { t: end, v: 0, curve: "step" }];
    return { ...n, tracks: { ...n.tracks, opacity } } as Node;
  });
}

export const wipe: Block<WipeProps> = (p, ctx) => {
  const id = p.id ?? "wipe";
  const pl = plan(p, ctx);
  if (pl.style === "cut") return [];
  const vis = present(pl.at, pl.end + F);
  const z = 1000; // above every other box in the scene
  const r = pl.rect;
  const out: Node[] = [{ id: `${id}-shape`, kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h, fill: pl.fill, radius: r.radius || undefined, z, layer: p.layer,
    origin: [0.5, 0.5], tracks: { ...pl.tracks, ...vis } }];
  if (pl.style === "sweep") {
    // Hairlines on both edges: the leading one shows while it covers, the trailing one while it uncovers.
    const dir = travelOf(p);
    const horiz = dir === "left" || dir === "right";
    const hw = Math.max(1, ctx.stroke);
    const edges: Box[] = horiz
      ? [{ x: r.x - hw / 2, y: r.y, w: hw, h: r.h }, { x: r.x + r.w - hw / 2, y: r.y, w: hw, h: r.h }]
      : [{ x: r.x, y: r.y - hw / 2, w: r.w, h: hw }, { x: r.x, y: r.y + r.h - hw / 2, w: r.w, h: hw }];
    edges.forEach((e, i) => out.push({ id: `${id}-edge-${i}`, kind: "rect", ...e, fill: "ink", z: z + 1, layer: p.layer, tracks: { ...pl.tracks, ...vis } }));
  }
  return out;
};
