// Cycle: steps around a loop, joined by curved arrows, with the active step lit in turn. Use it for a
// process that returns to its start: the water cycle, a feedback loop, a build-test-learn loop.
// Each step may carry a note, shown beside or below the loop while that step is active.
//
// Rules this block enforces:
// - Steps sit on a circle, clockwise from the top. When the box is tall (9:16), the circle stretches to
//   an upright ellipse, so the arrows between steps stay long enough to read.
// - Arrows follow the loop and end with an arrowhead along it. They start and stop a small gap
//   outside each box, so no line touches a label.
// - The active step is lit: an accent fill and onAccent text, and the arrow into it lit at a heavier
//   weight. One step is lit at a time, so weight and fill carry the meaning where accent equals ink.
// - The first lap builds the loop: each arrow draws into the next step as it becomes active. After the
//   last step, the loop closes and the first step lights again.
// - Notes sit beside the loop in a wide box and below it in a tall one. Each note leaves before the
//   next enters.
// - Every text box passes textSafe. When one does not, the block narrows and lays out again.
import { appear, go, lines as maskLines, px, cut } from "../context";
import type { Block, Ctx, Key, Node } from "../types";
import { arrowHead, arrowSize, audit, fadeKeys, nodeBox, titleOf, weights, widest, wrap, type Pt } from "./flow";
import type { Box } from "./util";
import { GESTURES, tagParts } from "./hand";

export type CycleProps = {
  id?: string;
  /** The block's box in px: title, loop and notes stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  /** Three to six steps, in order around the loop. */
  steps: { label: string; note?: string }[];
  at: number;
  /** Seconds each step stays active. Default: four move durations. */
  every?: number;
  /** How many times the light goes around (default 1). It always ends back on the first step. */
  laps?: number;
  until?: number;
};

type Laid = { out: Node[]; problems: string[] };

