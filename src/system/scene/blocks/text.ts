// Text: one placed line, or a few lines, in one type role. The lines fade in and rise together
// (`reveal: "fade"`: they only fade; `reveal: "cut"`: they show in one frame, at full opacity).
//
// Rules this block enforces:
// - Every line is measured before it is placed.
// - The text box never passes the text-safe area, measured with the line's rendered glyph box. Below the low band top, the box ends at the low
//   band edge. A system with `bleed` lets display text pass the safe area.
// - A line that is wider than its box wraps at word boundaries. Lines never wrap inside a word.
// - No orphan: a lone last word under a line of three or more words takes a word from that line. Under a line of
//   two words, the lines wrap to a narrower measure that keeps their number and leaves no lone word, when one exists.
// - Align (left, center, right) works within the box width, so the text lines up with the box edges.
// - At `until`, the lines leave together, as one unit (a fade, or one frame for "cut"). After that they stay hidden.
// - The default reveal comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and Nocturne,
//   "cut" in the opaque print systems (Cutout, Riso, Primary), "rise" elsewhere.
// - With `at` at 0 or before, the lines are shown at rest from frame 0, so a film can open on them.
// - `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.
// The helpers `room`, `wrap` and `caseCtx` are shared with the title, typeOn and kineticWords blocks.
// - `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).
import { pin } from "../screen";
import { appear, go, textSafe } from "../context";
import { vocabulary, type TextReveal } from "../vocabulary";
import { stamped } from "./shape";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import type { TypeRole } from "../../systems";

export type TextProps = {
  id?: string;
  /** The top left corner of the text box, px. */
  x: number; y: number;
  /** The width of the box. Lines align within it, and a longer line wraps. Default: all the room to the safe edge. */
  w?: number;
  /** One string, or explicit lines. */
  text: string | string[];
  role: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** Lines enter one after another, a stagger apart. Default: all lines enter together. */
  stagger?: boolean;
  /** "rise": fade and a 12 px rise. "fade": opacity only. "cut": one frame, full opacity. Default: the system's vocabulary. */
  enter?: TextReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TextReveal;
  /** Old form of `enter`: false is "fade". `enter` wins when both are given. */
  rise?: boolean;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};

/** A context whose `measure` keeps the case as written, for a block with `keepCase`. Else the context itself. */
export function caseCtx(ctx: Ctx, keepCase?: boolean): Ctx {
  return keepCase ? { ...ctx, measure: (t, r) => ctx.measure(t, r, { keepCase: true }) } : ctx;
}

/**
 * How far the rendered box of a text line can reach above (and below) its line box, px. A plain
 * line's glyph box is about 1.4 times the type size tall, so with tight leading it overflows the
 * line box. A masked line's clip box reaches at least 0.14 of the size above and 0.3 below, and more where
 * the font's ink needs it (layout.maskPad); the larger of the two counts. The clip box is not text: the safe test
 * reads the glyph box, so these minimums are what it counts.
 * Checks such as hyperframes check measure these boxes, so the safe test uses them too.
 */
export function overflow(ctx: Ctx, role: TypeRole, masked = false): { top: number; bottom: number } {
  const size = ctx.size(role);
  const o = Math.max(0, Math.ceil((size * 1.4 - ctx.lineHeight(role)) / 2));
  // A masked line's glyph box is clipped, but checks still read it, so it counts as well.
  if (masked) return { top: Math.max(o, Math.round(size * 0.14)), bottom: Math.max(o, Math.round(size * 0.3)) };
  return { top: o, bottom: o };
}

/**
 * textSafe for a line: the band its ink can reach, from the font's ink table (the tallest ascender above the baseline,
 * the deepest descender below it, where Chrome puts the baseline in the line box: inkBand). The frame check measures the
 * same ink, so the build and the check agree (before, a 1.4 x size box rounded up said a headline at the text-safe top
 * did not fit, where the check found its ink inside: an agent's Title film). A masked line keeps the larger box its mask
 * clips (`overflow`). A font with no ink table uses `overflow`.
 */
export function lineSafe(ctx: Ctx, role: TypeRole, b: { x: number; y: number; w: number; h: number }, masked = false): boolean {
  if (ctx.system.bleed?.includes(role)) return true;
  if (!masked) return textSafe(ctx, b, role);
  const o = overflow(ctx, role, masked);
  return textSafe(ctx, { x: b.x, y: b.y - o.top, w: b.w, h: b.h + o.top + o.bottom });
}

