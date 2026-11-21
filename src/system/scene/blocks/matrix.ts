// Matrix: a comparison table. Rows are the things compared on; columns are the options.
//
// Rules this block enforces:
// - A header row names the columns. A cell holds a check (true), a cross (false), a short value
//   (a string) or nothing (null, drawn as a dash).
// - Checks and crosses are different shapes, not only different colours.
// - The key column is marked by more than colour: an outline encloses it, and its header is set in ink
//   while the other headers are muted.
// - Text fits its cell or wraps to two balanced lines. When text does not fit, the whole table steps
//   down a type role. A word that does not fit in the smallest role is a content error: the block logs a warning.
// - Columns get the width their content needs, up to about twice that; the row-label column takes
//   one line when it can, at most 40 % of the box. A wide box does not stretch the table.
// - Cells reveal by row (each row left to right) or by column (each column top to bottom).
// - At 9:16, text below the low band ends before the platform buttons: the table narrows to that edge.
// - Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
// - A row's ink is centred in the row, not its line boxes (layout.centreInk): one-line texts of a row share one
//   baseline, at the x-height band when any has lower case, else at the cap band.
// - In a column, the header and every cell share one centre line exactly (the column's centre).
import { appear, go, lines, px, textSafe } from "../context";
import type { TypeRole } from "../../systems";
import { centreInk, centreInkLines, inkKind } from "../layout";
import type { Block, Node } from "../types";
import { textRight, wrapBalanced } from "./quote";
import { GESTURES, tagParts, textSafeBox } from "./hand";

export type MatrixCell = boolean | string | null;

export type MatrixProps = {
  id?: string;
  /** The block's box in px. The title and the table fit inside it. */
  x: number; y: number; w: number; h: number;
  /** A short title that says what the table compares. */
  title?: string;
  /** Column headers, one per option. */
  columns: string[];
  /** One row per thing compared: a label and one cell per column. */
  rows: { label: string; cells: MatrixCell[] }[];
  /** The column that matters (an index into `columns`). */
  key?: number;
  /** Reveal order. Default: "row". */
  by?: "row" | "column";
  at: number;
  /** When the table starts to leave. */
  until?: number;
};

const LADDER: TypeRole[] = ["body", "caption", "label"];

type Fit = {
  role: TypeRole;
  labelW: number; colW: number; tableW: number;
  heads: string[][]; labels: string[][]; cells: (string[] | null)[][];
  headH: number; rowHs: number[];
};

