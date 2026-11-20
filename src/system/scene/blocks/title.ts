// Title: a headline that fits its box. The lines rise out of their own masks, one after another.
//
// Rules this block enforces:
// - The title is never wider than its box, and never passes the text-safe area (the low band too).
// - It breaks at word boundaries only, into the fewest lines that fit. Among the breaks with that
//   number of lines, it takes the most even one (the smallest sum of squared slack), like a
//   balanced headline.
// - Phrasing: a line should not end on a short word (a, the, and, it) or split a number from the
//   word after it (42 / times), and a line above the last should not hold one word alone. Each costs a little, so it
//   changes a break only between near-equals.
// - Orphan rule: the last line must not hold one word alone while the line above it holds two or
//   more words ("goes each / time."). A break that has such an orphan is used only when no other break
//   with the same number of lines fits. When none fits, the title takes one more line if the measure
//   allows it (within `maxLines` and the box), that break has no orphan, and it adds no one-word line.
// - When the title needs more than `maxLines` lines, or more height than the box has, it follows `fit`
//   (blocks/fit.ts): "shrink" steps down to the next smaller type role (display, headline, body, caption), breaks
//   again and warns with both roles; "wrap" keeps the role on more lines; "throw" stops. Never in silence.
// - Explicit lines (an array) keep the author's breaks while they fit. A line that does not fit is
//   broken again with the rules above.
// - Lines leave at `until` the same way they came: they sink into their masks together, as one unit, then hide.
// - With `at` at 0 or before, the lines (line reveal) are shown at rest from frame 0, so a film can open on them.
// - `reveal: "word"`: the words fade in and rise a little, one after another, a stagger apart, in the
//   same layout and with the same safety checks as the lines. At `until` all words fade out together.
// - `reveal: "fade"`: the whole title fades in as one unit, with no rise and no mask (Ma, Nocturne).
//   `reveal: "cut"`: the whole title shows in one frame. Both leave as one unit at `until`.
// - The default reveal comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and
//   Nocturne, "line" elsewhere. A one-frame system (ctx.instant) always cuts.
// - `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.
//
// - `angle`: the title turns as one rigid unit about the top left corner of its box (x, y), by `angle` degrees
//   (-45 rises to the right, Primary's axis). `w` is the room along the axis. The safety check turns with it: each
//   line's glyph box is turned, and its bounding box must pass the text-safe area. A turned title shows and leaves
//   as one unit ("cut" or "fade"); a line or word reveal falls back to the system's text cut or fade.
// This file also exports `wordNodes`, the word-by-word reveal that the quote block shares.
// - `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).
import { pin } from "../screen";
import { appear, go, lines as maskedLines, textSafe as textSafeBox } from "../context";
import { vocabulary, type TitleReveal } from "../vocabulary";
import { onOff } from "./shape";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";
import type { TypeRole } from "../../systems";
import { caseCtx, lineSafe, overflow, room } from "./text";
import { fitOf, steppedDown, type FitPolicy } from "./fit";

export type TitleProps = {
  id?: string;
  /** The box, px. The title stays inside it. Default height: down to the bottom of the text-safe area. */
  x: number; y: number; w: number; h?: number;
  /** One string, or explicit lines. */
  text: string | string[];
  /** The type role to try first. Default: display. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** The most lines before the title steps down a type size. Default: 3. */
  maxLines?: number;
  /** "line": each line rises out of its mask. "word": the words fade in one after another. "fade": the whole
   *  title fades in as one unit. "cut": it shows in one frame. Default: the system's vocabulary. */
  enter?: TitleReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TitleReveal;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /**
   * When the title does not fit in `role` within `maxLines`: "shrink" steps down a role and warns; "wrap" keeps the
   * role and uses more lines while the box height allows, then throws; "throw" throws. Default: the system's (blocks/fit.ts).
   */
  fit?: FitPolicy;
  /** How the title leaves at `until`, always as one unit. "same" (default): the way it came. "fade": an opacity
   *  fade, with no move (a title at the top of the safe area then never passes its edge). "cut": one frame. */
  exit?: "same" | "fade" | "cut";
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  /** Turn the title by this many degrees about the top left corner of its box (-45: it rises to the right). Default 0. */
  angle?: number;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};

