// Split: two options compared side by side (a wide box) or top and bottom (a tall box), with a divider.
//
// Rules this block enforces:
// - Each side has a heading and 2 to 4 points. The points are matched: point 1 of one side answers
//   point 1 of the other side. Matched points appear together, as a pair, so the eye compares row by row.
// - Side by side, a pair shares one row height, so matched points start on one line.
// - The winning side is marked by more than colour: a tag with a word on it (for example "Faster"),
//   a heavier rule under its heading, and the other side steps back to lower opacity.
// - Text never runs over the divider: each side keeps a gutter on each side of it.
// - The block picks the largest pair of type roles that fits. Points may wrap to two balanced lines.
//   When nothing fits, the block uses the smallest roles and logs a warning.
// - At 9:16, text below the low band ends before the platform buttons.
// - Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
import { appear, go, leaveAt, px, seq, textSafe } from "../context";
import type { TypeRole } from "../../systems";
import type { Block, Key, Node } from "../types";
import { textRight, wrapBalanced } from "./quote";
import { GESTURES, tagParts } from "./hand";

export type SplitSide = { heading: string; points: string[] };

export type SplitProps = {
  id?: string;
  /** The block's box in px. Both sides fit inside it. */
  x: number; y: number; w: number; h: number;
  /** The first option: left side by side, top when stacked. */
  a: SplitSide;
  /** The second option: right side by side, bottom when stacked. */
  b: SplitSide;
  /** The side that wins. It gets the verdict tag and a heavy rule; the other side steps back. */
  winner?: "a" | "b";
  /** The word on the winner's tag, for example "Faster". Default: "Better". */
  verdict?: string;
  /** "columns" (side by side) or "stack" (top and bottom). Default: columns when the box is wider than tall. */
  layout?: "columns" | "stack";
  at: number;
  /** When the comparison starts to leave. */
  until?: number;
};

const QUIET = 0.42;
const LADDER: [TypeRole, TypeRole][] = [["headline", "body"], ["headline", "caption"], ["body", "caption"], ["caption", "label"]];

type Fit = { head: TypeRole; point: TypeRole; heads: [string[], string[]]; rows: [string[] | null, string[] | null][] };

