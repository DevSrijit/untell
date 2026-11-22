// Waveform: waves drawn as lines in stacked lanes, for sound, signals and superposition.
//
// A lane is a sum of sines, the inverse of another lane, or the sum of other lanes. The block computes
// every lane point by point, so a sum lane is always the true sum of its parts. This shows
// interference and noise cancellation: a wave, its inverse, and their sum that flattens to a line.
//
// How waves move. The node model has transforms only, and a path has no clip. A translated path
// leaves the box, and a scaled path thins its stroke (a flat line at scaleY 0 has no height).
// So the block draws a flip book: it computes the exact path for every frame at 30 fps and keeps one
// path node per distinct shape. Each node is visible only on its own frames (opacity steps at half
// frames, so exactly one shape shows at any sample time). A travelling wave repeats, so its frames
// share nodes. The stroke weight never changes and nothing leaves the box.
//
// Rules this block enforces:
// - A title is required. It names what the lanes show.
// - All lanes share one amplitude scale, so a sum that doubles looks twice as tall. The scale comes
//   from the largest value in any frame, so no wave leaves its lane.
// - The key lane has the heaviest stroke and an ink label. Other lanes are thinner, with muted labels.
//   Weight and a direct label mark the key lane, so colour never carries the meaning alone.
// - Each lane label sits in its own row above the wave area. No wave can reach a label.
// - A change of amplitude (gain) uses a curve that never overshoots: an amplitude is a value.
// - In a one-frame system, waves do not travel and gains change in one frame.
import { appear, crisp, go, lines, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import { valueAt } from "../time";
import type { Block, Ctx, Key, Node } from "../types";
import { twoLines } from "./util";
import { GESTURES, tagParts } from "./hand";

/** One sine: amplitude `a` (relative), `k` cycles across the lane width, phase in turns (0 to 1). */
export type WavePart = { a: number; k: number; phase?: number };

export type WaveLane = {
  label: string;
  /** The lane's own shape: a sum of sines. */
  parts?: WavePart[];
  /** Or: the inverse of lane `invert` (its value times minus one, gain included). */
  invert?: number;
  /** Or: the sum of these lanes, point by point. */
  sum?: number[];
  /** Gain at the start (default 1). The lane shows its value times its gain. */
  gain?: number;
  /** Gain changes: at time `at`, the gain moves to `to`. */
  gains?: { at: number; to: number }[];
  /** The key lane: heaviest stroke and an ink label. */
  key?: boolean;
  /** A short note that appears at `at`: right of the label, or under it when the row is too narrow. */
  note?: { at: number; text: string };
  /** When the lane (label, baseline and line) appears. Default: the block's `at`, staggered. */
  at?: number;
  /** For a travelling lane with parts: when its wave front enters at the left edge. Default: the lane's `at`. */
  enter?: number;
};

export type WaveformProps = {
  id?: string;
  /** The block's box in px: title, lanes and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  lanes: WaveLane[];
  /**
   * Waves travel to the right. `speed` is in wavelengths of the longest part per second. With every
   * `k` a multiple of the smallest `k`, the shape repeats after one such wavelength. `until` is when
   * the travel starts to stop (a constant deceleration over the system's move duration).
   */
  travel?: { speed: number; until: number };
  /** A short label under the last lane, at the right, for the horizontal axis. */
  xLabel?: string;
  at: number;
  until?: number;
};

const FPS = 30;

export const waveform: Block<WaveformProps> = (p, ctx) => tagParts(drawWaveform(p, ctx), p.id ?? "wave", GESTURES.waveform!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawWaveform: Block<WaveformProps> = (p, ctx) => {
  const id = p.id ?? "wave";
  const n = p.lanes.length;
  const out: Node[] = [];
  const exit = p.until;
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");

  // Layout, top to bottom: title, then for each lane a label row and a wave area, then the x label.
  const titleLines = ctx.measure(p.title, "label") <= p.w ? [p.title] : (twoLines(p.title) ?? [p.title]);
  const titleH = lhL * (titleLines.length + 0.9);
  const roleOf = (l: WaveLane) => (l.key ? "caption" : "label") as "caption" | "label";
  const gap = sL * 0.6;
  const laneGap = sL * 1.2, labelGap = sL * 0.35;
  const xLabelH = p.xLabel ? lhL + sL * 0.6 : 0;
  const x0 = p.x, W = p.w;
  // A note that does not fit beside its label goes to a second line in the same row. The room depends
  // on the row's height (the low band at 9:16 is narrower), so the layout settles in two passes.
  let rowLines = p.lanes.map(() => 1);
  let rowH = 0, waveH = 0;
  const laneTop = (i: number) => p.y + titleH + i * (rowH + labelGap + waveH + laneGap);
  for (let pass = 0; pass < 2; pass++) {
    rowH = Math.max(lhL, lhC) * Math.max(...rowLines);
    waveH = (p.h - titleH - n * (rowH + labelGap) - (n - 1) * laneGap - xLabelH) / n;
    rowLines = p.lanes.map((l, i) => {
      if (!l.note) return 1;
      const right = Math.min(x0 + W, textRight(ctx, laneTop(i), Math.max(lhL, lhC)));
      return x0 + ctx.measure(l.label, roleOf(l)) + gap * 2 + ctx.measure(l.note.text, "label") <= right ? 1 : 2;
    });
  }
  rowH = Math.max(lhL, lhC) * Math.max(...rowLines);
  waveH = (p.h - titleH - n * (rowH + labelGap) - (n - 1) * laneGap - xLabelH) / n;
  const strokeKey = ctx.stroke * 3, strokeCtx = ctx.stroke * 1.5;
  const midY = (i: number) => laneTop(i) + rowH + labelGap + waveH / 2;

  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: p.at, until: exit }));

  // Timing of each lane.
  const laneAt = p.lanes.map((l, i) => l.at ?? p.at + ctx.dur.enter + i * ctx.dur.stagger * 2);
  const travelling = !!p.travel && p.travel.speed > 0 && !ctx.instant;
  const kMin = Math.min(...p.lanes.flatMap((l) => (l.parts ?? []).map((q) => q.k)).filter((k) => k > 0), Infinity);
  const v = travelling && Number.isFinite(kMin) ? (p.travel!.speed * W) / kMin : 0; // px per second
  const stopAt = p.travel?.until ?? 0, stopFor = ctx.dur.move;
  const ramp = Number.isFinite(kMin) ? W / kMin / 2 : W / 4;
  // Distance travelled since time 0: constant speed, then a constant deceleration to rest.
  const dist = (t: number) => {
    if (!travelling) return 0;
    if (t <= stopAt) return v * t;
    const tau = Math.min(t - stopAt, stopFor);
    return v * stopAt + v * (tau - (tau * tau) / (2 * stopFor));
  };
  const gainKeys = p.lanes.map((l): Key[] => {
    let g = l.gain ?? 1;
    const keys: Key[] = [{ t: 0, v: g }];
    for (const c of [...(l.gains ?? [])].sort((a, b) => a.at - b.at)) {
      keys.push(...go(ctx, c.at, g, c.to, ctx.noOvershoot("move"), 2, "move"));
      g = c.to;
    }
    return keys;
  });
  const gainAt = (i: number, t: number) => valueAt(ctx.system, gainKeys[i], "scaleY", t);
  // How visible a lane's line is at time t: it fades in at the lane's time and out at `until`.
  const alphaKeys = p.lanes.map((_, i): Key[] => [...go(ctx, laneAt[i]!, 0, 1, "enter"), ...(exit !== undefined ? go(ctx, exit, 1, 0, "exit") : [])]);
  const alphaAt = (i: number, t: number) => (t < laneAt[i]! ? 0 : valueAt(ctx.system, alphaKeys[i], "opacity", t));

  // Sample positions across the lane, about every 3 px.
  const steps = Math.max(24, Math.ceil(W / 3));
  const xs = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * W);

  // A lane's shown value at x (px from the left edge) and time t, gain included.
  const shape = (parts: WavePart[], u: number) => parts.reduce((s, q) => s + q.a * Math.sin(2 * Math.PI * ((q.k * u) / W + (q.phase ?? 0))), 0);
  const frontOf = (i: number, t: number) => {
    const l = p.lanes[i]!;
    const enter = l.enter ?? laneAt[i]!;
    return t < enter ? -1 : dist(t) - dist(enter);
  };
  const valueOf = (i: number, x: number, t: number, depth = 0): number => {
    if (depth > n) throw new Error(`waveform ${id}: lanes refer to each other in a loop`);
    const l = p.lanes[i]!;
    let raw = 0;
    if (l.parts) {
      if (!travelling) raw = shape(l.parts, x);
      else {
        const front = frontOf(i, t);
        // The wave train starts smoothly: its first half wavelength fades in, so the front has no step.
        const e = Math.max(0, Math.min(1, (front - x) / ramp));
        raw = x <= front ? shape(l.parts, x - front) * e * e * (3 - 2 * e) : 0;
      }
    } else if (l.invert !== undefined) raw = -valueOf(l.invert, x, t, depth + 1);
    else if (l.sum) raw = l.sum.reduce((s, j) => s + valueOf(j, x, t, depth + 1), 0);
    return raw * gainAt(i, t);
  };

  // The frames the flip book covers: from the first lane to the last change.
  const ends = [
    ...laneAt.map((a) => a + ctx.dur.enter),
    ...p.lanes.flatMap((l) => (l.gains ?? []).map((c) => c.at + ctx.dur.move * 2)),
    ...(travelling ? [stopAt + stopFor] : []),
    ...(exit !== undefined ? [exit + ctx.dur.exit] : []),
  ];
  const f0 = Math.floor(Math.min(...laneAt) * FPS);
  const f1 = Math.ceil(Math.max(...ends) * FPS) + 1;

  // Pass 1: every value in every frame, for the shared amplitude scale.
  const values: number[][][] = p.lanes.map(() => []);
  let peak = 0;
  for (let f = f0; f <= f1; f++) {
    const t = f / FPS;
    for (let i = 0; i < n; i++) {
      const row = xs.map((x) => valueOf(i, x, t));
      values[i]!.push(row);
      for (const y of row) peak = Math.max(peak, Math.abs(y));
    }
  }
  const amp = (waveH / 2 - strokeKey / 2 - 2) / (peak || 1);
  const r4 = (q: number) => Math.round(q * 4) / 4;

  // Pass 2: one path per distinct shape, with the frames it shows on.
  const seriesOrder: ColorRole[] = ["series2", "series3", "series4", "series5"];
  let ctxIndex = 0;
  p.lanes.forEach((l, i) => {
    const color: ColorRole = l.key ? "series1" : seriesOrder[Math.min(3, ctxIndex++)]!;
    const width = l.key ? strokeKey : strokeCtx;
    const cy = midY(i);
    const top = laneTop(i);
    const at = laneAt[i]!;
    // An anchor per lane, `<id>-lane:<n>`: the wave area; data.mid is the zero line and data.amp the px
    // for one unit of the signal, so a scene can find any point: y = mid - value * amp.
    out.push({ id: `${id}-lane:${i}`, kind: "anchor", x: x0, y: cy - waveH / 2, w: W, h: waveH, at, data: { mid: cy, amp } });

    // Baseline: the zero line of the lane, a hairline.
    // A hairline sits on the pixel grid (crisp): a 1 px line on a whole px covers two rows at part strength.
    const bw = Math.max(1, Math.round(ctx.stroke * 0.5));
    out.push({ id: `${id}-base-${i}`, kind: "path", d: `M${px(x0)} ${crisp(cy, bw)}H${px(x0 + W)}`, stroke: "rule", width: bw,
      tracks: { draw: go(ctx, at, 0, 1, "move"), ...appear(ctx, at, exit, 0) } });

    // Label row: the label at the left, the note at the right (or on a second line).
    const role = roleOf(l);
    const lh = ctx.lineHeight(role);
    const labelBox = { x: x0, y: top, w: ctx.measure(l.label, role), h: lh };
    if (!textSafe(ctx, labelBox)) console.warn(`waveform ${id}: lane ${i} label is outside the text-safe area`);
    out.push({ id: `${id}-label-${i}`, kind: "text", x: x0, y: top, text: l.label, role, color: l.key ? "ink" : "inkMuted",
      tracks: appear(ctx, at + ctx.dur.stagger, exit, 0) });
    if (l.note && (exit === undefined || l.note.at < exit)) {
      const nw = ctx.measure(l.note.text, "label");
      // Beside the label, the note shares its baseline (about 0.35 of a size below the line-box middle).
      const ny = rowLines[i] === 2 ? top + lh : top + lh / 2 + ctx.size(role) * 0.35 - lhL / 2 - sL * 0.35;
      // Beside the label, the note sits at the right. On its own line, it sits under the label.
      const right = Math.min(x0 + W, textRight(ctx, ny, lhL));
      const nb = { x: rowLines[i] === 2 ? x0 : right - nw, y: ny, w: nw, h: lhL };
      if (!textSafe(ctx, nb) || (rowLines[i] === 1 && nb.x < labelBox.x + labelBox.w + gap)) console.warn(`waveform ${id}: lane ${i} note does not fit`);
      else out.push({ id: `${id}-note-${i}`, kind: "text", x: nb.x, y: nb.y, text: l.note.text, role: "label", color: l.key ? "ink" : "inkMuted",
        tracks: appear(ctx, l.note.at, exit) });
    }

    // The line itself: a flip book of exact shapes.
    const shapes = new Map<string, [number, number][]>();
    values[i]!.forEach((row, k) => {
      const f = f0 + k;
      const a = alphaAt(i, f / FPS);
      if (a <= 0.001) return;
      let d = "";
      const front = travelling && l.parts ? frontOf(i, f / FPS) : W;
      for (let j = 0; j < xs.length; j++) {
        const x = xs[j]!;
        if (x > front) {
          // Past the wave front the air is still: the line runs flat to the right edge.
          d += `${j ? "L" : "M"}${r4(x0 + Math.max(0, front))} ${r4(cy)}H${r4(x0 + W)}`;
          break;
        }
        d += `${j ? "L" : "M"}${r4(x0 + x)} ${r4(cy - row[j]! * amp)}`;
      }
      const list = shapes.get(d) ?? [];
      list.push([f, Math.round(a * 1000) / 1000]);
      shapes.set(d, list);
    });
    let s = 0;
    for (const [d, frames] of shapes) {
      out.push({ id: `${id}-w${i}-${s++}`, kind: "path", d, stroke: color, width, cap: "butt", join: "round", z: l.key ? 2 : 1,
        tracks: { opacity: flipKeys(frames, f1) } });
    }
  });

  if (p.xLabel) {
    const xw = ctx.measure(p.xLabel, "label");
    const yy = midY(n - 1) + waveH / 2 + sL * 0.6;
    const right = Math.min(x0 + W, textRight(ctx, yy, lhL));
    out.push({ id: `${id}-xlabel`, kind: "text", x: right - xw, y: yy, text: p.xLabel, role: "label", color: "inkMuted",
      tracks: appear(ctx, p.at + ctx.dur.enter, exit, 0) });
  }
  return out;
};

