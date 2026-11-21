// Counter: a number that rolls up to its value, like an odometer.
//
// The node model has no text that changes per frame. So each digit place is a column of masked text
// nodes, one per digit, and the block moves them with `reveal` tracks. A digit enters from below its
// mask and leaves above it, so every column turns upward.
//
// Rules this block enforces:
// - It counts up only. A target below the start does not roll: the block warns and shows the target.
//   A negative value does not roll either; the block shows it still (rule 7: count only what grows).
// - It never overshoots. Every column turns one way and lands on its target digit on the last key.
//   The roll uses ctx.noOvershoot("move"); in a system whose curves overshoot, that is linear.
// - Places that change slowly turn like a true odometer: a place turns over while the place to its
//   right turns from 9 to 0. Places that would change more than 15 times in the roll spin instead:
//   each spins at least 1.3 times as fast as the place to its left, so no two places show the same
//   digit in step. They land one after another from the right, each before the place to its left
//   turns to its last digit. The slow places always read true, so the leading digits
//   never read above the target.
// - A place that moves more than half a digit in one frame shows whole digits only (no half digit
//   frozen in a frame). It rolls smoothly again as it slows down to land.
// - Fixed width: every digit place has the width of the widest digit, and each digit is centred in it.
//   Nothing reflows. Separators, the prefix and the suffix never move.
// - The box holds the whole mask (the line box plus the mask pads above and below), so a rolling digit
//   never shows over a neighbour of the block.
// - Leading zeros: by default they show in muted ink, as on an odometer (`lead: "zeros"`). With
//   `lead: "blank"` they do not show, and the number grows to the left inside its fixed width.
// - Size: the largest of display, headline and body that fits the box and the text-safe area. When
//   body does not fit, the last resort is the compact form (1.28M) with two decimals, rounded down.
//   When that also does not fit, the block warns and draws at body size.
// - One-frame systems (ctx.instant): the final value appears in one frame. Nothing rolls.
// - The figures' ink (from the baseline to the figure height, layout.inkBand) is centred in the box, not their
//   line box: figures have no descender, so a line box puts them high.
// - Text hidden by its mask also has opacity 0, so no hidden digit counts as text on screen.
// - Only the start value and the landed value read as text. A digit in flight shows dimmed (DIM): it
//   is motion, not something to read. Each place brightens as it lands, so the result reads at once.
// - The roll starts on the counter's entrance frame (`rollAt`, default `at`): a counter never sits on "0" before it
//   rolls, because a still "0" reads as a fault. Give `rollAt` to hold the start value on purpose.
// - `until` is honoured: the counter starts to leave at `until`, never later. A roll that would end after `until`
//   is shortened to end on it; when that leaves under 0.2 s of roll, the block throws and names the earliest `until`.
// - The digit columns enter as one gesture: every node carries the group `<id>-digits`, so the motion checks count
//   the counter as one mover.
import { frameOf, go, lines, present, seq, textSafe, cut } from "../context";
import { centreInk, maskPad } from "../layout";
import type { ColorRole } from "../roles";
import { ease } from "../time";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Curve, Key, Node, Tracks } from "../types";

export type CounterFormat = {
  prefix?: string;
  suffix?: string;
  /** Digits after the decimal point. The count steps in units of the last digit. */
  decimals?: number;
  /** Thousands separators (default true). */
  group?: boolean;
};

export type CounterProps = {
  id?: string;
  /** The box in px. The number sits inside it, centred vertically. */
  x: number; y: number; w: number; h: number;
  /** The target. The roll ends exactly here. */
  value: number;
  /** Where the roll starts (default 0). It must not be above `value`. */
  from?: number;
  format?: CounterFormat;
  /** A fixed type role. Default: the largest of display, headline and body that fits. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  lead?: "zeros" | "blank";
  /** When the roll starts, in seconds. Default: the entrance frame (frameOf(at)). A later time holds the start value until then. */
  rollAt?: number;
  at: number;
  until?: number;
};

/** Timing for a counter that another block drives (a meter fill, a stat). */
export type RollTiming = { rollAt?: number; rollDur?: number };

