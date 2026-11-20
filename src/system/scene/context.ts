// Builds the context a block sees, and the motion helpers every block shares. A block never invents
// a duration or a curve: it asks for an entrance, a move or an exit, and the system decides.
import { safeArea } from "../frame";
import type { System, TypeRole } from "../systems";
import { overshoots, valueAt } from "./time";
import { INK } from "./ink.gen";
import type { ColorRole } from "./roles";
import type { AnchorNode, Ctx, Curve, Key, Node, Tracks } from "./types";

export function makeCtx(system: System, width: number, height: number, measure: Ctx["measure"]): Ctx {
  const short = Math.min(width, height);
  const f = system.motion.frames;
  const s = safeArea(width, height);
  const m = system.margin * short;
  return {
    system, width, height, measure,
    size: (r: TypeRole) => Math.round(system.type[r].size * short),
    lineHeight: (r: TypeRole) => Math.round(system.type[r].size * short * system.type[r].leading),
    stroke: Math.max(1, (system.stroke * short) / 1080),
    radius: (system.radius * short) / 1080,
    dur: { enter: f.enter / 30, move: f.move / 30, exit: f.exit / 30, stagger: f.stagger / 30 },
    noOvershoot: (c) => (!overshoots(system.motion[c]) ? c : !overshoots(system.motion.move) ? "move" : "linear"),
    // The platform-safe area, never closer to an edge than the system's margin, and 1 px inside each edge
    // so text placed exactly on an edge passes strict checks such as hyperframes check.
    safe: { left: Math.ceil(Math.max(s.left, m)) + 1, right: Math.floor(width - Math.max(s.right, m)) - 1,
      top: Math.ceil(Math.max(s.top, m)) + 1, bottom: Math.floor(height - Math.max(s.bottom, m)) - 1,
      lowBandTop: Math.floor(s.lowBandTop) - 1, lowBandRight: Math.floor(width - Math.max(s.lowBandRight, m)) - 1 },
    instant: f.enter <= 1,
  };
}

// ---------------------------------------------------------------- the frame of a change
//
// One rule for every block: a change made at time t first shows on the first frame after t. A tween that starts
// at t still shows its start value on t's own frame, so this is the only rule that a cut and a tween can both
// keep. Two blocks given the same time then change on the same frame. A cut at 0 or before shows on frame 0.
// Every cut goes through `cut` (or `switchAt`): its switch sits half a frame before its frame, never on a sampled
// frame, so both renderers flip it on the same frame. A time within a millionth of a frame of a frame counts as
// that frame, so 2.3 s is frame 69 although 2.3 * 30 is 69.00000000000001.

/** Frames per second of every film. */
export const FPS = 30;

/** The first frame that shows a change made at time t: the first frame after t, or frame 0 for t at 0 or before. */
export function frameOf(t: number): number {
  return t <= 0 ? 0 : Math.floor(t * FPS + 1e-6) + 1;
}

/**
 * The frames a timed thing shows on: from frameOf(at) up to, not including, frameOf(until) (at least one frame), the
 * grid of `windows`. A window that ends before the film or before it starts shows on none (off <= on). Footage clips
 * and 3D views use it, so a clip given `until: t` and a block given `at: t` meet on one frame: no blank, no double.
 */
export function shownFrames(at: number, until?: number): { on: number; off: number } {
  if (until !== undefined && (until <= 0 || until <= at)) return { on: 0, off: 0 };
  const on = frameOf(at);
  return { on, off: until === undefined ? Infinity : Math.max(frameOf(until), on + 1) };
}

/** The time on the frame grid whose change shows on the same frame as a change at t: the start of the frame before
 *  frameOf(t). Times from it add up in whole frames. A time at 0 or before stays as it is. */
export function onGrid(t: number): number {
  return t <= 0 ? t : (frameOf(t) - 1) / FPS;
}

/**
 * A value that holds `v0` from frame 0 and changes in one frame at each [time, value] (a cut, as `cut`). Changes in
 * any order; of two changes that show on one frame, the later one wins. Use it for a value that steps: a blink, a
 * count, a row that jumps.
 */