/** The right edge that text in `role` may reach on a row from `top` to `top + h`. */
export function edge(ctx: Ctx, role: TypeRole, top: number, h: number): number {
  if (ctx.system.bleed?.includes(role)) return ctx.width;
  return top + h > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right;
}

/** The width that text may use from x, for `rows` rows of `role` from y, capped by `w`. */
export function room(ctx: Ctx, role: TypeRole, x: number, y: number, rows: number, w?: number): number {
  const limit = edge(ctx, role, y, rows * ctx.lineHeight(role)) - x;
  return Math.max(0, w === undefined ? limit : Math.min(w, limit));
}

/** Breaks one string into lines no wider than `width`, at spaces only (greedy, then no orphan). A word wider than the width keeps a line alone. */
export function wrap(ctx: Ctx, text: string, role: TypeRole, width: number, noBalance = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measure(next, role) <= width) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  // No orphan: a lone last word under a line of three or more words takes one word from that line, when it fits.
  const n = out.length;
  if (n > 1 && !out[n - 1]!.includes(" ")) {
    const above = out[n - 2]!.split(" ");
    const moved = `${above[above.length - 1]} ${out[n - 1]}`;
    if (above.length >= 3 && ctx.measure(moved, role) <= width) { out[n - 2] = above.slice(0, -1).join(" "); out[n - 1] = moved; }
    // Under a line of two words: a narrower measure that keeps the number of lines and leaves no lone word
    // ("goes each / time." becomes "list goes / each time."), when one exists down to 60 % of the width.
    else if (above.length === 2 && !noBalance) {
      for (let f = 0.97; f >= 0.6; f -= 0.03) {
        const again = wrap(ctx, text, role, width * f, true);
        if (again.length !== n) break;
        if (again[n - 1]!.includes(" ")) return again;
      }
    }
  }
  return out.length ? out : [""];
}

/**
 * Lays the lines out in a box from (x, y). The width is the room for all the rows, so the box stays
 * text-safe in the low band too. Wrapping can add rows, so it settles in a few passes.
 */
export function layoutLines(ctx: Ctx, text: string | string[], role: TypeRole, x: number, y: number, w?: number) {
  const given = Array.isArray(text) ? text : [text];
  let rows = given.length;
  let width = room(ctx, role, x, y, rows, w);
  let out: string[] = given;
  for (let pass = 0; pass < 4; pass++) {
    out = given.flatMap((l) => (ctx.measure(l, role) <= width ? [l] : wrap(ctx, l, role, width)));
    if (out.length === rows) break;
    rows = out.length;
    width = room(ctx, role, x, y, rows, w);
  }
  return { lines: out, width };
}

const textNodes: Block<TextProps> = (p, ctx0) => {
  const id = p.id ?? "text";
  const ctx = caseCtx(ctx0, p.keepCase);
  const align = p.align ?? "left";
  const lh = ctx.lineHeight(p.role);
  const { lines: ls, width } = layoutLines(ctx, p.text, p.role, p.x, p.y, p.w);
  const reveal: TextReveal = ctx.instant ? "rise" : p.reveal ?? (p.rise === false ? "fade" : p.rise === true ? "rise" : vocabulary(ctx).text);
  const out: Node[] = [];
  ls.forEach((line, i) => {
    const lw = ctx.measure(line, p.role);
    const lx = align === "left" ? p.x : align === "right" ? p.x + width - lw : p.x + (width - lw) / 2;
    const box = { x: lx, y: p.y + i * lh, w: lw, h: lh };
    if (lw > width + 0.5 || !lineSafe(ctx, p.role, box)) {
      console.warn(`text ${id}: line "${line}" does not fit its box or the text-safe area`);
    }
    const at = p.at + (p.stagger ? i * ctx.dur.stagger : 0);
    // A left-aligned line needs no fixed width. An aligned line gets the box width, so the renderer aligns it.
    out.push({ id: `${id}-${i}`, kind: "text", x: p.x, y: box.y, text: line, role: p.role, color: p.color ?? "ink",
      ...(align !== "left" ? { width, align } : {}), ...(p.keepCase ? { keepCase: true } : {}),
      tracks: reveal === "cut" ? { opacity: stamped(p.at <= 0 ? 0 : at, p.until) }
        : p.at <= 0 ? { opacity: [{ t: 0, v: 1 }, ...(p.until !== undefined ? go(ctx, p.until, 1, 0, "exit") : [])] }
        : appear(ctx, at, p.until, reveal === "fade" ? 0 : 12) });
  });
  return out;
};

export const text: Block<TextProps> = (p, ctx) => (p.pinned ? pin(textNodes(p, ctx)) : textNodes(p, ctx));