/** Places whose true count is above this spin as a blur. At about 66 frames, 15 steps stay readable. */
const CAP = 15;
const FPS = 30;
/** The opacity of a digit in flight: under 0.5, so the checks do not read it as a line of text. */
const DIM = 0.42;
/** The start value holds this long (s) from its entrance before it rolls, so it can be read. */
const READ = 0.5;
const onFrame = (t: number) => Math.ceil(t * FPS - 1e-6) / FPS;

type Glyph = { kind: "digit"; col: number } | { kind: "sep"; col: number; text: string } | { kind: "dot" } | { kind: "pre" | "suf"; text: string };

export type CounterLayout = {
  role: TypeRole;
  /** Integer units (value x 10^decimals). */
  target: number; start: number;
  sign: string;
  decimals: number;
  cols: number;
  colW: number;
  w: number;
  /** The height the block takes: the line box and both mask pads. */
  h: number;
  /** The line box's offset from the top of `h`, and its height. */
  padTop: number; lh: number;
  glyphs: { g: Glyph; x: number; w: number }[];
  prefix: string; suffix: string;
};

function glyphsFor(cols: number, dec: number, group: boolean, prefix: string, suffix: string): Glyph[] {
  const out: Glyph[] = [];
  if (prefix) out.push({ kind: "pre", text: prefix });
  for (let i = cols - 1; i >= 0; i--) {
    out.push({ kind: "digit", col: i });
    if (group && i > dec && (i - dec) % 3 === 0) out.push({ kind: "sep", col: i, text: "," });
    if (i === dec && dec > 0) out.push({ kind: "dot" });
  }
  if (suffix) out.push({ kind: "suf", text: suffix });
  return out;
}

function layoutAt(ctx: Ctx, role: TypeRole, target: number, start: number, sign: string, f: Required<Omit<CounterFormat, "prefix" | "suffix">> & { prefix: string; suffix: string }): CounterLayout {
  const cols = Math.max(String(target).length, f.decimals + 1);
  const colW = Math.max(...Array.from({ length: 10 }, (_, d) => ctx.measure(String(d), role)));
  const prefix = sign + f.prefix;
  let x = 0;
  const glyphs = glyphsFor(cols, f.decimals, f.group, prefix, f.suffix).map((g) => {
    const w = g.kind === "digit" ? colW : ctx.measure(g.kind === "dot" ? "." : g.text, role);
    const out = { g, x, w };
    x += w;
    return out;
  });
  const pad = maskPad(ctx.system, role, Math.min(ctx.width, ctx.height));
  const lh = ctx.lineHeight(role);
  // The font's own box reaches about 0.15 em above a tight line box, and the checks measure that box.
  // So the block keeps at least 0.2 em clear above the line box, even where the mask pad is smaller.
  const padTop = Math.max(pad.top, Math.round(ctx.size(role) * 0.2));
  return { role, target, start, sign, decimals: f.decimals, cols, colW, w: x, h: lh + padTop + pad.bottom, padTop, lh, glyphs, prefix, suffix: f.suffix };
}