/**
 * Word-by-word reveal of placed lines: each word is its own text node at the x where it sits in its line,
 * so the resting frame matches the whole line. Words enter a stagger apart, in reading order, and fade in
 * with a small rise (never more than the line's masked overflow below, so the glyphs stay inside the box
 * that the safety check measured). All words fade out together at `until`, so no fragment stays alone.
 * Returns the nodes and the time the last word starts.
 */
export function wordNodes(ctx: Ctx, o: { id: string; lines: { text: string; x: number; y: number }[]; role: TypeRole; color: ColorRole; at: number; until?: number; keepCase?: boolean; scale?: number;
  /** Words set apart (quote's emphasis): on `line`, the words from `from` to `to` (not included), placed by `measure`. */
  em?: { line: number; from: number; to: number }[]; measure?: (s: string) => number }) {
  const out: Node[] = [];
  // `scale`: the words are set in the role, then scaled about each word's top left (quote fitted to the width).
  const sc = o.scale ?? 1;
  const rise = Math.min(12, overflow(ctx, o.role, true).bottom) * sc;
  let k = 0;
  o.lines.forEach((l, li) => {
    const words = l.text.split(" ");
    words.forEach((w, wi) => {
      if (!w) return;
      const before = words.slice(0, wi).join(" ");
      // A line with emphasised words places each word by the measure that counts them in their own face.
      const m = o.em?.some((e) => e.line === li) && o.measure ? o.measure : (t: string) => ctx.measure(t, o.role);
      const x = l.x + (wi ? m(before + " ") : 0) * sc;
      const until = o.until;
      const tracks = wordTracks(ctx, o.at + k * ctx.dur.stagger, until, rise);
      out.push({ id: `${o.id}-${li}-w${wi}`, kind: "text", x, y: l.y, text: w, role: o.role, color: o.color,
        ...(o.keepCase ? { keepCase: true } : {}), ...(sc !== 1 ? { origin: [0, 0] as [number, number] } : {}),
        tracks: sc !== 1 ? { ...tracks, scale: [{ t: 0, v: sc }] } : tracks });
      k++;
    });
  });
  return { nodes: out, last: o.at + Math.max(0, k - 1) * ctx.dur.stagger };
}

/** A word's fade and rise. A fade that does not fit before `until` becomes a cut, so keys stay in time order. */
function wordTracks(ctx: Ctx, at: number, until: number | undefined, rise: number) {
  if (until !== undefined && until <= at) return { opacity: [{ t: 0, v: 0 }] }; // it leaves before it comes: never shown
  if (ctx.instant) return appear(ctx, at, until, rise);
  return { opacity: onOff(ctx, at, until, "fade", "fade"), ...(rise && at > 0 && (until === undefined || until - at >= ctx.dur.enter) ? { y: go(ctx, at, rise, 0) } : {}) };
}

const STEPS: TypeRole[] = ["display", "headline", "body", "caption"];

type Fit = { role: TypeRole; lines: string[]; widths: number[] };

/**
 * A small cost for a weak line end: a short word (a, the, and, it ...) left at the end of a line, or a
 * number split from the word after it (42 / times). It moves a break only when the lines stay nearly as even.
 */
function phrasing(last: string, next: string): number {
  let c = 0;
  if (/^[A-Za-z]{1,3}$/.test(last)) c += 0.15;
  if (/^[−-]?[$€£]?[\d.,]+%?$/.test(last) && /^[A-Za-z]/.test(next)) c += 0.3;
  return c;
}