export function steps(v0: number, changes: [number, number][]): Key[] {
  const byFrame = new Map<number, number>();
  for (const [t, v] of [...changes].sort((a, b) => a[0] - b[0])) byFrame.set(frameOf(t), v);
  let cur = byFrame.get(0) ?? v0;
  const keys: Key[] = [{ t: 0, v: cur }];
  for (const k of [...byFrame.keys()].sort((a, b) => a - b)) {
    const v = byFrame.get(k)!;
    if (k === 0 || v === cur) continue;
    keys.push(...switchAt(k, cur, v, (k - 1) / FPS));
    cur = v;
  }
  return keys;
}

/**
 * Keys that switch from `from` to `to` in one frame, so `to` first shows on frame `k` (1 or more). No key comes
 * before `after`: give the time of the last key before these, so the keys stay in order.
 */
export function switchAt(k: number, from: number, to: number, after = -Infinity): Key[] {
  const s = Math.max((k - 0.5) / FPS, after + 1e-9);
  return [{ t: Math.max(after, s - 0.25 / FPS), v: from }, { t: s, v: to, curve: "step" }];
}

/**
 * Keys that cut from `from` to `to` at time t: `to` first shows on frameOf(t). At 0 or before, `to` shows from frame 0:
 * the one key keeps the time t, so it stays in order after keys before it (the block guard folds keys before 0).
 */
export function cut(t: number, from: number, to: number): Key[] {
  const k = frameOf(t);
  return k === 0 ? [{ t: Math.min(t, 0), v: to }] : switchAt(k, from, to, t);
}

/**
 * Opacity keys that show a thing during each [from, until) window and hide it between them, each side a cut.
 * A window shows for one frame at least. Windows that touch or overlap on the frame grid merge. A window from 0
 * or before shows from frame 0; one that ends at 0 or before, or before it starts, never shows. Spans may come in any order.
 */
export function windows(spans: [number, number | undefined][]): Key[] {
  const fr: [number, number][] = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (b !== undefined && (b <= 0 || b <= a)) continue; // a window that ends before the film, or before it starts, never shows
    const on = frameOf(a), off = b === undefined ? Infinity : Math.max(frameOf(b), on + 1);
    const last = fr[fr.length - 1];
    if (last && on <= last[1]) last[1] = Math.max(last[1], off);
    else fr.push([on, off]);
  }
  // Frame k's switch sits between frames k - 1 and k, so switches on rising frames stay in time order.
  const keys: Key[] = [fr[0]?.[0] === 0 ? { t: 0, v: 1 } : { t: 0, v: 0 }];
  for (const [on, off] of fr) {
    if (on > 0) keys.push(...switchAt(on, 0, 1, (on - 1) / FPS));
    if (off !== Infinity) keys.push(...switchAt(off, 1, 0, (off - 1) / FPS));
  }
  return keys;
}

/** Keys that go from `from` to `to`, starting at `at`, over the system's duration for `curve`.
 *  In a one-frame system the change happens in a single frame (a cut). `scale` stretches the duration. */
export function go(ctx: Ctx, at: number, from: number, to: number, curve: Curve = "enter", scale = 1, base?: "enter" | "move" | "exit"): Key[] {
  if (ctx.instant || curve === "step") return cut(at, from, to);
  // The duration comes from the named curve, or from `base` when the curve is linear or a substitute.
  const d = ctx.dur[base ?? (curve === "linear" ? "move" : curve)];
  return [{ t: at, v: from }, { t: at + d * scale, v: to, curve }];
}

/**
 * The shared exit: a track that leaves at `until`, and whose exit always completes. The keys before `until` stay; a
 * segment that `until` cuts ends at `until` on the value it has reached there; then the exit runs from that value to
 * `to` over the system's exit duration (one frame in a one-frame system). So an exit that comes during an entrance
 * (an early `until`) never puts keys out of time order, and never leaves the thing half shown: it starts from where the
 * entrance got to and ends at `to`. With no `until`, the keys come back as they are. `prop` names the track, for the
 * value of a track with no keys.
 */