/** Chooses the type role and lays the number out. Exported for blocks that set a counter in a layout. */
export function counterLayout(p: Pick<CounterProps, "value" | "from" | "format" | "role" | "x" | "y" | "w" | "h" | "id">, ctx: Ctx, roles: TypeRole[] = ["display", "headline", "body"], warn = true): CounterLayout {
  const f0 = p.format ?? {};
  const make = (compact: boolean) => {
    let value = p.value, from = p.from ?? 0, decimals = f0.decimals ?? 0, suffix = f0.suffix ?? "";
    if (compact) {
      const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
      const u = units.find(([d]) => Math.abs(value) >= d);
      if (u) { value /= u[0]; from /= u[0]; decimals = 2; suffix = u[1] + suffix; }
    }
    const k = 10 ** decimals;
    // The compact form rounds down (9,876,543,210 is 9.87B), so it never reads above the true value.
    let target = compact ? Math.floor(value * k + 1e-9) : Math.round(value * k), start = compact ? Math.floor(from * k + 1e-9) : Math.round(from * k), sign = "";
    if (target < 0) { sign = "−"; target = -target; start = target; }
    // Counting down is refused: the counter shows the target without a roll.
    if (start > target || start < 0) start = target;
    return { target, start, sign, f: { decimals, group: f0.group ?? true, prefix: f0.prefix ?? "", suffix } };
  };
  const fits = (l: CounterLayout) => {
    const top = p.y + (p.h - l.h) / 2;
    const left = p.x; // the widest case: alignment never moves the number outside [x, x + w]
    const bleed = ctx.system.bleed?.includes(l.role) ?? false;
    return l.w <= p.w + 0.5 && l.h <= p.h + 0.5 && (bleed || textSafe(ctx, { x: left, y: top + l.padTop, w: l.w, h: l.lh }));
  };
  const candidates = p.role ? [p.role] : roles;
  for (const compact of [false, true]) {
    const m = make(compact);
    if (compact && m.f.suffix === (f0.suffix ?? "")) break; // too small to compact: nothing to gain
    for (const role of candidates) {
      const l = layoutAt(ctx, role, m.target, m.start, m.sign, m.f);
      if (fits(l)) return l;
    }
  }
  if (warn) console.warn(`counter ${p.id ?? "counter"}: the number does not fit its box at any role; drawn at ${candidates[candidates.length - 1]}`);
  const m = make(false);
  return layoutAt(ctx, candidates[candidates.length - 1]!, m.target, m.start, m.sign, m.f);
}

/** The digit of integer `v` in place `i` (0 = the last place). */
const digitOf = (v: number, i: number) => Math.floor(v / 10 ** i) % 10;

/**
 * The position of every place at roll progress u (0-1), as an absolute count: place i shows digit
 * (position mod 10). Positions only grow, and at u = 1 they are integers that spell the target.
 */
function positions(l: CounterLayout): (u: number) => number[] {
  const { target: T, start: S, cols } = l;
  const N = (i: number) => Math.floor(T / 10 ** i) - Math.floor(S / 10 ** i);
  let L = 0;
  while (L < cols - 1 && N(L) > CAP) L++;
  // Places right of L spin, each at least 1.3 times as fast as the place to its left.
  const spin: number[] = [];
  let left = N(L);
  for (let i = L - 1; i >= 0; i--) {
    const diff = (digitOf(T, i) - digitOf(S, i) + 10) % 10;
    let k = 1;
    while (diff + 10 * k < Math.max(left * 1.3, left + 3)) k++;
    spin[i] = diff + 10 * k;
    left = spin[i]!;
  }
  // Landing order, right to left: a spinning place lands before the place to its left is half way
  // into its last step. So when the left places read their final digits, the places to their right
  // already show theirs, and the reading never passes the target.
  const land: number[] = [];
  let half = N(L) > 0 ? 1 - 0.5 / N(L) : 1;
  for (let i = L - 1; i >= 0; i--) {
    land[i] = half;
    half = land[i]! * (1 - 0.5 / spin[i]!);
  }
  return (u: number) => {
    const pos: number[] = new Array(cols);
    pos[L] = Math.floor(S / 10 ** L) + N(L) * u;
    // A place turns over while the place to its right turns from 9 to 0.
    for (let i = L + 1; i < cols; i++) {
      const r = pos[i - 1]!;
      const m = r - 10 * Math.floor(r / 10);
      pos[i] = Math.floor(r / 10) + Math.max(0, m - 9);
    }
    for (let i = 0; i < L; i++) pos[i] = Math.floor(S / 10 ** i) + spin[i]! * Math.min(1, u / land[i]!);
    return pos;
  };
}

/** Drops keys that a straight line through their neighbours already gives. */
function compress(keys: Key[]): Key[] {
  const out: Key[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const prev = out[out.length - 1], next = keys[i + 1];
    if (prev && next && (k.curve ?? "linear") === "linear" && (next.curve ?? "linear") === "linear") {
      const a = out[out.length - 1]!;
      const v = a.v + ((next.v - a.v) * (k.t - a.t)) / (next.t - a.t);
      if (Math.abs(v - k.v) < 0.05) continue;
    }
    out.push(k);
  }
  return out;
}