/** The best break of `words` into exactly k lines, or null. Line i may be `limit(i)` px wide. */
function breakInto(ctx: Ctx, words: string[], k: number, role: TypeRole, limit: (i: number) => number): string[] | null {
  const n = words.length;
  if (k > n) return null;
  const text = (a: number, b: number) => words.slice(a, b).join(" ");
  let best: { lines: string[]; cost: number } | null = null;
  // Every way to cut n words into k lines: choose k-1 cut points. Titles are short, so this is small.
  const cuts: number[] = [];
  const visit = (start: number, left: number) => {
    if (left === 0) {
      const bounds = [0, ...cuts, n];
      const ls: string[] = [];
      let cost = 0;
      for (let i = 0; i < k; i++) {
        const l = text(bounds[i]!, bounds[i + 1]!);
        const lw = ctx.measure(l, role), max = limit(i);
        if (lw > max) return;
        ls.push(l);
        cost += ((max - lw) / max) ** 2;
        if (i < k - 1) cost += phrasing(words[bounds[i + 1]! - 1]!, words[bounds[i + 1]!]!);
        // A lone word on a line above the last ("Half / the list goes / each time.") breaks the shape of the block.
        if (i < k - 1 && bounds[i + 1]! - bounds[i]! === 1 && n >= k + 2) cost += 0.3;
      }
      const lastWords = bounds[k]! - bounds[k - 1]!;
      const aboveWords = k > 1 ? bounds[k - 1]! - bounds[k - 2]! : 0;
      if (lastWords === 1 && aboveWords >= 2) cost += 100; // an orphan: used only when nothing else fits
      if (!best || cost < best.cost) best = { lines: ls, cost };
      return;
    }
    for (let c = start; c <= n - left; c++) {
      cuts.push(c);
      visit(c + 1, left - 1);
      cuts.pop();
    }
  };
  if (n > 18) {
    // Too many words to try every break: wrap greedily instead.
    const ls: string[] = [];
    let line = "";
    for (const wd of words) {
      const next = line ? `${line} ${wd}` : wd;
      if (!line || ctx.measure(next, role) <= limit(ls.length)) line = next;
      else { ls.push(line); line = wd; }
    }
    ls.push(line);
    return ls.length === k && ls.every((l, i) => ctx.measure(l, role) <= limit(i)) ? ls : null;
  }
  visit(1, k - 1);
  return (best as { lines: string[] } | null)?.lines ?? null;
}

/** A last line of one word under a line of two or more words. */
const orphaned = (ls: string[]) => ls.length > 1 && !ls[ls.length - 1]!.includes(" ") && ls[ls.length - 2]!.includes(" ");

/** Finds the largest role, from `first` down, at which the title fits the box. */
function fit(p: TitleProps, ctx: Ctx): Fit {
  const first = p.role ?? "display";
  const roles = [first, ...STEPS.filter((r) => r !== first && ctx.size(r) < ctx.size(first))].sort((a, b) => ctx.size(b) - ctx.size(a));
  const policy = fitOf(ctx, p.fit);
  // "wrap" keeps the first role and takes as many lines as the box holds.
  const maxLines = policy === "wrap" ? Infinity : p.maxLines ?? 3;
  const bottom = p.y + (p.h ?? ctx.safe.bottom - p.y);
  const given = Array.isArray(p.text) ? p.text : [p.text];
  const words = given.join(" ").split(/\s+/).filter(Boolean);
  for (const role of roles) {
    const lh = ctx.lineHeight(role);
    const rows = Math.min(maxLines, Math.floor((bottom - p.y) / lh + 1e-6));
    // Line i may reach the edge of the text-safe area for its own row, so a line in the low band is narrower.
    // A turned title (`angle`) is checked turned (turned()), so only its own width limits a line.
    const limit = (i: number) => (p.angle ? p.w : room(ctx, role, p.x, p.y + i * lh, 1, p.w));
    // Each given line keeps its place; a line that does not fit breaks into the fewest lines that do.
    const out: string[] = [];
    let ok = true;
    for (const g of given) {
      const ws = g.split(/\s+/).filter(Boolean);
      let done = false;
      for (let k = 1; k <= rows - out.length && !done; k++) {
        let ls = breakInto(ctx, ws, k, role, (i) => limit(out.length + i));
        // An orphan that no break into k lines avoids: one more line, when the measure allows it and it has none.
        if (ls && orphaned(ls) && k + 1 <= rows - out.length) {
          const more = breakInto(ctx, ws, k + 1, role, (i) => limit(out.length + i));
          const lone = (x: string[]) => x.filter((l) => !l.includes(" ")).length;
          if (more && !orphaned(more) && lone(more) <= lone(ls)) ls = more;
        }
        if (ls) { out.push(...ls); done = true; }
      }
      if (!done) { ok = false; break; }
    }
    if (ok) {
      steppedDown(`title ${p.id ?? "title"}`, words.join(" "), first, role, policy, true);
      return { role, lines: out, widths: out.map((l) => ctx.measure(l, role)) };
    }
    if (policy !== "shrink") break; // wrap and throw never step down a role
  }
  if (policy !== "shrink") throw new Error(`title ${p.id ?? "title"}: "${words.join(" ")}" does not fit its box in the ${first} role${policy === "wrap" ? " on any number of lines" : ` in ${p.maxLines ?? 3} lines`}. Shorten it, give a taller box, or set fit: "shrink".`);
  // Nothing fits: set the smallest role, one word per line at most, and say so.
  const role = roles[roles.length - 1]!;
  console.warn(`title ${p.id ?? "title"}: "${words.join(" ")}" does not fit its box at any type size`);
  return { role, lines: words, widths: words.map((l) => ctx.measure(l, role)) };
}