/** The right edge that text at this height may reach: the safe area, and the low band at 9:16. */
function textRight(ctx: Ctx, y: number, h: number) {
  return y + h > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right;
}

/**
 * Opacity keys that show a node on the given frames (with the given opacity) and hide it on all others.
 * A node that shows on the last frame stays visible after it.
 *
 * Each change is a short step that ends at a half frame. The step segment lasts only half a frame,
 * because the renderers jump at different points of a step segment: Remotion at its end, GSAP's
 * steps(1) at its middle. Over half a frame, both jumps fall between the same two whole frames, so
 * a renderer that samples whole frames sees exactly one shape.
 */
function flipKeys(frames: [number, number][], last: number): Key[] {
  const keys: Key[] = [{ t: 0, v: 0 }];
  let cur = 0;
  const step = (t: number, v: number) => {
    if (t <= 1 / FPS) { keys[0] = { t: 0, v }; cur = v; return; }
    keys.push({ t: t - 1 / (2 * FPS), v: cur }, { t, v, curve: "step" });
    cur = v;
  };
  frames.forEach(([f, a], i) => {
    if (a !== cur) step((f - 0.5) / FPS, a);
    const next = frames[i + 1];
    if ((!next || next[0] !== f + 1) && f !== last) step((f + 0.5) / FPS, 0);
  });
  return keys;
}