export function leaveAt(ctx: Ctx, keys: Key[], until: number | undefined, to: number, prop: "opacity" | "reveal" | "y" | "x" | "draw" = "opacity"): Key[] {
  if (until === undefined) return keys;
  const v = valueAt(ctx.system, keys, prop, until);
  // The exit's first key, on `until` with the value reached there (a cut's switch, in a one-frame system), ends the
  // cut segment: every key before it stays, every key after it goes.
  const out = go(ctx, until, v, to, "exit");
  return [...keys.filter((k) => k.t < out[0]!.t - 1e-9), ...out];
}

/** Joins key lists in time order (each list must start after the previous one ends). */
export function seq(...parts: (Key[] | undefined | false)[]): Key[] {
  return parts.filter(Boolean).flat() as Key[];
}

/** Opacity that fades to `to` at `at` and back to 0 at `until`, as `appear` does (an early until is honoured). */
export function fadeOn(ctx: Ctx, at: number, until: number | undefined, to = 1): Key[] {
  return appear(ctx, at, until, 0).opacity!.map((k) => ({ ...k, v: k.v * to }));
}

/** Appears at `at` (fade and a 12 px rise), and leaves at `until` (fade). */
export function appear(ctx: Ctx, at: number, until?: number, rise = 12): Tracks {
  // A thing that leaves before it has come never shows. One that leaves before its entrance ends cuts on instead,
  // so its keys stay in time order (the block guard throws on keys out of order).
  if (until !== undefined && until <= at) return { opacity: [{ t: Math.min(0, until), v: 0 }] };
  if (until !== undefined && !ctx.instant && until - at < ctx.dur.enter)
    return { opacity: until - at < 2 / FPS ? windows([[at, until]]) : leaveAt(ctx, cut(at, 0, 1), until, 0) };
  // A one-frame system: on and off by the frame rule (windows), so an on and an off in one frame keep their order.
  if (ctx.instant) return { opacity: windows([[at, until]]) };
  const t: Tracks = { opacity: leaveAt(ctx, go(ctx, at, 0, 1), until, 0) };
  if (rise && !ctx.instant) t.y = go(ctx, at, rise, 0);
  return t;
}

/** Shown from frame 0 (no motion) until `until`, then hidden in one frame. */
export function shownFromStart(until?: number): Tracks {
  return { opacity: windows([[0, until]]) };
}

/** Shown from `at` (no motion) until `until`, each side a cut (see frameOf). With `at` at 0 or before, it is shown from frame 0. */
export function present(at: number, until?: number): Tracks {
  return { opacity: windows([[Math.max(0, at), until]]) };
}

/**
 * Lines of text that rise out of their own masks one after another. At `until` they sink into their masks
 * together, as one unit, so no fragment of the text stays on screen alone.
 * The returned nodes are hidden before they enter and after they leave.
 * With `at` at 0 or before, the lines are shown at rest from frame 0 (no entrance), so a film can open
 * on them instead of on an empty frame.
 */
export function lines(ctx: Ctx, o: { id: string; x: number; y: number; lines: string[]; role: TypeRole; color?: ColorRole; at: number; until?: number; gap?: number }): Node[] {
  const lh = ctx.lineHeight(o.role);
  const still = o.at <= 0;
  return o.lines.map((text, i) => {
    const at = o.at + i * ctx.dur.stagger;
    const until = o.until;
    // A line that would enter after the text leaves never shows; one whose entrance the exit cuts short is at rest.
    if (until !== undefined && until <= at && !still)
      return { id: `${o.id}-${i}`, kind: "text" as const, x: o.x, y: o.y + i * (lh + (o.gap ?? 0)), text, role: o.role, color: o.color ?? "ink", mask: true, tracks: { opacity: [{ t: 0, v: 0 }] } };
    const short = until !== undefined && !still && until - at < ctx.dur.enter;
    const reveal = ctx.instant ? [{ t: 0, v: 0 }]
      : seq(still || short ? [{ t: Math.min(0, at), v: 0 }] : go(ctx, at, 100, 0), until !== undefined && go(ctx, until, 0, -100, "exit"));
    const end = until !== undefined ? until + (ctx.instant ? 0 : ctx.dur.exit) : undefined;
    return {
      id: `${o.id}-${i}`, kind: "text" as const, x: o.x, y: o.y + i * (lh + (o.gap ?? 0)), text, role: o.role, color: o.color ?? "ink", mask: true,
      tracks: { reveal, ...(still ? shownFromStart(end) : present(at, end)) },
    };
  });
}