const titleNodes: Block<TitleProps> = (p0, ctx0) => {
  const id = p0.id ?? "title";
  const ctx = caseCtx(ctx0, p0.keepCase);
  // A title placed at the top of the text-safe area would put its glyphs above it (the glyph box and the mask's pad
  // reach above the line box). Move it down by exactly that overflow, so a scene can use ctx.safe.top as is. The pad
  // grows the mask; it never takes room from the text: the box keeps its height (it moves down with the title, as far
  // as the text-safe foot allows), so a box of exactly N line heights still holds N lines. B.measure gives the box
  // as drawn.
  const first = fit(p0, ctx);
  const minY = ctx.safe.top + overflow(ctx, first.role, true).top;
  const p = p0.y >= minY || p0.angle ? p0
    : { ...p0, y: minY, h: p0.h === undefined ? undefined : Math.max(p0.h - (minY - p0.y), Math.min(p0.h, ctx.safe.bottom - minY)) };
  const f = p === p0 ? first : fit(p, ctx);
  const lh = ctx.lineHeight(f.role);
  const align = p.align ?? "left";
  // Where each line sits: its left edge after alignment, and its box for the safety check.
  const placed = f.lines.map((text, i) => {
    const width = p.angle ? p.w : room(ctx, f.role, p.x, p.y + i * lh, 1, p.w);
    const lw = f.widths[i]!;
    const lx = align === "left" ? p.x : align === "right" ? p.x + width - lw : p.x + (width - lw) / 2;
    if (!p.angle && !lineSafe(ctx, f.role, { x: lx, y: p.y + i * lh, w: lw, h: lh }, true)) {
      console.warn(`title ${id}: line "${text}" is outside the text-safe area`);
    }
    return { text, x: lx, y: p.y + i * lh, width };
  });
  // A turned title: every line turns about (p.x, p.y) as one rigid unit, and shows as one unit.
  if (p.angle) return turned(ctx, p, f, placed, id);
  // A one-frame system overrides only the vocabulary default; a reveal the scene states is kept.
  const reveal = p.reveal ?? (ctx.instant ? "line" : vocabulary(ctx).title);
  if (p.exit && p.exit !== "same" && p.until !== undefined) {
    // Build the entrance with no exit, then replace every node's opacity end with the asked exit.
    const shown = title({ ...p0, reveal, exit: "same", until: undefined }, ctx0);
    const off = onOff(ctx, 0, p.until, "cut", p.exit === "cut" ? "cut" : "fade").slice(1);
    // An exit before the entrance ends cuts the entrance short: keys stay in time order.
    const before = (ks: Key[] | undefined) => (ks ?? [{ t: 0, v: 1 }]).filter((k) => k.t < p.until!);
    return shown.map((n) => (n.kind === "text" ? { ...n, tracks: { ...n.tracks, opacity: [...before(n.tracks?.opacity), ...off] } } : n));
  }
  if (reveal === "fade" || reveal === "cut") {
    // The whole title as one unit: every line on the same tracks.
    const tracks = { opacity: reveal === "fade" ? onOff(ctx, p.at, p.until, "fade", "fade") : onOff(ctx, p.at, p.until, "cut", "cut") };
    return placed.map((l, i): Node => ({ id: `${id}-${i}`, kind: "text", x: p.x, y: l.y, text: l.text, role: f.role,
      color: p.color ?? "ink", ...(align !== "left" ? { width: l.width, align } : {}), ...(p.keepCase ? { keepCase: true } : {}), tracks }));
  }
  if (reveal === "word") {
    return wordNodes(ctx, { id, lines: placed, role: f.role, color: p.color ?? "ink", at: p.at, until: p.until, keepCase: p.keepCase }).nodes;
  }
  const nodes: Node[] = maskedLines(ctx, { id, x: p.x, y: p.y, lines: f.lines, role: f.role, color: p.color ?? "ink", at: p.at, until: p.until });
  return nodes.map((n, i) => {
    if (n.kind !== "text") return n;
    const withCase = p.keepCase ? { ...n, keepCase: true } : n;
    return align === "left" ? withCase : { ...withCase, width: placed[i]!.width, align };
  });
};