function compose(p: CycleProps, ctx: Ctx, inset: number): Laid {
  const id = p.id ?? "cycle";
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  const W = p.w - inset;
  const out: Node[] = [];
  const problems: string[] = [];
  const exit = p.until;
  const wt = weights(ctx);
  const { len: aLen, half: aHalf } = arrowSize(ctx);
  const n = p.steps.length;
  if (n < 3) throw new Error(`cycle ${id}: a loop needs three steps or more`);

  const title = titleOf(ctx, id, p.title, p.x, p.y, W, p.at, exit);
  out.push(...title.nodes);
  const area = { x: p.x, y: p.y + title.h, w: W, h: p.h - title.h };

  // Notes beside the loop when the area is wide, else below it.
  const hasNotes = p.steps.some((s) => s.note);
  const side = hasNotes && area.w > area.h * 1.25;
  // Notes below the loop sit low in a tall frame: they wrap to end before the platform's side buttons.
  const noteW = side ? area.w * 0.38 : Math.min(area.w, ctx.safe.lowBandRight - area.x);
  const notes = p.steps.map((s) => (s.note ? wrap(ctx, s.note, "caption", noteW, 4) ?? (problems.push(`note "${s.note}" does not fit`), [s.note]) : []));
  const noteN = Math.max(0, ...notes.map((l) => l.length));
  const noteH = noteN * lhC;
  const loop: Box = side ? { x: area.x, y: area.y, w: area.w - noteW - sL * 2, h: area.h }
    : { x: area.x, y: area.y, w: area.w, h: area.h - (hasNotes ? noteH + sL * 1.2 : 0) };

  // Node size from the widest label; a label wraps when the loop is narrow.
  const padX = sL * 0.7, padY = sL * 0.45;
  let labels = p.steps.map((s) => [s.label]);
  const lim = loop.w * 0.42 - 2 * padX;
  if (widest(ctx, p.steps.map((s) => s.label), "label") > lim) labels = p.steps.map((s) => wrap(ctx, s.label, "label", lim, 2) ?? [s.label]);
  const nodeW = Math.max(...labels.map((l) => widest(ctx, l, "label"))) + 2 * padX;
  const nodeH = Math.max(...labels.map((l) => l.length)) * lhL + 2 * padY;

  // The loop: a circle when it leaves arrows long enough, else an upright or wide ellipse.
  const ang = p.steps.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  const maxCos = Math.max(...ang.map((a) => Math.abs(Math.cos(a)))), maxSin = Math.max(...ang.map((a) => Math.abs(Math.sin(a))));
  const rxMax = (loop.w - nodeW) / 2 / maxCos, ryMax = (loop.h - nodeH) / 2 / maxSin;
  const cx = loop.x + loop.w / 2;
  // Centre the loop's real extent (the top and bottom steps need not be symmetric for odd counts).
  const minSin = Math.min(...ang.map(Math.sin)), topSin = Math.max(...ang.map(Math.sin));
  const gap = sL * 0.4;
  const minArc = aLen * 2.5 + sL;
  const P = (rx: number, ry: number, cy: number, t: number): Pt => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  const boxAt = (rx: number, ry: number, cy: number, i: number): Box => { const [x, y] = P(rx, ry, cy, ang[i]!); return { x: x - nodeW / 2, y: y - nodeH / 2, w: nodeW, h: nodeH }; };
  const inside = (b: Box, q: Pt, d: number) => q[0] > b.x - d && q[0] < b.x + b.w + d && q[1] > b.y - d && q[1] < b.y + b.h + d;
  // An arc from step i to step i+1: where it leaves the first box and enters the next one.
  const arcOf = (rx: number, ry: number, cy: number, i: number) => {
    const a0 = ang[i]!, a1 = ang[i]! + (2 * Math.PI) / n;
    const b0 = boxAt(rx, ry, cy, i), b1 = boxAt(rx, ry, cy, (i + 1) % n);
    let ts = a0, te = a1;
    while (ts < a1 && inside(b0, P(rx, ry, cy, ts), gap)) ts += 0.002;
    while (te > ts && inside(b1, P(rx, ry, cy, te), gap)) te -= 0.002;
    let tb = te;
    while (tb > ts && Math.hypot(P(rx, ry, cy, tb)[0] - P(rx, ry, cy, te)[0], P(rx, ry, cy, tb)[1] - P(rx, ry, cy, te)[1]) < aLen * 0.9) tb -= 0.002;
    let len = 0;
    for (let t = ts; t < te; t += 0.01) len += Math.hypot(rx * Math.sin(t), ry * Math.cos(t)) * 0.01;
    return { ts, te, tb, len };
  };
  const tryShape = (rx: number, ry: number) => {
    const cy = loop.y + loop.h / 2 - (ry * (minSin + topSin)) / 2;
    const arcs = ang.map((_, i) => arcOf(rx, ry, cy, i));
    return { rx, ry, cy, arcs, ok: arcs.every((a) => a.len >= minArc) };
  };
  const R = Math.min(rxMax, ryMax);
  // Steps on the left and the right keep a gap between them: in a short loop the circle widens to an ellipse, so
  // two side boxes never touch (Primary's water cycle had COLLECTION and CONDENSATION edge to edge).
  const rxMin = Math.min(rxMax, nodeW / 2 + sL * 0.8);
  let shape = tryShape(Math.max(R, rxMin), R);
  if (!shape.ok) shape = tryShape(Math.max(Math.min(rxMax, ryMax * 2), rxMin), Math.min(ryMax, rxMax * 2));
  if (!shape.ok) problems.push("the arrows between steps are too short");
  if (R <= 0) problems.push("the loop has no room");
  const { rx, ry, cy, arcs } = shape;
  const boxes = ang.map((_, i) => boxAt(rx, ry, cy, i));

  // Timing: step k (over all laps) is active from T(k). The arrow into it draws just before.
  const laps = Math.max(1, Math.round(p.laps ?? 1));
  const every = p.every ?? ctx.dur.move * 4;
  // The loop starts after the title's entrance, or at `at` when there is no title, so the block changes on frameOf(at).
  const start = p.at + (p.title ? ctx.dur.enter : 0);
  const T = (k: number) => start + k * every;
  const total = n * laps; // the last k returns to step 0
  const drawn = ctx.noOvershoot("move");
  const arcDur = ctx.instant ? 1 / 30 : ctx.dur.move;
  const lit: [number, number | undefined][][] = p.steps.map(() => []);
  for (let k = 0; k <= total; k++) lit[k % n]!.push([T(k), k === total ? exit : T(k + 1)]);

  // Arcs.
  const lineSets: Pt[][] = [];
  arcs.forEach((a, i) => {
    const s = P(rx, ry, cy, a.ts), b = P(rx, ry, cy, a.tb), tip = P(rx, ry, cy, a.te);
    const large = a.tb - a.ts > Math.PI ? 1 : 0;
    const d = `M${px(s[0])} ${px(s[1])}A${px(rx)} ${px(ry)} 0 ${large} 1 ${px(b[0])} ${px(b[1])}`;
    const head = arrowHead(tip, b, aLen, aHalf);
    // The first time the arrow into step i+1 draws is step k = i+1 of the first lap.
    const firstK = i + 1;
    const drawAt = T(firstK) - arcDur;
    out.push({ id: `${id}-a${i}`, kind: "path", d, stroke: "inkMuted", width: wt.base, cap: "butt",
      tracks: { draw: go(ctx, drawAt, 0, 1, drawn, 1, "move"), ...appear(ctx, drawAt, exit, 0) } });
    out.push({ id: `${id}-a${i}-head`, kind: "path", d: head, fill: "inkMuted", tracks: appear(ctx, T(firstK) - (ctx.instant ? 0 : ctx.dur.enter * 0.3), exit, 0) });
    // The lit copy: it draws each time the light passes along this arrow and holds while step i+1 is active.
    const ks: number[] = [];
    for (let k = firstK; k <= total; k += n) ks.push(k);
    const draw: Key[] = [];
    const on: [number, number | undefined][] = [];
    ks.forEach((k) => {
      const t = T(k) - arcDur;
      draw.push(...(ctx.instant ? cut(t, 0, 1) : go(ctx, t, 0, 1, drawn, 1, "move")));
      on.push([t, k === total ? exit : T(k + 1)]);
    });
    out.push({ id: `${id}-a${i}-lit`, kind: "path", d, stroke: "accent", width: wt.lit, cap: "butt", z: 2, tracks: { draw, opacity: fadeKeys(ctx, on, on[0]![0], exit) } });
    out.push({ id: `${id}-a${i}-lithead`, kind: "path", d: arrowHead(tip, b, aLen * 1.1, aHalf * 1.1), fill: "accent", z: 3,
      tracks: { opacity: fadeKeys(ctx, on.map(([t, e]) => [t + arcDur * 0.85, e] as [number, number | undefined]), on[0]![0] + arcDur * 0.85, exit) } });
    const pts: Pt[] = [];
    for (let t = a.ts; t <= a.te; t += 0.01) pts.push(P(rx, ry, cy, t));
    lineSets.push(pts);
    // No arc may pass through a box other than its own two.
    if (pts.some((q) => boxes.some((bx, j) => j !== i && j !== (i + 1) % n && inside(bx, q, 0)))) problems.push(`arrow ${i} passes through a step`);
  });

  // Steps: each enters when it is first active.
  p.steps.forEach((_, i) => {
    const b = boxes[i]!;
    out.push(...nodeBox(ctx, { id: `${id}-s${i}`, x: b.x, y: b.y, w: b.w, h: b.h, lines: labels[i]!, role: "label", at: T(i), until: exit, lit: lit[i]! }));
  });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    if (a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap) problems.push(`steps ${i} and ${j} touch`);
  }

  // Notes: the active step's note, beside or below the loop.
  const noteX = side ? area.x + area.w - noteW : area.x;
  const loopBottom = Math.max(...boxes.map((b) => b.y + b.h));
  const noteY = side ? cy - noteH / 2 : loopBottom + sL * 1.2;
  for (let k = 0; k <= total; k++) {
    const ls = notes[k % n]!;
    if (!ls.length) continue;
    const until = k === total ? exit : T(k + 1) - (ctx.instant ? 1 / 30 : ctx.dur.exit) - ctx.dur.stagger * Math.max(0, ls.length - 1) - ctx.dur.stagger;
    out.push(...maskLines(ctx, { id: `${id}-note${k}`, x: px(noteX), y: px(noteY), lines: ls, role: "caption", color: "ink", at: T(k) + ctx.dur.stagger, until }));
  }

  problems.push(...audit(ctx, out, lineSets));
  return { out, problems };
}

/**
 * Lays the loop out on the full box first. When a text box leaves the text-safe area, it lays out
 * again on a narrower box. The first layout with no problem wins.
 */
export const cycle: Block<CycleProps> = (p, ctx) => tagParts(drawCycle(p, ctx), p.id ?? "cycle", GESTURES.cycle!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawCycle: Block<CycleProps> = (p, ctx) => {
  let best: Laid | null = null;
  for (const f of [0, 0.05, 0.1, 0.15, 0.2]) {
    const r = compose(p, ctx, p.w * f);
    if (!r.problems.length) return r.out;
    if (!best || r.problems.length < best.problems.length) best = r;
  }
  console.warn(`cycle ${p.id ?? "cycle"}: ${best!.problems.join("; ")}`);
  return best!.out;
};
