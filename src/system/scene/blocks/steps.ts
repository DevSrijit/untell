// Steps: a numbered sequence of 3 to 6 steps. One step at a time is the current step.
//
// Rules this block enforces:
// - Each step has a number, a short title and an optional one-line detail.
// - The current step is the key one. It shows at full strength and moves a short distance toward
//   the reader's eye (right in a column, up in a row). The other steps stay quiet at lower opacity.
//   So the key step does not rely on colour alone: position and contrast mark it too.
// - A progress bar runs beside each step. Finished steps are full. The bar of the current step fills
//   while that step holds, so the viewer sees how long the step lasts and how far the sequence has come.
// - Steps advance on a schedule: the first becomes current after the list appears, then one every `hold` seconds.
// - At 9:16 (a tall box) the steps form a column; at 16:9 (a wide box) they form a row.
// - The block picks the largest pair of type roles that fits the box. Titles and details may wrap
//   to two balanced lines. When nothing fits, the block drops the details and logs a warning.
// - At 9:16, text below the low band ends before the platform buttons.
// - Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
import { appear, go, leaveAt, px, seq, textSafe } from "../context";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Node } from "../types";
import { textRight, wrapBalanced } from "./quote";
import { GESTURES, tagParts } from "./hand";

export type StepsProps = {
  id?: string;
  /** The block's box in px. The list fits inside it, centred on the cross axis. */
  x: number; y: number; w: number; h: number;
  /** 3 to 6 steps. */
  steps: { title: string; detail?: string }[];
  /** "column" (one step under another) or "row" (side by side). Default: row when the box is wider than tall. */
  layout?: "column" | "row";
  /** Seconds each step stays current. Default: a reading time from the system's density rules. */
  hold?: number;
  at: number;
  /** When the list starts to leave. */
  until?: number;
};

/** The opacity of a quiet step: legible, but clearly behind the current step. */
const QUIET = 0.42;

type Fit = { title: TypeRole; detail: TypeRole | null; titles: string[][]; details: (string[] | null)[] };

/** Wraps every title and detail at `width` in a pair of roles; null when a text needs more than `lines` lines. */
function fitIn(p: StepsProps, ctx: Ctx, title: TypeRole, detail: TypeRole | null, width: number, lines = 2): Fit | null {
  const titles: string[][] = [];
  const details: (string[] | null)[] = [];
  for (const s of p.steps) {
    const t = wrapBalanced(s.title, width, (x) => ctx.measure(x, title), lines);
    if (!t) return null;
    titles.push(t);
    if (s.detail && detail) {
      const d = wrapBalanced(s.detail, width, (x) => ctx.measure(x, detail), lines);
      if (!d) return null;
      details.push(d);
    } else details.push(null);
  }
  return { title, detail, titles, details };
}

const LADDER: [TypeRole, TypeRole | null][] = [["headline", "caption"], ["body", "label"], ["caption", "label"]];