/** Appends keys, dropping one that lands on the time of the key before it. */
function join(...parts: Key[][]): Key[] {
  const out: Key[] = [];
  for (const k of parts.flat()) {
    const last = out[out.length - 1];
    if (last && Math.abs(k.t - last.t) < 1e-6) { out[out.length - 1] = k; continue; }
    out.push(k);
  }
  return out;
}

/** The counter's nodes. Blocks that drive a counter pass their own roll start and length. */
export function counterNodes(p: CounterProps, ctx: Ctx, timing: RollTiming = {}, layout?: CounterLayout): Node[] {
  const id = p.id ?? "counter";
  const l = layout ?? counterLayout(p, ctx);
  if ((p.from ?? 0) > p.value) console.warn(`counter ${id}: a counter only counts up; it shows ${p.value} without a roll`);
  const role = l.role, color = p.color ?? "ink";
  const align = p.align ?? "left";
  const left = align === "left" ? p.x : align === "right" ? p.x + p.w - l.w : p.x + (p.w - l.w) / 2;
  // The line box: the figures' ink (cap or figure height to the baseline) centred in the box, not the line box.
  const top = centreInk(ctx, "0", role, { y: p.y, h: p.h });
  const out: Node[] = [];
  const exit = p.until;
  const zeros = (p.lead ?? "zeros") === "zeros";
  const rolls = !ctx.instant && l.start !== l.target;

  const rollAt = onFrame(timing.rollAt ?? p.at + Math.max(READ, ctx.dur.enter));
  let F = Math.max(1, Math.round((timing.rollDur ?? ctx.dur.move * 3) * FPS));
  // The roll ends by `until`: shorten it, or throw when too little roll is left.
  if (exit !== undefined && rolls && rollAt + F / FPS > exit + 1e-9) {
    const left = Math.floor((exit - rollAt) * FPS + 1e-6);
    if (left < 6) throw new Error(`counter ${id}: until ${exit} s leaves the roll (from ${rollAt.toFixed(2)} s) under 0.2 s; give until ${(rollAt + 6 / FPS).toFixed(2)} s or later, or an earlier rollAt`);
    F = left;
  }
  const rollEnd = rollAt + F / FPS;
  const curve: Curve = ctx.noOvershoot("move");
  const pos = positions(l);
  const raw = Array.from({ length: F + 1 }, (_, k) => pos(rolls ? ease(ctx.system, curve, k / F) : 1));
  // A place that moves more than half a digit in a frame shows whole digits. Every place only grows.
  const shown = raw.map((r) => r.slice());
  for (let k = 1; k <= F; k++) for (let c = 0; c < l.cols; c++) {
    const v = raw[k]![c]!, prev = shown[k - 1]![c]!;
    shown[k]![c] = Math.max(prev, v - raw[k - 1]![c]! > 0.5 ? Math.floor(v) : v);
  }
  const frames = shown.map((p, k) => ({ t: rollAt + k / FPS, pos: p }));
  const leaveAt = exit !== undefined ? Math.max(exit, ctx.instant ? exit : rollEnd) : undefined;

  // Entrance and exit for anything shown at rest: it rises out of its mask, and sinks above it at `until`.
  const enterReveal = (): Key[] => (ctx.instant ? [{ t: 0, v: 0 }] : go(ctx, p.at, 100, 0, "enter"));
  const exitReveal = (): Key[] => (leaveAt !== undefined ? go(ctx, leaveAt, 0, -100, "exit") : []);
  const offAt = leaveAt !== undefined ? leaveAt + (ctx.instant ? 0 : ctx.dur.exit) : undefined;
  // The opacity keys before the roll: on from frameOf(at) (from the start of the keys when `at` is before the
  // film, so the keys stay in time order), or off.
  const lead = (on: boolean): Key[] => {
    const t0 = Math.min(0, p.at, frames[0]?.t ?? 0);
    return on ? (p.at <= 0 ? [{ t: t0, v: 1 }] : [{ t: 0, v: 0 }, ...cut(p.at, 0, 1)]) : [{ t: t0, v: 0 }];
  };
  const still = (nid: string, text: string, x: number, w: number, c: ColorRole = color): Node => ({
    id: nid, kind: "text", x, y: top, text, role, color: c, mask: true, width: w, align: "center",
    tracks: { reveal: join(enterReveal(), exitReveal()), ...present(p.at, offAt) },
  });

  // How far each place has landed (0-1) at each frame, for the separator to its right.
  const land = new Map<number, number[]>();
  // A digit node: its reveal at each frame, from its nearest allowed position.
  const digitNode = (col: number, d: number, allowed: (a: number) => boolean, nid: string, c: ColorRole, x: number): Node | null => {
    const near = (q: number) => {
      const c0 = Math.round((q - d) / 10);
      let best = Number.NaN;
      for (let c = Math.max(0, c0 - 1); c <= c0 + 1; c++) {
        const a = d + 10 * c;
        if (allowed(a) && !(Math.abs(a - q) >= Math.abs(best - q))) best = a;
      }
      return Number.isNaN(best) ? (allowed(d) ? d : d + 10) : best;
    };
    const rev = (q: number) => Math.max(-100, Math.min(100, (near(q) - q) * 100));
    const vals = frames.map((f) => rev(f.pos[col]!));
    // A digit counts as shown only while its glyph can be inside the mask: from 85 % below to 70 %
    // above. Past that the mask hides all of it, so it is switched off and no check sees its box.
    const seen = vals.map((v) => v > -70 && v < 85);
    if (!seen.some(Boolean)) return null;
    const startShown = seen[0]!, endShown = seen[seen.length - 1]!;
    if (!rolls && !endShown) return null;
    const node: Node = { id: nid, kind: "text", x, y: top, text: String(d), role, color: c, mask: true, width: l.colW, align: "center" };
    if (!rolls) {
      node.tracks = { reveal: join(enterReveal(), exitReveal()), ...present(p.at, offAt) };
      return node;
    }
    // Reveal: the frame values, with a step where a hidden digit wraps from above to below.
    const roll: Key[] = [];
    vals.forEach((v, k) => {
      const t = frames[k]!.t;
      const prev = vals[k - 1];
      if (prev !== undefined && Math.abs(v - prev) > 150) roll.push({ t: t - 0.5 / FPS, v, curve: "step" });
      roll.push({ t, v, curve: "linear" });
    });
    // A roll that starts during the entrance brings the digits in itself: the start digit has no entrance of its own.
    const rollsIn = rollAt < p.at + (ctx.instant ? 0 : ctx.dur.enter) - 1e-9;
    const reveal = join(startShown && !rollsIn ? enterReveal() : [], compress(roll), endShown ? exitReveal() : []);
    // Opacity: a digit in flight shows at DIM, under the readable threshold, so only the start value
    // and the landed value read as text. The start digit dims as it leaves; the final digit brightens
    // as it lands.
    const lastOff = seen.lastIndexOf(false);
    const firstOff = seen.indexOf(false);
    const opAt = (k: number) => {
      if (!seen[k]) return 0;
      const atRest = 1 - Math.abs(vals[k]!) / 100;
      // A roll that starts on the entrance shows its start digit in flight (dimmed): it is motion, not a value to read.
      const inFirst = !rollsIn && startShown && (firstOff < 0 || k < firstOff);
      const inLast = endShown && k > lastOff;
      return inFirst || inLast ? DIM + (1 - DIM) * atRest : DIM;
    };
    if (endShown) land.set(col, frames.map((_, k) => (k > lastOff ? 1 - Math.abs(vals[k]!) / 100 : 0)));
    const op: Key[] = lead(startShown);
    op.push(...compress(frames.map((f, k) => ({ t: f.t, v: opAt(k), curve: "linear" as const }))));
    if (endShown && offAt !== undefined) op.push(...cut(offAt, 1, 0));
    node.tracks = { reveal, opacity: join(op) };
    return node;
  };

  for (const { g, x, w } of l.glyphs) {
    const gx = left + x;
    if (g.kind === "pre" || g.kind === "suf") { out.push(still(`${id}-${g.kind}`, g.text, gx, w)); continue; }
    if (g.kind === "dot") { out.push(still(`${id}-dot`, ".", gx, w)); continue; }
    if (g.kind === "sep") {
      // A separator never moves. It shows (in ink) once the place to its left counts; before that it
      // shows muted with the leading zeros, or not at all.
      const sig = (k: number) => Math.max(0, Math.min(1, frames[k]!.pos[g.col]!));
      const endSig = sig(frames.length - 1), startSig = sig(0);
      const fadeKeys = (val: (k: number) => number): Key[] =>
        compress(frames.map((f, k) => ({ t: f.t, v: val(k), curve: "linear" as const })));
      const make = (nid: string, c: ColorRole, val: (k: number) => number, endV: number, startV: number) => {
        const tr: Tracks = { reveal: join(startV > 0 ? enterReveal() : [{ t: 0, v: 0 }], endV > 0 ? exitReveal() : []) };
        if (!rolls) tr.opacity = present(p.at, offAt).opacity;
        else tr.opacity = join(lead(startV > 0), fadeKeys(val),
          endV > 0 && offAt !== undefined ? cut(offAt, val(frames.length - 1), 0) : []);
        out.push({ id: nid, kind: "text", x: gx, y: top, text: g.text, role, color: c, mask: true, width: w, align: "center", tracks: tr });
      };
      if (!rolls) { if (endSig > 0) make(`${id}-sep${g.col}`, color, () => 1, 1, 1); continue; }
      // The muted separator fades out before the ink one fades in, so the two never show at once.
      const out1 = (k: number) => Math.max(0, 1 - 2 * sig(k)), in1 = (k: number) => Math.max(0, 2 * sig(k) - 1);
      if (zeros && startSig < 1) make(`${id}-sep${g.col}-m`, "inkMuted", out1, 1 - endSig, 1 - startSig);
      // The ink separator is dimmed like the digits until the place to its left lands.
      const lit = (k: number) => DIM + (1 - DIM) * (land.get(g.col)?.[k] ?? 1);
      if (endSig > 0) make(`${id}-sep${g.col}`, color, (k) => (zeros ? in1(k) : sig(k)) * lit(k), endSig, startSig);
      continue;
    }
    if (g.kind !== "digit") continue;
    const col = g.col;
    // Places left of the decimal ones place can lead; their zero at position 0 is a leading zero.
    const leads = col > l.decimals;
    for (let d = 0; d <= 9; d++) {
      const n = digitNode(col, d, (a) => !(leads && a === 0), `${id}-c${col}-d${d}`, color, gx);
      if (n) out.push(n);
    }
    if (leads && zeros) {
      const n = digitNode(col, 0, (a) => a === 0, `${id}-c${col}-z`, "inkMuted", gx);
      if (n) out.push(n);
    }
  }
  return out;
}

export const counter: Block<CounterProps> = (p, ctx) =>
  counterNodes(p, ctx, { rollAt: p.rollAt ?? (p.at <= 0 ? p.at : frameOf(p.at) / FPS) }).map((n) => (n.kind === "audio" ? n : { ...n, group: n.group ?? `${p.id ?? "counter"}-digits` }));

/**
 * Like `lines` from the context, but each line rises on a curve that does not overshoot. In a system
 * whose entrance overshoots (Pop), a rising line would pass its rest position and reach into the line
 * above it. The numbers blocks set stacked labels with this.
 */
export function steadyLines(ctx: Ctx, o: Parameters<typeof lines>[1]): Node[] {
  return lines(ctx, o).map((n, i) => {
    if (ctx.instant) return n;
    const at = o.at + i * ctx.dur.stagger;
    const until = o.until !== undefined ? o.until + i * ctx.dur.stagger : undefined;
    const reveal = seq(go(ctx, at, 100, 0, ctx.noOvershoot("enter"), 1, "enter"), until !== undefined && go(ctx, until, 0, -100, "exit"));
    return { ...n, tracks: { ...n.tracks, reveal } };
  });
}
