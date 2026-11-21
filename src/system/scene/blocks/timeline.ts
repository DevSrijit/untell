// Timeline: dated events along an axis, eras as spans, and a "now" marker that sweeps through time.
// Horizontal in a wide box (16:9), vertical in a tall one (9:16).
//
// Rules this block enforces:
// - A title is required. It names what the events are and the unit of the axis (years).
// - Each part has its own lane, so nothing moves over text. Events sit in tiers above and below a
//   horizontal axis, or in rows right of a vertical one. Era spans sit on the axis, and their labels
//   have a lane of their own: under a horizontal axis, left of a vertical one. The now marker crosses
//   only the axis and the event dots.
// - Labels place themselves with the number-line engine. Close events alternate sides, then take the
//   next free tier, or push their rows apart. A label wraps to two lines before it is left out; an
//   event without room is left out whole, with a warning.
// - Below the low band at 9:16, rows end by the band's right edge (textSafe at each row's own height).
// - Events appear when the now marker reaches them. The marker moves at constant speed, as time does.
//   In a one-frame system, it jumps from event to event.
// - The key event has a larger, filled dot and an ink label. The others are hollow, with muted text.
//   Size, fill and weight mark it, so colour never carries the meaning alone.
import { appear, go, lines, px, frameOf, steps } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Key, Node } from "../types";
import { twoLines, type Box } from "./util";
import { checkOverlap, drawSpot, placeRows, placeTiers, sizeOf, variantsOf, type AxisItem, type Line, type Spot } from "./numberLine";
import { GESTURES, tagParts } from "./hand";
import { tallBox } from "./lineChart";

export type TimelineProps = {
  id?: string;
  /** The block's box in px: title, axis and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  /** The axis range, in years (fractions allowed). */
  from: number; to: number;
  /** `when` is the event's year. `date` is the printed date (default: the year). `at` overrides when it appears. */
  events: { when: number; date?: string; label: string; key?: boolean; at?: number }[];
  /** Spans of years, each with a short label. */
  eras?: { from: number; to: number; label: string }[];
  /**
   * The now marker sweeps from `from` to `to` (default: the axis range), starting at `at`, over `seconds`.
   * It leaves when the sweep ends, unless `stay` is true.
   */
  now?: { at: number; seconds: number; from?: number; to?: number; stay?: boolean };
  /** Default "auto": horizontal in a wide box, vertical in a tall one. */
  orientation?: "auto" | "horizontal" | "vertical";
  at: number;
  until?: number;
};