export const split: Block<SplitProps> = (p, ctx) => tagParts(drawSplit(p, ctx), p.id ?? "split", GESTURES.split!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawSplit: Block<SplitProps> = (p, ctx) => {
  const id = p.id ?? "split";
  const cols = (p.layout ?? (p.w > p.h ? "columns" : "stack")) === "columns";
  const n = Math.max(p.a.points.length, p.b.points.length);
  if (n < 2 || n > 4) console.warn(`split ${id}: ${n} points a side; the block is designed for 2 to 4`);
  if (p.a.points.length !== p.b.points.length) console.warn(`split ${id}: the sides have different numbers of points; points are matched by row`);
  const sL = ctx.size("label");
  const gutter = Math.round(sL * 1.6); // between the divider and the text of each side
  const verdict = p.verdict ?? "Better";
  const tagPadX = Math.round(sL * 0.45), tagPadY = Math.round(sL * 0.18);
  const tagW = ctx.measure(verdict, "label") + tagPadX * 2, tagH = ctx.lineHeight("label") + tagPadY * 2;

  // Geometry of the parts, for a fit.
  const ruleGap = (f: Fit) => Math.round(ctx.size(f.point) * 0.5); // heading to rule, rule to first row
  // Side by side, rows breathe; stacked, each half is a tight list so both halves fit one tall frame.
  const rowGap = (f: Fit) => Math.round(ctx.lineHeight(f.point) * (cols ? 0.5 : 0.3));
  const headH = (f: Fit, s: 0 | 1) => f.heads[s].length * ctx.lineHeight(f.head);
  const rowH = (f: Fit, r: number, s?: 0 | 1) => {
    const lines = s === undefined ? Math.max(f.rows[r]![0]?.length ?? 0, f.rows[r]![1]?.length ?? 0) : (f.rows[r]![s]?.length ?? 0);
    return Math.max(1, lines) * ctx.lineHeight(f.point);
  };
  // Side by side, both headings share the taller height and each row the taller of its pair.
  const sideH = (f: Fit) => Math.max(headH(f, 0), headH(f, 1)) + ruleGap(f) * 2 + f.rows.reduce((a, _, r) => a + rowH(f, r), 0) + rowGap(f) * (n - 1);
  const halfGap = Math.round(sL * 1.2); // stacked: space on each side of the divider
  // Stacked, each half has its own row heights.
  const stackH = (f: Fit, s: 0 | 1) => headH(f, s) + ruleGap(f) * 2 + f.rows.reduce((a, _, r) => a + rowH(f, r, s), 0) + rowGap(f) * (n - 1);
  const totalH = (f: Fit) => cols ? sideH(f) + (p.winner ? tagH + Math.round(sL * 0.6) : 0) : stackH(f, 0) + stackH(f, 1) + halfGap * 2;

  /** Text width of one side when the text may reach `right`. */
  const sideW = (right: number) => cols ? (right - p.x) / 2 - gutter : right - p.x;
  const fitIn = (head: TypeRole, point: TypeRole, width: number): Fit | null => {
    const tagRoom = p.winner && !cols ? tagW + sL : 0; // stacked: the tag sits right of the heading
    const ha = wrapBalanced(p.a.heading, width - tagRoom, (s) => ctx.measure(s, head), 2);
    const hb = wrapBalanced(p.b.heading, width - tagRoom, (s) => ctx.measure(s, head), 2);
    if (!ha || !hb) return null;
    const rows: Fit["rows"] = [];
    for (let r = 0; r < n; r++) {
      const wrap = (t?: string) => (t === undefined ? null : wrapBalanced(t, width, (s) => ctx.measure(s, point), 2));
      const ra = wrap(p.a.points[r]), rb = wrap(p.b.points[r]);
      if ((p.a.points[r] !== undefined && !ra) || (p.b.points[r] !== undefined && !rb)) return null;
      rows.push([ra, rb]);
    }
    return { head, point, heads: [ha, hb], rows };
  };
  const tryFit = (right: number) => {
    for (const [hd, pt] of LADDER) {
      const f = fitIn(hd, pt, sideW(right));
      if (f && totalH(f) <= p.h) return f;
    }
    return null;
  };
  const right0 = Math.min(p.x + p.w, ctx.safe.right);
  let fit = tryFit(right0);
  const top = (f: Fit) => p.y + (p.h - totalH(f)) / 2;
  if (fit && top(fit) + totalH(fit) > ctx.safe.lowBandTop) {
    const narrow = textRight(ctx, right0, Infinity);
    if (narrow < right0) fit = tryFit(narrow);
  }
  if (!fit) {
    console.warn(`split ${id}: the comparison does not fit the box; it uses the smallest roles and may overflow`);
    const narrow = textRight(ctx, right0, Infinity);
    fit = fitIn("caption", "label", sideW(narrow)) ?? { head: "caption", point: "label", heads: [[p.a.heading], [p.b.heading]], rows: Array.from({ length: n }, (_, r) => [p.a.points[r] ? [p.a.points[r]!] : null, p.b.points[r] ? [p.b.points[r]!] : null] as [string[] | null, string[] | null]) };
  }
  const F = fit;

  // ---------------------------------------------------------------- schedule
  const st = ctx.dur.stagger;
  const exit = p.until;
  const tHead = p.at;
  const tDivider = p.at;
  const tRule = p.at + st * 2;
  const pairEvery = Math.max(ctx.dur.enter * 0.8, st * 4); // pairs land one after another, each read as a unit
  const tRow = (r: number) => p.at + ctx.dur.enter + r * pairEvery;
  const tVerdict = tRow(n - 1) + ctx.dur.enter + ctx.dur.move;
  const loser = p.winner === "a" ? 1 : p.winner === "b" ? 0 : -1;
  const soft = ctx.noOvershoot("move");

  /** Opacity of a node on side s that enters at `at`: the losing side steps back at the verdict. */
  // The exit is the shared one (leaveAt): an early `until` cuts the entrance and the step back short, and still leaves.
  const opacity = (s: 0 | 1, at: number): Key[] => exit !== undefined && exit <= at ? [{ t: 0, v: 0 }] : leaveAt(ctx, seq(
    go(ctx, at, 0, 1),
    s === loser && (exit === undefined || exit > tVerdict) && go(ctx, tVerdict, 1, QUIET, soft, 1, "move"),
  ), exit, 0);
  const tracks = (s: 0 | 1, at: number, rise = 10): Node["tracks"] => ({ opacity: opacity(s, at), ...(rise && !ctx.instant ? { y: go(ctx, at, rise, 0) } : {}) });

  // ---------------------------------------------------------------- layout
  const out: Node[] = [];
  const lhH = ctx.lineHeight(F.head), lhP = ctx.lineHeight(F.point);
  const y0 = Math.round(top(F));
  const right = Math.min(right0, textRight(ctx, right0, y0 + totalH(F)));
  const text = (key: string, x: number, y: number, s: string, role: TypeRole, color: "ink" | "inkMuted" | "onAccent", tr: Node["tracks"]) =>
    out.push({ id: `${id}-${key}`, kind: "text", x: Math.round(x), y: Math.round(y), text: s, role, color, mask: true, tracks: tr });

  /** Draws one side's heading, rule and points into a frame whose text starts at `sx` and `sy`, `w` wide. */
  const side = (s: 0 | 1, sx: number, sy: number, w: number, headRowH: number, rowHeights: number[]) => {
    const sideP = s === 0 ? p.a : p.b;
    F.heads[s].forEach((l, k) => text(`h${s}-${k}`, sx, sy + headRowH - F.heads[s].length * lhH + k * lhH, l, F.head, "ink", tracks(s, tHead + s * st)));
    const ry = px(sy + headRowH + ruleGap(F));
    const rule = `M${px(sx)} ${ry}H${px(sx + w)}`;
    out.push({ id: `${id}-rule${s}`, kind: "path", d: rule, stroke: "rule", width: ctx.stroke, tracks: { draw: go(ctx, tRule, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, tRule, exit, 0) } });
    if (p.winner && s !== loser) {
      // The winner's rule: a heavy accent line that draws over the hairline at the verdict.
      out.push({ id: `${id}-win-rule`, kind: "path", d: rule, stroke: "accent", width: ctx.stroke * 2.5, cap: "butt", z: 1,
        tracks: { draw: go(ctx, tVerdict, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, tVerdict, exit, 0) } });
    }
    let y = ry + ruleGap(F);
    sideP.points.forEach((_, r) => {
      const ls = F.rows[r]![s];
      if (ls) ls.forEach((l, k) => text(`p${s}-${r}-${k}`, sx, y + k * lhP, l, F.point, "ink", tracks(s, tRow(r) + s * st)));
      y += rowHeights[r]! + rowGap(F);
    });
    return ry;
  };

  const tag = (x: number, y: number) => {
    if (!p.winner) return;
    // A filled tag with the verdict word: a label, not a colour, says which side wins.
    const tr = { ...appear(ctx, tVerdict + st * 2, exit, 0), ...(ctx.instant ? {} : { scale: go(ctx, tVerdict + st * 2, 0.92, 1, ctx.noOvershoot("enter"), 1, "enter") }) };
    out.push({ id: `${id}-tag`, kind: "rect", x: Math.round(x), y: Math.round(y), w: Math.round(tagW), h: Math.round(tagH), fill: "accent", radius: Math.min(ctx.radius, tagH / 2), origin: [0, 0.5], tracks: tr });
    out.push({ id: `${id}-tag-text`, kind: "text", x: Math.round(x + tagPadX), y: Math.round(y + tagPadY), text: verdict, role: "label", color: "onAccent", tracks: appear(ctx, tVerdict + st * 2, exit, 0) });
  };

  if (cols) {
    const half = (right - p.x) / 2;
    const w = half - gutter;
    const tagSpace = p.winner ? tagH + Math.round(sL * 0.6) : 0;
    const sy = y0 + tagSpace;
    const headRowH = Math.max(F.heads[0].length, F.heads[1].length) * lhH;
    const rowHeights = F.rows.map((_, r) => rowH(F, r));
    side(0, p.x, sy, w, headRowH, rowHeights);
    side(1, p.x + half + gutter, sy, w, headRowH, rowHeights);
    // The divider: a hairline from the tag line to the last row, drawn from the top.
    const dx = px(p.x + half);
    const dBottom = px(y0 + totalH(F));
    out.push({ id: `${id}-divider`, kind: "path", d: `M${dx} ${px(y0)}V${dBottom}`, stroke: "rule", width: ctx.stroke, tracks: { draw: go(ctx, tDivider, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, tDivider, exit, 0) } });
    // The tag sits above the winner's heading.
    if (p.winner) tag(p.winner === "a" ? p.x : p.x + half + gutter, y0);
  } else {
    const w = right - p.x;
    const rowsA = F.rows.map((_, r) => rowH(F, r, 0)), rowsB = F.rows.map((_, r) => rowH(F, r, 1));
    // Each half keeps its own row heights, so a half has no gaps; its rows still appear with their pair.
    const aH = stackH(F, 0);
    side(0, p.x, y0, w, headH(F, 0), rowsA);
    const dy = px(y0 + aH + halfGap);
    out.push({ id: `${id}-divider`, kind: "path", d: `M${px(p.x)} ${dy}H${px(right)}`, stroke: "rule", width: ctx.stroke, tracks: { draw: go(ctx, tDivider, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, tDivider, exit, 0) } });
    const by = dy + halfGap;
    side(1, p.x, by, w, headH(F, 1), rowsB);
    // The tag sits right of the winner's last heading line, on its baseline band.
    if (p.winner) {
      const s = p.winner === "a" ? 0 : 1;
      const hy = s === 0 ? y0 : by;
      const last = F.heads[s][F.heads[s].length - 1]!;
      const hx = p.x + ctx.measure(last, F.head) + sL;
      tag(hx, hy + headH(F, s) - lhH / 2 - tagH / 2);
    }
  }

  // Every text box must be in the text-safe area.
  for (const nd of out) if (nd.kind === "text" && !textSafe(ctx, { x: nd.x, y: nd.y, w: ctx.measure(nd.text, nd.role), h: ctx.lineHeight(nd.role) }))
    console.warn(`split ${id}: "${nd.text}" is outside the text-safe area`);
  return out;
};