/** Rounds to a pixel grid that keeps 1 px hairlines crisp. */
export const px = (v: number) => Math.round(v * 2) / 2;
/**
 * The crisp place for a hairline of `width` px across the pixel grid (align/half-px): an odd width centres on .5 and
 * an even width on a whole px, so the line covers whole pixels. Give the width as drawn (a whole number of px).
 */
export const crisp = (v: number, width: number) => (Math.max(1, Math.round(width)) % 2 ? Math.floor(v) + 0.5 : Math.round(v));

/**
 * Is a text box inside the area the platforms leave clear? At 9:16 that is the safe area, and below
 * lowBandTop the box must also end by lowBandRight. Every block checks its text with this.
 */
/** The box a line of `role` in the line box `b` (one line tall, or several) can draw ink in. */
export function inkBox(ctx: Ctx, role: TypeRole, b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const size = ctx.size(role), lh = ctx.lineHeight(role), m = INK[ctx.system.fonts[ctx.system.type[role].font] ?? ctx.system.fonts.text]?.[ctx.system.type[role].weight];
  if (!m) { const o = Math.max(0, (size * 1.4 - lh) / 2); return { ...b, y: b.y - o, h: b.h + 2 * o }; }
  const A = Math.round(m.ascent * size), D = Math.round(m.descent * size);
  const baseline = Math.floor((lh - (A + D)) / 2) + A;
  const top = b.y + baseline - m.inkTop * size, bottom = b.y + (b.h - lh) + baseline + m.inkBottom * size;
  return { x: b.x, y: top, w: b.w, h: bottom - top };
}

export function textSafe(ctx: Ctx, b: { x: number; y: number; w: number; h: number }, role?: TypeRole): boolean {
  const s = ctx.safe, e = 0.5;
  // With a role, check where the role's ink can reach: from the tallest ascender to the deepest descender, where the
  // browser puts the baseline in the line box (the font's ink table, layout.inkBand). The frame check measures the same
  // ink, so a build warning and the check agree (a box 1.4 x the size, rounded, warned of lines whose ink sat inside:
  // an agent's Title and Manual films). A font with no ink table keeps that estimate.
  if (role) b = inkBox(ctx, role, b);
  const right = b.y + b.h > s.lowBandTop ? s.lowBandRight : s.right;
  return b.x >= s.left - e && b.y >= s.top - e && b.x + b.w <= right + e && b.y + b.h <= s.bottom + e;
}

/**
 * A context for a later view of a scene with a camera: its safe area sits where the camera comes to
 * rest after panning by (x, y). Build the blocks that are read in that view with it, so they check the
 * area they will be seen in. Zoom is not taken into account.
 */
export function withView(ctx: Ctx, view: { x?: number; y?: number }): Ctx {
  const dx = view.x ?? 0, dy = view.y ?? 0;
  const s = ctx.safe;
  return { ...ctx, safe: { left: s.left + dx, right: s.right + dx, top: s.top + dy, bottom: s.bottom + dy, lowBandTop: s.lowBandTop + dy, lowBandRight: s.lowBandRight + dx } };
}

/** Every anchor in a list of nodes, by id. */
export function anchors(nodes: Node[]): Map<string, AnchorNode> {
  return new Map(nodes.filter((n): n is AnchorNode => n.kind === "anchor").map((n) => [n.id, n]));
}

/** The anchor with this id. A wrong id throws and lists the ids that exist, so a scene can find the right one. */
export function anchor(nodes: Node[], id: string): AnchorNode {
  const all = anchors(nodes);
  const a = all.get(id);
  if (!a) throw new Error(`no anchor "${id}". Anchors: ${[...all.keys()].join(", ") || "none"}`);
  return a;
}