export const matrix: Block<MatrixProps> = (p, ctx) => tagParts(drawMatrix(textSafeBox(ctx, p, `matrix ${p.id ?? "matrix"}`, "a table is text: give the lower band to a picture or a chart beside it"), ctx), p.id ?? "matrix", GESTURES.matrix!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawMatrix: Block<MatrixProps> = (p, ctx) => {
  const id = p.id ?? "matrix";
  const nc = p.columns.length, nr = p.rows.length;
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const padX = Math.round(sL * 0.35), padY = Math.round(sL * 0.45);
  const titleLines = p.title ? (wrapBalanced(p.title, Math.min(p.x + p.w, ctx.safe.right) - p.x, (s) => ctx.measure(s, "label"), 2) ?? [p.title]) : [];
  const titleH = titleLines.length ? titleLines.length * lhL + Math.round(sL * 0.9) : 0;

  /** The least width that sets `s` in at most two lines. */
  const need = (s: string, role: TypeRole, maxLines = 2) => {
    const words = s.split(/\s+/);
    const widest = Math.max(...words.map((w) => ctx.measure(w, role)));
    const one = ctx.measure(s, role);
    if (words.length === 1) return one;
    // n lines need at least 1/n of the text and at least the widest word.
    let lo = Math.max(widest, one / Math.min(maxLines, words.length)), hi = one;
    for (let k = 0; k < 12; k++) {
      const mid = (lo + hi) / 2;
      if (wrapBalanced(s, mid, (t) => ctx.measure(t, role), maxLines)) hi = mid; else lo = mid;
    }
    return hi;
  };
  const markW = (role: TypeRole) => ctx.size(role) * 0.9;

  // `lines` is the most lines a text may take: 2 by rule; more only in the last-resort layout.
  const fitIn = (role: TypeRole, width: number, lines = 2): Fit | null => {
    const lh = ctx.lineHeight(role);
    // Data columns share one width: the widest need among headers and cells.
    let colNeed = 0;
    for (let c = 0; c < nc; c++) {
      colNeed = Math.max(colNeed, need(p.columns[c]!, "label", lines));
      for (const r of p.rows) {
        const v = r.cells[c];
        colNeed = Math.max(colNeed, typeof v === "string" ? need(v, role, lines) : markW(role));
      }
    }
    const minCol = colNeed + padX * 2;
    const labelOne = Math.max(...p.rows.map((r) => ctx.measure(r.label, role))) + padX;
    const labelTwo = Math.max(...p.rows.map((r) => need(r.label, role, lines))) + padX;
    const room = width - minCol * nc;
    if (room < labelTwo) return null;
    // One line when it fits, but never more than the room left or 40 % of the table; never less than two lines need.
    const labelW = Math.max(labelTwo, Math.min(labelOne, room, Math.max(width * 0.4, labelTwo)));
    // A column needs no more than about twice its content: a wide box does not spread three short columns across the frame.
    // The cap leaves room to set every value on one line when the box allows it.
    const colOne = Math.max(...p.columns.map((h) => ctx.measure(h, "label")), ...p.rows.flatMap((r) => r.cells.map((v) => (typeof v === "string" ? ctx.measure(v, role) : 0))));
    const colW = Math.min((width - labelW) / nc, Math.max(minCol * 1.8, colOne + padX * 2 + sL * 2));
    const inner = colW - padX * 2;
    const heads = p.columns.map((s) => wrapBalanced(s, inner, (t) => ctx.measure(t, "label"), lines));
    const labels = p.rows.map((r) => wrapBalanced(r.label, labelW - padX, (t) => ctx.measure(t, role), lines));
    const cells = p.rows.map((r) => p.columns.map((_, c) => {
      const v = r.cells[c];
      return typeof v === "string" ? wrapBalanced(v, inner, (t) => ctx.measure(t, role), lines) : [];
    }));
    if (heads.some((h) => !h) || labels.some((l) => !l) || cells.some((r) => r.some((c) => !c))) return null;
    const headH = Math.max(...heads.map((h) => h!.length)) * lhL + padY * 2;
    const rowHs = p.rows.map((_, r) => Math.max(labels[r]!.length, ...cells[r]!.map((c) => Math.max(1, c!.length))) * lh + padY * 2);
    const total = titleH + headH + rowHs.reduce((a, b) => a + b, 0);
    if (total > p.h) return null;
    return { role, labelW, colW, tableW: labelW + colW * nc, heads: heads as string[][], labels: labels as string[][], cells: cells as string[][][], headH, rowHs };
  };

  const height = (f: Fit) => titleH + f.headH + f.rowHs.reduce((a, b) => a + b, 0);
  const tryFit = (width: number) => { for (const r of LADDER) { const f = fitIn(r, width); if (f) return f; } return null; };
  const right0 = Math.min(p.x + p.w, ctx.safe.right);
  let fit = tryFit(right0 - p.x);
  const top = (f: Fit) => p.y + (p.h - height(f)) / 2;
  if (fit && top(fit) + height(fit) > ctx.safe.lowBandTop) {
    const narrow = textRight(ctx, right0, Infinity);
    if (narrow < right0) fit = tryFit(narrow - p.x);
  }
  if (!fit) {
    // Last resort: the smallest role, and texts may take more than two lines.
    fit = fitIn("label", textRight(ctx, right0, Infinity) - p.x, 4);
    if (fit) console.warn(`matrix ${id}: the table fits only with texts on more than two lines; shorten the labels`);
  }
  if (!fit) {
    console.warn(`matrix ${id}: the table does not fit the box in any role; text may overflow its cells`);
    const width = textRight(ctx, right0, Infinity) - p.x;
    const lh = ctx.lineHeight("label");
    fit = { role: "label", labelW: width * 0.35, colW: (width * 0.65) / nc, tableW: width, heads: p.columns.map((c) => [c]), labels: p.rows.map((r) => [r.label]),
      cells: p.rows.map((r) => r.cells.map((v) => (typeof v === "string" ? [v] : []))), headH: lhL + padY * 2, rowHs: p.rows.map(() => lh + padY * 2) };
  }
  const F = fit;

  // ---------------------------------------------------------------- schedule
  const st = ctx.dur.stagger;
  const byRow = (p.by ?? "row") === "row";
  const exit = p.until;
  const t0 = p.at + (titleLines.length ? ctx.dur.stagger * 3 : 0);
  // Each row (or column) is one beat; cells inside it follow at one stagger each.
  const beat = Math.max(ctx.dur.enter * 0.6, st * (byRow ? nc + 2 : nr + 2));
  const tHead = t0;
  const tCell = (r: number, c: number) => t0 + ctx.dur.enter * 0.5 + (byRow ? r * beat + (c + 1) * st : c * beat + r * st);
  const tLabel = (r: number) => (byRow ? tCell(r, -1) : t0 + ctx.dur.enter * 0.5 + r * st);
  const tLast = Math.max(...p.rows.flatMap((_, r) => p.columns.map((_, c) => tCell(r, c)))) + ctx.dur.enter;
  const fade = (at: number, rise = 0) => appear(ctx, at, exit, rise);

  // ---------------------------------------------------------------- nodes
  const out: Node[] = [];
  const role = F.role, lh = ctx.lineHeight(role);
  const y0 = Math.round(top(F));
  const tx = p.x, tw = F.tableW;
  const colX = (c: number) => tx + F.labelW + c * F.colW;
  const headY = y0 + titleH;
  const bodyY = headY + F.headH;
  const rowY = (r: number) => bodyY + F.rowHs.slice(0, r).reduce((a, b) => a + b, 0);
  const tableBottom = rowY(nr);
  const text = (key: string, x: number, y: number, s: string, r: TypeRole, color: "ink" | "inkMuted", tracks: Node["tracks"]) =>
    out.push({ id: `${id}-${key}`, kind: "text", x: px(x), y, text: s, role: r, color, mask: true, tracks });

  // Title.
  if (titleLines.length) out.push(...lines(ctx, { id: `${id}-title`, x: tx, y: y0, lines: titleLines, role: "label", color: "inkMuted", at: p.at, until: exit }));

  // Header: centred in each column, bottom-aligned so one-line and two-line headers share a baseline.
  F.heads.forEach((hl, c) => {
    const key = c === p.key;
    const at = byRow ? tHead + c * st : tCell(0, c) - st;
    hl.forEach((l, k) => {
      const w = ctx.measure(l, "label");
      text(`head-${c}-${k}`, colX(c) + (F.colW - w) / 2, headY + F.headH - padY - (hl.length - k) * lhL, l, "label", key ? "ink" : "inkMuted", fade(at, 6));
    });
  });
  // The header rule is heavier: it separates names from values.
  out.push({ id: `${id}-head-rule`, kind: "path", d: `M${px(tx)} ${px(bodyY)}H${px(tx + tw)}`, stroke: "ink", width: ctx.stroke,
    tracks: { draw: go(ctx, tHead, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(tHead) } });

  // Rows: a label, the cells, a hairline under each row except the last.
  p.rows.forEach((row, r) => {
    const ry = rowY(r), rh = F.rowHs[r]!;
    // The row's ink is centred in the row, not its line boxes. One-line texts of a row share one baseline: the row's
    // band is the x-height when any of its texts has lower case, else the cap height.
    const rowTexts = [...F.labels[r]!, ...row.cells.slice(0, nc).flatMap((v, c) => (typeof v === "string" ? F.cells[r]![c]! : []))];
    const band = rowTexts.some((t) => inkKind(ctx.system, role, t) === "x") ? "x" : rowTexts.join("") || "H";
    const topOf = (ls: string[]) => (ls.length === 1 ? centreInk(ctx, band, role, { y: ry, h: rh }) : centreInkLines(ctx, ls, role, { y: ry, h: rh }, lh));
    F.labels[r]!.forEach((l, k) => text(`label-${r}-${k}`, tx, topOf(F.labels[r]!) + k * lh, l, role, "ink", fade(tLabel(r), 6)));
    if (r < nr - 1) out.push({ id: `${id}-rule-${r}`, kind: "path", d: `M${px(tx)} ${px(ry + rh)}H${px(tx + tw)}`, stroke: "rule", width: ctx.stroke * 0.75,
      tracks: { draw: go(ctx, tLabel(r), 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(tLabel(r)) } });
    row.cells.forEach((v, c) => {
      if (c >= nc) return;
      const cx = colX(c) + F.colW / 2, cy = ry + rh / 2;
      const at = tCell(r, c);
      if (typeof v === "string") {
        const ls = F.cells[r]![c]!;
        ls.forEach((l, k) => {
          const w = ctx.measure(l, role);
          text(`cell-${r}-${c}-${k}`, cx - w / 2, topOf(ls) + k * lh, l, role, "ink", fade(at, 6));
        });
      } else {
        // A check, a cross or a dash, sized to the type and drawn as a stroke.
        const s = markW(role) * 0.5;
        const d = v === true ? `M${px(cx - s)} ${px(cy + s * 0.05)}L${px(cx - s * 0.3)} ${px(cy + s * 0.7)}L${px(cx + s)} ${px(cy - s * 0.65)}`
          : v === false ? `M${px(cx - s * 0.6)} ${px(cy - s * 0.6)}L${px(cx + s * 0.6)} ${px(cy + s * 0.6)}M${px(cx + s * 0.6)} ${px(cy - s * 0.6)}L${px(cx - s * 0.6)} ${px(cy + s * 0.6)}`
          : `M${px(cx - s * 0.45)} ${px(cy)}H${px(cx + s * 0.45)}`;
        out.push({ id: `${id}-mark-${r}-${c}`, kind: "path", d, stroke: v === true ? "positive" : "inkMuted", width: ctx.stroke * (v === true ? 2 : 1.5),
          cap: "round", join: "round", z: 2, tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("enter"), 1, "enter"), ...fade(at) } });
      }
    });
  });

  // The key column: an outline around the header and every cell, drawn once the table is full.
  if (p.key !== undefined && p.key >= 0 && p.key < nc) {
    const inset = Math.max(2, Math.round(padX * 0.25));
    const bx = colX(p.key) + inset, bw = F.colW - inset * 2, by = headY + inset, bh = tableBottom - headY - inset;
    const r = Math.min(ctx.radius, bw / 4);
    const d = `M${px(bx + r)} ${px(by)}H${px(bx + bw - r)}Q${px(bx + bw)} ${px(by)} ${px(bx + bw)} ${px(by + r)}V${px(by + bh - r)}Q${px(bx + bw)} ${px(by + bh)} ${px(bx + bw - r)} ${px(by + bh)}`
      + `H${px(bx + r)}Q${px(bx)} ${px(by + bh)} ${px(bx)} ${px(by + bh - r)}V${px(by + r)}Q${px(bx)} ${px(by)} ${px(bx + r)} ${px(by)}Z`;
    out.push({ id: `${id}-key`, kind: "path", d, stroke: "accent", width: ctx.stroke * 1.5, join: "round", z: 1,
      tracks: { draw: go(ctx, tLast, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(tLast) } });
  }

  // Every text box must be in the text-safe area.
  for (const nd of out) if (nd.kind === "text" && !textSafe(ctx, { x: nd.x, y: nd.y, w: ctx.measure(nd.text, nd.role), h: ctx.lineHeight(nd.role) }))
    console.warn(`matrix ${id}: "${nd.text}" is outside the text-safe area`);
  return out;
};
