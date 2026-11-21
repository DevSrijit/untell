// Sequence: who sends what to whom, in time order. Actors stand across the top; a lifeline runs down
// from each; every message is an arrow from one lifeline to another, numbered, with its label above.
// Use it for a handshake (TLS), a request and its reply, an API call chain. A note can span lifelines
// to say what is true at that point ("keys agreed").
//
// Rules this block enforces:
// - Time runs down. Messages appear one after another, each `every` seconds (or at their own `at`).
// - The current message is the key one: its arrow is accent and heavy, its number is accent text and
//   its label is ink. When the next step starts, the arrow drops to a thin muted line and the label
//   turns muted. Weight carries the meaning where the accent equals the ink.
// - A label sits in the gap next to the sender, between two lifelines, so it never crosses a line.
//   A long label wraps to up to three lines; the gap widens first when the box has room.
// - Actor boxes take their size from their measured labels. Lifelines are dashed and drawn in.
// - Rows share the height: when they do not fit, the gaps between rows shrink before anything else.
// - Every text box passes textSafe. When one does not, the block narrows and lays out again.
import { appear, crisp, go, px } from "../context";
import type { Block, Ctx, Node } from "../types";
import { arrowHead, arrowSize, audit, fadeKeys, nodeBox, swapText, titleOf, weights, widest, wrap, type Pt } from "./flow";
import type { Box } from "./util";
import { GESTURES, tagParts, textSafeBox } from "./hand";

export type SequenceStep =
  /** A message from one actor to another. `label` names what is sent. */
  | { from: string; to: string; label: string; at?: number }
  /** A note over one actor or across two: a short sentence about the state at that point. */
  | { note: string; over: string | [string, string]; at?: number };

export type SequenceProps = {
  id?: string;
  /** The block's box in px: title, actors, lifelines and every label stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  /** Two to four actors, left to right. `id` is how steps name them. */
  actors: { id: string; label: string }[];
  steps: SequenceStep[];
  at: number;
  /** Seconds between steps. Default: three move durations. */
  every?: number;
  until?: number;
};

type Laid = { out: Node[]; problems: string[] };