/** A point turned by `deg` degrees about a pivot (screen coordinates: y down, so a negative angle turns it up). */
const turn = (px: number, py: number, cx: number, cy: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c];
};

/** The lines of a turned title that leave the text-safe area: each line's glyph box, turned, must keep every corner in it. */
function turnedOutside(ctx: Ctx, p: TitleProps, f: Fit, placed: { text: string; x: number; y: number }[]): string[] {
  if (ctx.system.bleed?.includes(f.role)) return [];
  const lh = ctx.lineHeight(f.role), o = overflow(ctx, f.role, false);
  return placed.filter((l, i) => {
    const lw = f.widths[i]!, y0 = l.y - o.top, y1 = l.y + lh + o.bottom;
    return [[l.x, y0], [l.x + lw, y0], [l.x, y1], [l.x + lw, y1]].map(([a, b]) => turn(a!, b!, p.x, p.y, p.angle!))
      .some(([a, b]) => !textSafeBox(ctx, { x: a, y: b, w: 0, h: 0 }));
  }).map((l) => l.text);
}

/**
 * True when a turned title (`angle`) keeps every letter in the text-safe area: the check the block makes, for a scene
 * that searches for the widest room along the axis (Primary's question on its circle).
 */
export function turnedSafe(p: TitleProps, ctx0: Ctx): boolean {
  const ctx = caseCtx(ctx0, p.keepCase);
  const f = fit(p, ctx), lh = ctx.lineHeight(f.role);
  const align = p.align ?? "left";
  const placed = f.lines.map((text, i) => ({ text, x: align === "left" ? p.x : align === "right" ? p.x + p.w - f.widths[i]! : p.x + (p.w - f.widths[i]!) / 2, y: p.y + i * lh }));
  return turnedOutside(ctx, p, f, placed).length === 0;
}

/** The nodes of a turned title (`angle`): each line keeps its place in the unturned box, turned about (x, y). */
function turned(ctx: Ctx, p: TitleProps, f: Fit, placed: { text: string; x: number; y: number; width: number }[], id: string): Node[] {
  const lh = ctx.lineHeight(f.role), deg = p.angle!;
  const align = p.align ?? "left";
  // The safety check, turned: every corner of each line's turned glyph box must be in the text-safe area.
  for (const t of turnedOutside(ctx, p, f, placed)) console.warn(`title ${id}: turned line "${t}" is outside the text-safe area`);
  const stated = p.reveal === "fade" || p.reveal === "cut" ? p.reveal : undefined;
  const reveal = stated ?? (ctx.instant ? "cut" : vocabulary(ctx).text === "cut" ? "cut" : "fade");
  const opacity = onOff(ctx, p.at, p.until, reveal, p.exit === "cut" ? "cut" : reveal === "cut" && p.exit !== "fade" ? "cut" : "fade");
  return placed.map((l, i): Node => {
    // The node's origin is its left edge at mid height ([0, 0.5]): turn that point, then turn the node about it.
    const [ox, oy] = turn(p.x, l.y + lh / 2, p.x, p.y, deg);
    return { id: `${id}-${i}`, kind: "text", x: ox, y: oy - lh / 2, text: l.text, role: f.role, color: p.color ?? "ink",
      ...(align !== "left" ? { width: l.width, align } : {}), ...(p.keepCase ? { keepCase: true } : {}),
      tracks: { opacity, rotate: [{ t: 0, v: deg }] } };
  });
}

export const title: Block<TitleProps> = (p, ctx) => (p.pinned ? pin(titleNodes(p, ctx)) : titleNodes(p, ctx));
