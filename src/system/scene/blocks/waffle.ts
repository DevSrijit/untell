// Waffle: a unit chart. A grid of equal squares, where each square is one thing (a person, a room,
// a roll of the dice). The squares of the key group fill in reading order to show a share or a count.
// A large number and a short sentence say what the filled squares mean. It suits "1 in N" stories.
//
// Rules this block enforces:
// - A title is required. It names what one grid counts.
// - The grid shape comes from the total: up to 12 units sit in one row, a square number makes a
//   square grid, and other totals get the nearest square grid with a short last row.
// - The key group is marked by more than colour: its squares are solid series1, and the other
//   squares are hollow outlines. The large number is set in accentText.
// - Every square is the same size, with the same gap, so the count reads true.
// - Squares fill one after another on ctx.noOvershoot("enter"): a square never grows past its size
//   and comes back. The whole fill takes at most two move durations, however many squares fill.
// - The large number and its sentence land after the fill ends.
// - Every text box passes textSafe. At 9:16 the number, the sentence and the unit note sit above
//   the grid, so the grid can reach into the low band, where only graphics may go. In a wide box
//   they sit beside it. A line that still fails textSafe is reported with console.warn.
// - In a one-frame system (ctx.instant), each square appears in one frame.
import { go, lines, px, textSafe, fadeOn } from "../context";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import { twoLines } from "./util";
import { GESTURES, hand, tagParts } from "./hand";

export type WaffleProps = {
  id?: string;
  /** The block's box in px. The title, the grid and all text fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names what the grid counts, for example "100 rooms of 23 people". */
  title: string;
  /** How many units the grid holds. */
  total: number;
  /** How many units are in the key group. A fraction is rounded to the nearest unit. */
  filled: number;
  /** Units in one row. Default: from the total. */
  cols?: number;
  /** The large number. Default: the filled count and the total, as "72 in 100". */
  stat?: string;
  /** One short sentence that says what the filled units mean. */
  label: string;
  /** What one unit is, for example "Each square is one room". Optional. */
  unit?: string;
  at: number;
  until?: number;
};

/** Breaks text into lines no wider than `w`, at spaces. */
function wrap(ctx: Ctx, text: string, role: TypeRole, w: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measure(next, role) > w) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** The number of columns for a total: one row up to 12, a square grid otherwise. */
function colsFor(total: number): number {
  if (total <= 12) return total;
  return Math.ceil(Math.sqrt(total));
}