export const timeline: Block<TimelineProps> = (p, ctx) => tagParts(drawTimeline(p, ctx), p.id ?? "time", GESTURES.timeline!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawTimeline: Block<TimelineProps> = (p, ctx) => {
  const id = p.id ?? "time";
  const name = `timeline ${id}`;
  if (p.to <= p.from) throw new Error(`${name}: "to" must be after "from"`);
  const exit = p.until;
  const out: Node[] = [];
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const vertical = p.orientation === "vertical" || ((p.orientation ?? "auto") === "auto" && p.h > p.w * 1.1);
  const eras = p.eras ?? [];
  const clampY = (v: number) => Math.min(p.to, Math.max(p.from, v));

  // Title.
  const titleLines = ctx.measure(p.title, "label") <= p.w ? [p.title] : (twoLines(p.title) ?? [p.title]);
  const titleH = lhL * (titleLines.length + 0.9);
  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: p.at, until: exit }));
  const top = p.y + titleH, bottom = p.y + p.h;

  const rKey = ctx.stroke * 4.5, rDot = ctx.stroke * 3.2;
  const band = ctx.stroke * 4;
  const over = rKey + ctx.stroke * 2; // how far the now marker reaches past the axis on each side
  const edge = Math.max(over, band / 2) + 2; // labels and stems keep clear of the marker

  // Event times: when the now marker passes, else one after another.
  const sweep = p.now ? { a: p.now.from ?? p.from, b: p.now.to ?? p.to } : null;
  const passAt = (v: number) => p.now!.at + p.now!.seconds * ((clampY(v) - sweep!.a) / (sweep!.b - sweep!.a));
  const order = p.events.map((_, i) => i).sort((a, b) => p.events[a]!.when - p.events[b]!.when);
  const showAt = p.events.map((e, i) => e.at ?? (sweep ? Math.max(p.now!.at, passAt(e.when)) : p.at + ctx.dur.enter + order.indexOf(i) * ctx.dur.stagger * 3));

  const eventItem = (e: TimelineProps["events"][number], anchor: number): AxisItem => ({
    anchor, key: e.key,
    variants: variantsOf({ text: e.date ?? String(Math.round(e.when)), role: "label", color: e.key ? "ink" : "inkMuted" }, { text: e.label, role: "caption", color: e.key ? "ink" : "inkMuted" }),
  });
  const eraLines = (label: string): Line[][] => {
    const one: Line[] = [{ text: label, role: "label", color: "inkMuted" }];
    const two = twoLines(label);
    return two ? [one, two.map((t) => ({ text: t, role: "label" as const, color: "inkMuted" as ColorRole }))] : [one];
  };

  let P: (v: number) => number; // year -> px along the axis
  let at0: (pos: number) => [number, number];
  let axisD: (a: number, b: number) => string;
  let eventSpots: (Spot | null)[];
  let eraSpots: (Spot | null)[] = [];
  let marker: (pos: number) => string;
  // A tall box (9:16, reaching the lower band): the axis lies low, in the lower band where marks may go, and every
  // label (events and eras) stands above it on a stem, in the text-safe area.
  const low = !vertical && tallBox(ctx, p);
  if (!vertical) {
    const x0 = p.x + rKey, x1 = p.x + p.w - rKey;
    P = (v) => x0 + ((clampY(v) - p.from) / (p.to - p.from)) * (x1 - x0);
    // Era labels take a row under the axis; events below start under that row.
    // The row is one line tall, or two when a one-line label does not fit its span.
    const spanW = (e: { from: number; to: number }) => P(e.to) - P(e.from);
    const eraRowH = !eras.length ? 0 : Math.max(...eras.map((e) => {
      const vs = eraLines(e.label);
      return sizeOf(ctx, vs[0]!).w <= spanW(e) + sL || vs.length === 1 ? sizeOf(ctx, vs[0]!).h : sizeOf(ctx, vs[1]!).h;
    }));
    const edgeB = eras.length && !low ? edge + sL * 0.3 + eraRowH : edge;
    const ay = low ? px(bottom - edge - ctx.stroke * 2) : px((top + bottom + edge - edgeB) / 2);
    at0 = (pos) => [pos, ay];
    axisD = (a, b) => `M${px(a)} ${ay}H${px(b)}`;
    marker = (pos) => `M${px(pos)} ${px(ay - over)}V${px(ay + over)}`;
    // Era labels: centred under each span, inside the box; one line, else two, else left out.
    const eraBoxes: Box[] = [];
    if (!low) eraSpots = eras.map((e) => {
      const mid = (P(e.from) + P(e.to)) / 2;
      for (const ls of eraLines(e.label)) {
        const s = sizeOf(ctx, ls);
        const bx = Math.min(Math.max(mid - s.w / 2, p.x), p.x + p.w - s.w);
        const box = { x: bx, y: ay + edge + sL * 0.3, w: s.w, h: s.h };
        if (box.y + box.h > ay + edgeB + 0.5) continue;
        if (eraBoxes.some((o) => o.x < box.x + box.w + sL && box.x < o.x + o.w + sL)) continue;
        eraBoxes.push(box);
        return { lines: ls, box, align: "center" as const, stem: [mid, ay, mid, ay] as [number, number, number, number] };
      }
      console.warn(`${name}: era "${e.label}" has no room for its label and is left out`);
      return null;
    });
    if (!low) eventSpots = placeTiers(ctx, p.events.map((e) => eventItem(e, P(e.when))), { axis: ay, edgeA: edge, edgeB, top, bottom, x0: p.x, x1: p.x + p.w, obstacles: eraBoxes.map((b) => ({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 })) });
    else {
      // Events and eras share the tiers above the axis; an era's stem rises from the middle of its span.
      const all = placeTiers(ctx, [...p.events.map((e) => eventItem(e, P(e.when))), ...eras.map((e) => ({ anchor: (P(e.from) + P(e.to)) / 2, variants: eraLines(e.label) }))],
        { axis: ay, edgeA: edge, edgeB, top, bottom, x0: p.x, x1: p.x + p.w, obstacles: [], sides: ["a"] });
      eventSpots = all.slice(0, p.events.length);
      eraSpots = all.slice(p.events.length);
      eraSpots.forEach((s, i) => { if (!s) console.warn(`${name}: era "${eras[i]!.label}" has no room for its label and is left out`); });
    }
  } else {
    // Era labels form a column left of the axis; events form rows right of it.
    const eraColW = eras.length ? Math.max(...eras.map((e) => Math.min(...eraLines(e.label).map((ls) => sizeOf(ctx, ls).w)))) : 0;
    const ax = px(p.x + (eras.length ? eraColW + sL * 0.5 + edge : rKey));
    const ya = top + lhL / 2, yb = bottom - lhL / 2;
    P = (v) => ya + ((clampY(v) - p.from) / (p.to - p.from)) * (yb - ya);
    at0 = (pos) => [ax, pos];
    axisD = (a, b) => `M${ax} ${px(a)}V${px(b)}`;
    marker = (pos) => `M${px(ax - over)} ${px(pos)}H${px(ax + over)}`;
    if (eras.length) eraSpots = placeRows(ctx, eras.map((e) => ({ anchor: (P(e.from) + P(e.to)) / 2, variants: eraLines(e.label) })),
      { axis: ax, edge, textX: ax - edge - sL * 0.5, limit: p.x, top, bottom, side: "left", name });
    eventSpots = placeRows(ctx, p.events.map((e) => eventItem(e, P(e.when))), { axis: ax, edge, textX: ax + edge + sL * 1.4, limit: p.x + p.w, top, bottom, name });
  }
  const placed = [...eraSpots, ...eventSpots].filter((s): s is Spot => !!s);
  checkOverlap(name, placed.map((s) => s.box), [...eraSpots.map(() => null), ...eventSpots.filter((s): s is Spot => !!s).map((s) => s.stem)]);

  // The axis: a hairline over the whole range, drawn first.
  const t0 = p.at + ctx.dur.stagger * 2;
  out.push({ id: `${id}-axis`, kind: "path", d: axisD(P(p.from), P(p.to)), stroke: "ink", width: ctx.stroke, tracks: { draw: go(ctx, t0, 0, 1, "move"), ...appear(ctx, t0, exit, 0) } });

  // Eras: thick spans on the axis, in alternating greys, with a small gap between neighbours.
  eras.forEach((e, i) => {
    const s = eraSpots[i];
    if (!s) return;
    const a = P(e.from) + 1.5, b = P(e.to) - 1.5;
    const at = t0 + ctx.dur.move * 0.6 + i * ctx.dur.stagger * 2;
    // A span of years is data: it grows on a curve that never overshoots.
    out.push({ id: `${id}-era-${i}`, kind: "path", d: axisD(a, b), stroke: i % 2 ? "series3" : "series2", width: band, cap: "butt", z: 1,
      tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, at, exit, 0) } });
    out.push(...drawSpot(ctx, `${id}-eral-${i}`, s, at + ctx.dur.stagger, exit, low ? { stem: true, stemColor: "inkMuted", stemWidth: ctx.stroke * 0.75, trim: sL * 0.25 } : { stem: false, stemColor: "inkMuted", stemWidth: 0, trim: 0 }));
  });

  // Events: a dot on the axis, then the stem and the label.
  p.events.forEach((e, i) => {
    const s = eventSpots[i];
    const at = showAt[i]!;
    // An event that would appear after the block leaves is not drawn.
    if (!s || (exit !== undefined && at + ctx.dur.stagger * 4 >= exit)) return;
    const [cx, cy] = at0(P(e.when));
    out.push({ id: `${id}-dot-${i}`, kind: "circle", cx, cy, r: e.key ? rKey : rDot, fill: e.key ? "series1" : "ground", stroke: e.key ? undefined : "ink", width: e.key ? undefined : ctx.stroke, z: 3,
      origin: [0.5, 0.5], tracks: { ...appear(ctx, at, exit, 0), scale: go(ctx, at, 0.4, 1, ctx.noOvershoot("enter"), 1, "enter") } });
    out.push(...drawSpot(ctx, `${id}-ev-${i}`, s, at + ctx.dur.stagger * 2, exit, { stem: true, stemColor: e.key ? "ink" : "inkMuted", stemWidth: ctx.stroke * (e.key ? 1 : 0.75), trim: sL * 0.25 }));
  });

  // The now marker: a short bar across the axis that moves through time.
  if (p.now && sweep && (exit === undefined || p.now.at < exit)) {
    const a = P(sweep.a), b = P(sweep.b);
    let move: Key[];
    if (ctx.instant) {
      // One-frame systems: the marker jumps to each event as it appears, then to the end.
      move = [{ t: 0, v: 0 }];
      const stops = p.events.map((e, i) => ({ t: showAt[i]!, v: P(e.when) - a })).filter((k) => k.t >= p.now!.at).sort((x, y) => x.t - y.t);
      // Two stops in one frame: keep the first.
      const seen = new Set<number>();
      const kept = [...stops, { t: p.now.at + p.now.seconds, v: b - a }].filter((k) => !seen.has(frameOf(k.t)) && !!seen.add(frameOf(k.t)));
      move = steps(0, kept.map((k) => [k.t, k.v] as [number, number]));
    } else move = [{ t: p.now.at, v: 0 }, { t: p.now.at + p.now.seconds, v: b - a, curve: "linear" }];
    // The marker leaves when its sweep ends (unless it stays), and never after the block leaves.
    const end = p.now.at + p.now.seconds + ctx.dur.stagger * 2;
    const leave = p.now.stay ? exit : exit !== undefined ? Math.min(exit, end) : end;
    out.push({ id: `${id}-now`, kind: "path", d: marker(a), stroke: "ink", width: ctx.stroke * 2, cap: "round", z: 5,
      tracks: { [vertical ? "y" : "x"]: move, ...appear(ctx, p.now.at - ctx.dur.enter, leave, 0) } });
  }
  return out;
};