function compose(p: SequenceProps, ctx: Ctx, inset: number): Laid {
  const id = p.id ?? "seq";
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  const W = p.w - inset;
  const out: Node[] = [];
  const problems: string[] = [];
  const lineSets: Pt[][] = [];
  const covers: Box[] = [];
  const exit = p.until;
  const { len: aLen, half: aHalf } = arrowSize(ctx);
  const wt = weights(ctx);
  const n = p.actors.length;
  const idx = (a: string) => {
    const i = p.actors.findIndex((x) => x.id === a);
    if (i < 0) throw new Error(`sequence ${id}: no actor "${a}"`);
    return i;
  };

  // Title.
  const title = titleOf(ctx, id, p.title, p.x, p.y, W, p.at, exit);
  out.push(...title.nodes);
  const top = p.y + title.h;

  // Actor boxes: one size for all, from the widest label.
  const padX = sL * 0.7, padY = sL * 0.45, gapMin = sL * 1.2;
  let actorLines = p.actors.map((a) => [a.label]);
  let boxW = widest(ctx, p.actors.map((a) => a.label), "label") + 2 * padX;
  if (n * boxW + (n - 1) * gapMin > W) {
    const lim = (W - (n - 1) * gapMin) / n - 2 * padX;
    actorLines = p.actors.map((a) => wrap(ctx, a.label, "label", lim, 2) ?? [a.label]);
    boxW = Math.max(...actorLines.map((ls) => widest(ctx, ls, "label"))) + 2 * padX;
  }
  const rowsA = Math.max(...actorLines.map((l) => l.length));
  const boxH = rowsA * lhL + 2 * padY;

  // Numbers and the room each message label needs in the gap next to its sender.
  const msgs = p.steps.map((s, i) => ({ s, i })).filter((m): m is { s: Extract<SequenceStep, { from: string }>; i: number } => "from" in m.s);
  const numOf = new Map(msgs.map((m, k) => [m.i, String(k + 1)]));
  const numW = widest(ctx, [...numOf.values()], "label");
  const gapN = sL * 0.45, m = sL * 0.6;
  // Numbers sit in a gutter left of the first lifeline when it has room, like line numbers;
  // else they sit before each label.
  const gutter = boxW / 2 >= numW + m;
  const numRoom = gutter ? 0 : numW + gapN;
  const oneLine = Math.max(0, ...msgs.map((x) => ctx.measure(x.s.label, "label"))) + numRoom + 2 * m;
  const maxSpan = n > 1 ? (W - boxW) / (n - 1) : 0;
  const span = n > 1 ? Math.min(maxSpan, Math.max(boxW + gapMin, oneLine)) : 0;
  const x0 = p.x + (W - (span * (n - 1) + boxW)) / 2 + boxW / 2;
  const X = (i: number) => x0 + i * span;
  const labelMax = span - 2 * m - numRoom;

  // Rows: measure each step first, then share the height out.
  // A label sits `lift` px above its arrow; rows sit at least `least` px apart, so each label
  // is much nearer its own arrow than the arrow above it.
  const lift = sL * 0.3;
  type Row = { kind: "msg"; lines: string[]; h: number } | { kind: "note"; lines: string[]; h: number; x: number; w: number };
  const padN = sL * 0.5;
  const rows: Row[] = p.steps.map((s) => {
    if ("from" in s) {
      const ls = wrap(ctx, s.label, "label", labelMax, 3) ?? (problems.push(`label "${s.label}" does not fit`), [s.label]);
      return { kind: "msg", lines: ls, h: ls.length * lhL + lift };
    }
    const [a, b] = Array.isArray(s.over) ? [idx(s.over[0]), idx(s.over[1])] : [idx(s.over), idx(s.over)];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const reach = Math.min(boxW / 2, sL * 1.4);
    let nx = X(lo) - reach, nw = X(hi) - X(lo) + 2 * reach;
    const lim = (lo === hi ? Math.min(W, span) : nw) - 2 * padX;
    const ls = wrap(ctx, s.note, "caption", lim, 3) ?? (problems.push(`note "${s.note}" does not fit`), [s.note]);
    if (lo === hi) { nw = widest(ctx, ls, "caption") + 2 * padX; nx = Math.min(Math.max(X(lo) - nw / 2, p.x), p.x + W - nw); }
    return { kind: "note", lines: ls, h: ls.length * lhC + 2 * padN, x: nx, w: nw };
  });
  const headGap = sL * 0.9, tail = sL * 0.8;
  const fixed = boxH + headGap + rows.reduce((s, r) => s + r.h, 0) + tail;
  const room = p.y + p.h - top - fixed;
  const ideal = sL * 1.3, least = sL * 0.8;
  const rowGap = rows.length > 1 ? Math.max(least, Math.min(ideal, room / (rows.length - 1))) : 0;

  // Rows top to bottom. When a step would end below the box, the rows scroll up to make room:
  // offset[i] is how far the rows have moved up when step i enters.
  const rowsTop = top + boxH + headGap, bottom = p.y + p.h - tail;
  let y = rowsTop;
  const ys: number[] = [];
  rows.forEach((r) => { ys.push(y); y += r.h + rowGap; });
  const offset: number[] = [];
  rows.forEach((r, i) => offset.push(Math.max(i ? offset[i - 1]! : 0, ys[i]! + r.h - bottom)));
  if (rows.some((r) => r.h > bottom - rowsTop)) problems.push("a step is taller than the box");

  // Timing. A step that needs a scroll waits for it: rows that leave the top fade out first,
  // then the rest move up, then the step enters in the room this made.
  const t0 = p.at;
  const stg = ctx.dur.stagger;
  const firstStep = t0 + n * stg + ctx.dur.enter + ctx.dur.move;
  const every = p.every ?? ctx.dur.move * 3;
  const drawn = ctx.noOvershoot("move");
  const times: number[] = [], scrollAt: (number | undefined)[] = [], fadeAt: (number | undefined)[] = [];
  const f1 = 1 / 30;
  p.steps.forEach((s, i) => {
    const base = s.at ?? (i ? times[i - 1]! + every : firstStep);
    if (i && offset[i]! > offset[i - 1]!) {
      const fa = ctx.instant ? base - 2 * f1 : Math.max(base - ctx.dur.move - ctx.dur.exit, times[i - 1]! + ctx.dur.move);
      const sa = ctx.instant ? base - f1 : fa + ctx.dur.exit;
      fadeAt.push(fa); scrollAt.push(sa);
      times.push(ctx.instant ? base : Math.max(base, sa + ctx.dur.move * 0.7));
    } else { fadeAt.push(undefined); scrollAt.push(undefined); times.push(base); }
  });
  // When each row leaves (its top would pass the actor row), and its y keys for the scroll.
  const leaves = rows.map((_, j) => {
    for (let k = j + 1; k < rows.length; k++) if (fadeAt[k] !== undefined && ys[j]! - offset[k]! < rowsTop - 0.5) return fadeAt[k]!;
    return exit;
  });
  const scrollKeys = (j: number) => {
    const keys = [];
    for (let k = j + 1; k < rows.length; k++) {
      if (scrollAt[k] === undefined || (leaves[j] !== undefined && scrollAt[k]! >= leaves[j]!)) continue;
      keys.push(...go(ctx, scrollAt[k]!, -(offset[k - 1]! - offset[j]!), -(offset[k]! - offset[j]!), ctx.noOvershoot("move"), 1, "move"));
    }
    return keys;
  };
  const lifeEnd = Math.max(...rows.map((r, i) => ys[i]! + r.h - offset[i]!)) + tail;
  p.actors.forEach((_a, i) => {
    const at = t0 + i * stg;
    out.push(...nodeBox(ctx, { id: `${id}-a${i}`, x: X(i) - boxW / 2, y: top, w: boxW, h: boxH, lines: actorLines[i]!, role: "label", at, until: exit, lit: [] }));
    // Hairlines sit on the pixel grid (crisp): whole px widths, centred so they cover whole px.
    const lifeW = Math.max(1, Math.floor(wt.base * 0.75));
    const lx = crisp(X(i), lifeW);
    out.push({ id: `${id}-life${i}`, kind: "path", d: `M${lx} ${px(top + boxH)}V${px(lifeEnd)}`, stroke: "inkMuted", width: lifeW,
      dash: [ctx.stroke * 3, ctx.stroke * 3], tracks: { draw: go(ctx, at + ctx.dur.enter * 0.5, 0, 1, drawn, 1.6, "move"), ...appear(ctx, at, exit, 0) } });
    lineSets.push([[lx, top + boxH], [lx, lifeEnd]]);
  });

  // Steps.
  p.steps.forEach((s, i) => {
    const t = times[i]!;
    const r = rows[i]!;
    const ry = ys[i]! - offset[i]!;
    const until = leaves[i];
    const next = Math.min(times[i + 1] ?? Infinity, until ?? Infinity);
    const nextOr = Number.isFinite(next) ? next : undefined;
    const scroll = scrollKeys(i);
    const yOf = (at: number) => [...(appear(ctx, at, until).y ?? []), ...scroll];
    const yPath = scroll.length ? { y: scroll } : {};
    const rise = yOf(t);
    if ("from" in s && r.kind === "msg") {
      const a = idx(s.from), b = idx(s.to);
      if (a === b) throw new Error(`sequence ${id}: a message needs two actors`);
      const dir = Math.sign(b - a);
      const msgW = Math.max(1, Math.round(wt.base));
      const ay = crisp(ry + r.lines.length * lhL + lift, msgW);
      const x1 = X(a), tip: Pt = [X(b) - dir * wt.base * 0.375, ay];
      const baseEnd = tip[0] - dir * aLen * 0.9;
      const dLine = `M${px(x1)} ${ay}H${px(baseEnd)}`;
      const head = arrowHead(tip, [x1, ay], aLen, aHalf);
      const headAt = t + (ctx.instant ? 0 : ctx.dur.move * 0.85);
      const drawK = go(ctx, t, 0, 1, drawn, 1, "move");
      out.push({ id: `${id}-m${i}`, kind: "path", d: dLine, stroke: "inkMuted", width: msgW, cap: "butt", tracks: { draw: drawK, ...appear(ctx, t, until, 0), ...yPath } });
      out.push({ id: `${id}-m${i}-head`, kind: "path", d: head, fill: "inkMuted", tracks: { ...appear(ctx, headAt, until, 0), ...yPath } });
      out.push({ id: `${id}-m${i}-key`, kind: "path", d: dLine, stroke: "accent", width: wt.lit, cap: "butt", z: 2,
        tracks: { draw: drawK, opacity: fadeKeys(ctx, [[t, nextOr]], t, until), ...yPath } });
      out.push({ id: `${id}-m${i}-khead`, kind: "path", d: arrowHead(tip, [x1, ay], aLen * 1.1, aHalf * 1.1), fill: "accent", z: 3,
        tracks: { opacity: fadeKeys(ctx, [[headAt, nextOr]], headAt, until), ...yPath } });
      lineSets.push([[x1, ay + offset[i]!], [tip[0], ay + offset[i]!]]);
      // The label sits in the gap between the sender and its neighbour toward the receiver.
      const nb = a + dir;
      const gx0 = Math.min(X(a), X(nb)) + m, gx1 = Math.max(X(a), X(nb)) - m;
      const gw = numRoom + widest(ctx, r.lines, "label");
      const gx = (gx0 + gx1) / 2 - gw / 2;
      const nx = gutter ? X(0) - m - ctx.measure(numOf.get(i)!, "label") : gx + numW - ctx.measure(numOf.get(i)!, "label");
      const swaps: [number, number | undefined][] = nextOr !== undefined && (until === undefined || nextOr < until) ? [[nextOr, undefined]] : [];
      const num = numOf.get(i)!;
      out.push(...swapText(ctx, { id: `${id}-m${i}-n`, x: px(nx), y: px(ry), text: num, role: "label",
        colors: ["accentText", "inkMuted"], at: t, until, swaps, y0: rise }));
      r.lines.forEach((l, k) => out.push(...swapText(ctx, { id: `${id}-m${i}-l${k}`, x: px(gx + numRoom), y: px(ry + k * lhL), text: l, role: "label",
        colors: ["ink", "inkMuted"], at: t + k * ctx.dur.stagger, until, swaps, y0: yOf(t + k * ctx.dur.stagger) })));
    } else if (r.kind === "note") {
      const tr = { ...appear(ctx, t, until), y: rise };
      const box = { x: r.x, y: ry, w: r.w, h: r.h };
      covers.push({ ...box, y: ys[i]! });
      out.push({ id: `${id}-note${i}`, kind: "rect", x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), fill: "surface", stroke: "rule",
        strokeWidth: ctx.stroke, radius: Math.min(ctx.radius, r.h / 2), z: 1, tracks: tr });
      r.lines.forEach((l, k) => {
        const lw = ctx.measure(l, "caption");
        out.push({ id: `${id}-note${i}-l${k}`, kind: "text", x: px(box.x + (box.w - lw) / 2), y: px(box.y + padN + k * lhC), text: l, role: "caption", color: "ink",
          tracks: { ...appear(ctx, t + k * ctx.dur.stagger, until), y: yOf(t + k * ctx.dur.stagger) } });
      });
    }
  });

  const shift = (nid: string) => { const mm = nid.match(new RegExp(`^${id}-(?:m|note)(\\d+)-`)); return mm ? offset[Number(mm[1])]! : 0; };
  problems.push(...audit(ctx, out, lineSets, covers, shift));
  return { out, problems };
}

/**
 * Lays the diagram out across the full box first. When a text box leaves the text-safe area, it lays
 * out again on a narrower box, so the right-hand labels clear the platform's buttons.
 */
export const sequence: Block<SequenceProps> = (p, ctx) => tagParts(drawSequence(textSafeBox(ctx, p, `sequence ${p.id ?? "seq"}`, "give the lower band to a picture, or use steps"), ctx), p.id ?? "seq", GESTURES.sequence!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawSequence: Block<SequenceProps> = (p, ctx) => {
  let best: Laid | null = null;
  for (const f of [0, 0.04, 0.08, 0.12, 0.16, 0.2]) {
    const r = compose(p, ctx, p.w * f);
    if (!r.problems.length) return r.out;
    if (!best || r.problems.length < best.problems.length) best = r;
  }
  console.warn(`sequence ${p.id ?? "seq"}: ${best!.problems.join("; ")}`);
  return best!.out;
};