export const steps: Block<StepsProps> = (p, ctx) => tagParts(drawSteps(p, ctx), p.id ?? "steps", GESTURES.steps!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawSteps: Block<StepsProps> = (p, ctx) => {
  const id = p.id ?? "steps";
  const n = p.steps.length;
  if (n < 3 || n > 6) console.warn(`steps ${id}: ${n} steps; the block is designed for 3 to 6`);
  const row = (p.layout ?? (p.w > p.h ? "row" : "column")) === "row";
  const sL = ctx.size("label"), lhN = ctx.lineHeight("label");
  const bar = Math.max(ctx.stroke * 2, 4); // the progress bar's thickness
  const nudge = Math.round(sL * 0.5); // how far the current step moves
  const numW = Math.max(...p.steps.map((_, i) => ctx.measure(num(i), "label")));

  // Geometry that does not depend on the roles.
  const barGap = Math.round(sL * 0.7); // between the bar and the text
  const numGap = Math.round(sL * 0.6); // between the number and the title (column)
  const colGap = Math.round(sL * 1.4); // between columns (row)
  const right = Math.min(p.x + p.w, ctx.safe.right);

  /** The height of one step's text in a fit. */
  const textH = (f: Fit, i: number, numAbove: boolean) => {
    const lhT = ctx.lineHeight(f.title);
    const d = f.details[i];
    return (numAbove ? lhN + Math.round(sL * 0.3) : 0) + f.titles[i]!.length * lhT + (d && f.detail ? Math.round(sL * 0.45) + d.length * ctx.lineHeight(f.detail) : 0);
  };

  // Column: text width = box width minus bar, number and nudge. Row: column width minus nudge room (none needed: the nudge is vertical).
  const colWidth = (r: number) => row ? (r - p.x - colGap * (n - 1)) / n : r - p.x - bar - barGap - numW - numGap - nudge;
  const stepGap = (f: Fit) => Math.round(ctx.lineHeight(f.title) * 0.55);
  const totalH = (f: Fit) => row
    ? bar + barGap + nudge + Math.max(...p.steps.map((_, i) => textH(f, i, true)))
    : p.steps.reduce((a, _, i) => a + textH(f, i, false), 0) + stepGap(f) * (n - 1);

  const tryFit = (r: number, drop = false, ladder = LADDER, lines = 2): Fit | null => {
    for (const [t, d] of ladder) {
      const f = fitIn(p, ctx, t, drop ? null : d, colWidth(r), lines);
      if (f && totalH(f) <= p.h) return f;
    }
    return null;
  };
  // First at the full width. When the text reaches below the low band at 9:16, wrap again at the narrower width there.
  let fit = tryFit(right);
  const startY = (f: Fit) => p.y + (p.h - totalH(f)) / 2;
  if (fit && startY(fit) + totalH(fit) > ctx.safe.lowBandTop) {
    const narrow = textRight(ctx, right, Infinity);
    if (narrow < right) fit = tryFit(narrow) ?? tryFit(narrow, true);
  }
  if (!fit) fit = tryFit(textRight(ctx, right, Infinity), true);
  // Last resort: small titles on up to four lines, without details.
  if (!fit) fit = tryFit(textRight(ctx, right, Infinity), true, [["caption", null], ["label", null]], 4);
  if (!fit) {
    console.warn(`steps ${id}: the steps do not fit the box; titles are set in caption and may overflow`);
    fit = { title: "caption", detail: null, titles: p.steps.map((s) => [s.title]), details: p.steps.map(() => null) };
  } else if (fit.detail === null && p.steps.some((s) => s.detail)) {
    console.warn(`steps ${id}: details were dropped to fit the box`);
  }
  const F = fit;

  // ---------------------------------------------------------------- schedule
  const st = ctx.dur.stagger * 2;
  const appearAt = (i: number) => p.at + i * st;
  const first = appearAt(n - 1) + ctx.dur.enter + ctx.dur.stagger * 2;
  const words = (i: number) => `${p.steps[i]!.title} ${p.steps[i]!.detail ?? ""}`.trim().split(/\s+/).length;
  const dens = ctx.system.density;
  const reading = Math.max(...p.steps.map((_, i) => dens.minHoldBase + dens.minHoldPerWord * words(i)));
  // A step change must finish before the next one starts.
  const hold = Math.max(p.hold ?? reading, ctx.dur.move + ctx.dur.enter + 0.1);
  const cur = (i: number) => first + i * hold;
  const exit = p.until;
  // A step becomes current only when its change ends before the list leaves. `lastOn` is the final current step.
  const on = (i: number) => i < n && (exit === undefined || cur(i) + ctx.dur.move < exit);
  const lastOn = Math.max(-1, ...p.steps.map((_, i) => (on(i) ? i : -1)));
  const soft = ctx.noOvershoot("move");

  /** Opacity: rises to quiet, comes up to full while current, goes back to quiet, leaves. */
  // The exit is the shared one (leaveAt): an early `until` cuts the entrance short and still leaves completely.
  const opacity = (i: number): Key[] => exit !== undefined && exit <= appearAt(i) ? [{ t: 0, v: 0 }] : leaveAt(ctx, seq(
    go(ctx, appearAt(i), 0, QUIET),
    on(i) && go(ctx, cur(i), QUIET, 1, soft, 1, "move"),
    on(i) && i < lastOn && go(ctx, cur(i + 1), 1, QUIET, soft, 1, "move"),
  ), exit, 0);
  /** The nudge toward the reader while current, after a small rise on entry. */
  const shift = (i: number, sign: number, rise: boolean): Key[] => seq(
    rise && !ctx.instant && go(ctx, appearAt(i), 10, 0),
    !rise && [{ t: appearAt(i), v: 0 }],
    on(i) && go(ctx, cur(i), 0, sign * nudge, soft, 1, "move"),
    on(i) && i < lastOn && go(ctx, cur(i + 1), sign * nudge, 0, soft, 1, "move"),
  );
  /** The fill of a progress bar: it grows over the step's hold at a constant rate, then stays full. */
  const fill = (i: number): Key[] => go(ctx, cur(i), 0, 1, "linear", hold / ctx.dur.move);

  // ---------------------------------------------------------------- nodes
  const out: Node[] = [];
  const lhT = ctx.lineHeight(F.title);
  const lhD = F.detail ? ctx.lineHeight(F.detail) : 0;
  // The number sits on the baseline of the title's first line.
  const base = (role: TypeRole) => (ctx.lineHeight(role) - ctx.size(role)) / 2 + ctx.size(role) * 0.8;
  const numDy = base(F.title) - base("label");
  const y0 = Math.round(startY(F));

  const text = (i: number, key: string, x: number, y: number, s: string, role: TypeRole, color: "ink" | "inkMuted", tracks: Node["tracks"]) =>
    // A mask clips each line to its own line box, so stacked lines in a tight leading never share a box.
    out.push({ id: `${id}-${i}-${key}`, kind: "text", x: px(x), y: px(y), text: s, role, color, mask: true, tracks });

  if (!row) {
    let y = y0;
    p.steps.forEach((_, i) => {
      const h = textH(F, i, false);
      const bx = p.x + bar / 2;
      const top = px(y), bottom = px(y + h);
      // The bar: a quiet track and the fill drawn over it, from the top down.
      out.push({ id: `${id}-${i}-track`, kind: "path", d: `M${px(bx)} ${top}V${bottom}`, stroke: "rule", width: bar, cap: "butt",
        tracks: { draw: go(ctx, appearAt(i), 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, appearAt(i), exit, 0) } });
      if (on(i)) out.push({ id: `${id}-${i}-fill`, kind: "path", d: `M${px(bx)} ${top}V${bottom}`, stroke: "accent", width: bar, cap: "butt", z: 1,
        tracks: { draw: fill(i), ...appear(ctx, cur(i), exit, 0) } });
      const tracks = { opacity: opacity(i), x: shift(i, 1, false), y: ctx.instant ? undefined : seq(go(ctx, appearAt(i), 10, 0)) };
      const tx = p.x + bar + barGap;
      text(i, "num", tx, y + numDy, num(i), "label", "inkMuted", tracks);
      const ttx = tx + numW + numGap;
      F.titles[i]!.forEach((l, k) => text(i, `title-${k}`, ttx, y + k * lhT, l, F.title, "ink", tracks));
      const d = F.details[i];
      if (d && F.detail) d.forEach((l, k) => text(i, `detail-${k}`, ttx, y + F.titles[i]!.length * lhT + Math.round(sL * 0.45) + k * lhD, l, F.detail!, "inkMuted", tracks));
      y += h + stepGap(F);
    });
  } else {
    const cw = colWidth(right);
    // Titles share a top line and details share a top line, so the row reads as a grid.
    const maxTitle = Math.max(...F.titles.map((t) => t.length));
    p.steps.forEach((_, i) => {
      const cx = p.x + i * (cw + colGap);
      const by = px(y0 + bar / 2);
      out.push({ id: `${id}-${i}-track`, kind: "path", d: `M${px(cx)} ${by}H${px(cx + cw)}`, stroke: "rule", width: bar, cap: "butt",
        tracks: { draw: go(ctx, appearAt(i), 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, appearAt(i), exit, 0) } });
      if (on(i)) out.push({ id: `${id}-${i}-fill`, kind: "path", d: `M${px(cx)} ${by}H${px(cx + cw)}`, stroke: "accent", width: bar, cap: "butt", z: 1,
        tracks: { draw: fill(i), ...appear(ctx, cur(i), exit, 0) } });
      // The text rests `nudge` below its raised place; the current step rises into the gap.
      const ty = y0 + bar + barGap + nudge;
      const tracks = { opacity: opacity(i), y: shift(i, -1, true) };
      text(i, "num", cx, ty, num(i), "label", "inkMuted", tracks);
      const tt = ty + lhN + Math.round(sL * 0.3);
      F.titles[i]!.forEach((l, k) => text(i, `title-${k}`, cx, tt + k * lhT, l, F.title, "ink", tracks));
      const d = F.details[i];
      if (d && F.detail) d.forEach((l, k) => text(i, `detail-${k}`, cx, tt + maxTitle * lhT + Math.round(sL * 0.45) + k * lhD, l, F.detail!, "inkMuted", tracks));
    });
  }

  // Every text box must be in the text-safe area, at rest and at its nudged place.
  for (const nd of out) if (nd.kind === "text") {
    const w = ctx.measure(nd.text, nd.role), h = ctx.lineHeight(nd.role);
    const dx = row ? 0 : nudge, dy = row ? -nudge : 0;
    if (!textSafe(ctx, { x: nd.x, y: nd.y, w, h }) || !textSafe(ctx, { x: nd.x + dx, y: nd.y + dy, w, h }))
      console.warn(`steps ${id}: "${nd.text}" is outside the text-safe area`);
  }
  return out;
};

/** "01", "02", ... */
const num = (i: number) => String(i + 1).padStart(2, "0");