export const waffle: Block<WaffleProps> = (p, ctx) => tagParts(drawWaffle(p, ctx), p.id ?? "waffle", GESTURES.waffle!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawWaffle: Block<WaffleProps> = (p, ctx) => {
  const id = p.id ?? "waffle";
  const out: Node[] = [];
  const exit = p.until;
  const total = Math.max(1, Math.round(p.total));
  const filled = Math.max(0, Math.min(total, Math.round(p.filled)));
  const cols = Math.max(1, Math.min(total, p.cols ?? colsFor(total)));
  const rows = Math.ceil(total / cols);
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const fadeKeys = (at: number, to = 1): Key[] => fadeOn(ctx, at, exit, to);
  const fade = (at: number): Tracks => ({ opacity: fadeKeys(at) });
  const gapY = Math.round(sL * 0.6);
  const wide = p.w > p.h * 1.25;

  // The text column: its width, and the right edge text may reach at a given height (the low band).
  const rightAt = (y: number, h: number) => Math.min(p.x + p.w, y + h > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right);

  // The large number: display size when it fits the column, else headline.
  const stat = p.stat ?? `${filled} in ${total}`;
  type Text = { lines: string[]; role: TypeRole; h: number };
  const setText = (w: number): { title: Text; stat: Text; label: Text; unit?: Text } => {
    const two = twoLines(p.title);
    const titleLines = ctx.measure(p.title, "label") <= w ? [p.title]
      : two && two.every((l) => ctx.measure(l, "label") <= w) ? [...two] : wrap(ctx, p.title, "label", w);
    const statRole: TypeRole = ctx.measure(stat, "display") <= w ? "display" : "headline";
    const labelLines = wrap(ctx, p.label, "body", w);
    const unitLines = p.unit ? wrap(ctx, p.unit, "label", w) : [];
    return {
      title: { lines: titleLines, role: "label", h: titleLines.length * lhL },
      stat: { lines: [stat], role: statRole, h: ctx.lineHeight(statRole) },
      label: { lines: labelLines, role: "body", h: labelLines.length * ctx.lineHeight("body") },
      unit: p.unit ? { lines: unitLines, role: "label", h: unitLines.length * lhL } : undefined,
    };
  };

  // Layout. Tall: title, number, sentence, the unit note, then the grid. Wide: the grid on the
  // left, and the title, number, sentence and unit note in a column on its right.
  let grid: { x: number; y: number; side: number };
  let place: { title: [number, number]; stat: [number, number]; label: [number, number]; unit?: [number, number] };
  let T: ReturnType<typeof setText>;
  if (wide) {
    const colGap = Math.round(sL * 1.6);
    const gridW = Math.min(p.h * (cols / rows), p.w * 0.5);
    const tx = p.x + gridW + colGap;
    const tw = p.x + p.w - tx;
    T = setText(tw);
    const textH = T.title.h + gapY * 2 + T.stat.h + gapY + T.label.h + (T.unit ? gapY * 2 + T.unit.h : 0);
    let ty = p.y + Math.max(0, (p.h - textH) / 2);
    place = { title: [tx, ty], stat: [tx, 0], label: [tx, 0] };
    ty += T.title.h + gapY * 2;
    place.stat = [tx, ty];
    ty += T.stat.h + gapY;
    place.label = [tx, ty];
    ty += T.label.h;
    if (T.unit) place.unit = [tx, ty + gapY * 2];
    grid = { x: p.x, y: p.y + (p.h - gridW * (rows / cols)) / 2, side: gridW };
  } else {
    T = setText(p.w);
    let ty = p.y;
    place = { title: [p.x, ty], stat: [p.x, 0], label: [p.x, 0] };
    ty += T.title.h + gapY * 2;
    place.stat = [p.x, ty];
    ty += T.stat.h + gapY * 0.5;
    place.label = [p.x, ty];
    ty += T.label.h + gapY * 2;
    // The unit note sits just above the grid, as its key. Under the grid it would fall in the
    // bottom band that Reels and Shorts cover.
    if (T.unit) { place.unit = [p.x, ty]; ty += T.unit.h + gapY; }
    const side = Math.min(p.w, (p.y + p.h - ty) * (cols / rows));
    grid = { x: p.x, y: ty, side };
  }

  // The squares: equal cells with an equal gap, the gap a fifth of the pitch.
  const pitch = grid.side / (cols - 0.2);
  const cell = Math.floor(pitch * 0.8);
  const radius = Math.min(ctx.radius, cell * 0.2);
  const line = Math.max(1, Math.min(ctx.stroke, cell * 0.06));
  const cellAt = (i: number) => ({ x: px(grid.x + (i % cols) * pitch), y: px(grid.y + Math.floor(i / cols) * pitch) });

  // Timing: the title, then the empty grid row by row, then the fill, then the number and sentence.
  const t0 = p.at;
  const gridAt = t0 + ctx.dur.enter;
  const fillAt = gridAt + ctx.dur.stagger * rows + ctx.dur.enter;
  const per = filled > 1 ? Math.min(ctx.dur.stagger * 2, (ctx.dur.move * 2) / filled) : 0;
  const fillEnd = fillAt + per * Math.max(0, filled - 1) + ctx.dur.enter;
  const statAt = fillEnd + ctx.dur.stagger;

  // Text nodes. Each line checks textSafe; a line that fails is reported.
  const textOut = (key: string, t: Text, at: [number, number], color: "ink" | "inkMuted" | "accentText", when: number, rise: boolean) => {
    const lh = ctx.lineHeight(t.role);
    t.lines.forEach((l, i) => {
      const b = { x: at[0], y: at[1] + i * lh, w: ctx.measure(l, t.role), h: lh };
      if (!textSafe(ctx, b) || b.x + b.w > rightAt(b.y, b.h) + 0.5) console.warn(`waffle ${id}: "${l}" is outside the text-safe area`);
    });
    if (rise) out.push(...lines(ctx, { id: `${id}-${key}`, x: at[0], y: at[1], lines: t.lines, role: t.role, color, at: when, until: exit }));
    else t.lines.forEach((l, i) => out.push({ id: `${id}-${key}-${i}`, kind: "text", x: at[0], y: at[1] + i * lh, text: l, role: t.role, color,
      tracks: fade(when + i * ctx.dur.stagger) }));
  };
  textOut("title", T.title, place.title, "inkMuted", t0, true);
  textOut("stat", T.stat, place.stat, "accentText", statAt, true);
  textOut("label", T.label, place.label, "ink", statAt + ctx.dur.stagger * 2, false);
  if (T.unit && place.unit) textOut("unit", T.unit, place.unit, "inkMuted", gridAt + ctx.dur.stagger * rows, false);

  // The units in the system's hand (hand.ts): round units where its bars have round ends (Studio, Pop), square
  // where they are square; overprinted ink in Riso.
  const H = hand(ctx);
  const uR = H.end === "full" ? cell / 2 : H.end === "square" ? 0 : radius;
  const blend = H.bar === "overprint" ? "multiply" as const : undefined;
  // Empty squares: hollow outlines, row by row.
  for (let i = 0; i < total; i++) {
    const c = cellAt(i);
    out.push({ id: `${id}-u${i}`, kind: "rect", x: c.x, y: c.y, w: cell, h: cell, radius: uR, fill: "ground", stroke: H.bar === "outline" ? "inkMuted" : "rule", strokeWidth: line, z: 0,
      tracks: fade(gridAt + Math.floor(i / cols) * ctx.dur.stagger) });
  }
  // Filled squares: solid series1, in reading order. Each one fades in and grows to its full size.
  const grow = ctx.noOvershoot("enter");
  for (let i = 0; i < filled; i++) {
    const c = cellAt(i);
    const at = fillAt + i * per;
    out.push({ id: `${id}-f${i}`, kind: "rect", x: c.x, y: c.y, w: cell, h: cell, radius: uR, fill: "series1", blend, z: 1, origin: [0.5, 0.5],
      tracks: { opacity: fadeKeys(at), ...(ctx.instant ? {} : { scale: go(ctx, at, 0.4, 1, grow, 1, "enter") }) } });
  }
  return out;
};
