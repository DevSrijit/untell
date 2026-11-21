// Quote: one statement in a large type role, with the speaker below a thin rule.
//
// Rules this block enforces:
// - The statement uses the largest role that fits the box: display, then headline, then body.
//   Each role has a line limit, so a long quote steps down in size before it becomes a wall of text.
// - Lines are balanced: every line has about the same width, and the last line never holds one word alone.
// - The line length stops near 30 characters, so a wide frame does not give long, hard-to-read lines.
// - The opening quote mark hangs to the left, so the letters of every line share one left edge.
// - At 9:16, text below the low band ends before the platform buttons. The block wraps narrower to do this.
// - Lines rise out of their own masks one after another. Then the rule draws and the attribution appears.
// - If the quote cannot fit in any role, the block uses the smallest role and logs a warning.
// - Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
// - `reveal: "word"`: the words of the statement fade in one after another, a stagger apart, in the same
//   layout and with the same safety checks (Nocturne). Default "line": each line rises out of its mask.
// - `statements`: one speaker, several statements in the same place. The rule, the name and the role
//   enter after the first statement and stay while the statements change. The block picks one type
//   role and one slot that fit every statement, so the attribution never moves. A statement leaves at
//   its `until`, or in time for the next one to start, and two statements never show at once.
// - `emphasis`: one word of the statement (or a few words in a row) set apart. Where the statement's face has a true
//   italic (italics.gen.ts), the word is set in it. Where it has none, the word takes the system's accent text colour
//   (accentText). The block never slants an upright face. A system whose accent text is its ink colour and whose face
//   has no italic cannot set the word apart: the block says so and sets it as the rest. The emphasised word is
//   measured in its own face, so a line with it keeps its width. With no emphasis, each line is one node.
//
// This file also exports `wrapBalanced`, the line breaker that the other narrative blocks use.
import { DIRECTION } from "../../direction";
import { MEDIA_SPEC } from "../../media-spec";
import { appear, crisp, go, lines, px, textSafe } from "../context";
import { colorOf, hasItalic } from "../layout";
import type { ColorRole } from "../roles";
import { builtNodes } from "./handover";
import { photo } from "./photo";
import { wordNodes } from "./title";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";

// ------------------------------------------------------------------ balanced line breaking

/** Words that read badly at the end of a line, because they belong to the next word. */
const WEAK_END = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "and", "or", "for", "with", "as", "is", "we", "i"]);

/**
 * Breaks `text` into lines no wider than `maxW`, with all lines about the same width.
 * It finds the least number of lines that fits, then picks the breaks that make the
 * line widths most equal (least sum of squared slack). The last line holds at least two words
 * when the text has enough words. A line does not end on a short word like "a" or "the" when
 * another break works. Returns null when a single word is wider than `maxW` or the text needs
 * more than `maxLines` lines.
 */
export function wrapBalanced(text: string, maxW: number, measure: (s: string) => number, maxLines = Infinity): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const n = words.length;
  const memo = new Map<string, number>();
  const W = (i: number, j: number) => {
    const k = `${i}:${j}`;
    let v = memo.get(k);
    if (v === undefined) { v = measure(words.slice(i, j).join(" ")); memo.set(k, v); }
    return v;
  };
  if (words.some((_, i) => W(i, i + 1) > maxW + 0.5)) return null;
  if (W(0, n) <= maxW + 0.5) return [words.join(" ")];
  // The least number of lines: a greedy fill gives it.
  let count = 0;
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && W(i, j + 1) <= maxW + 0.5) j++;
    count++;
    i = j;
  }
  for (let k = count; k <= Math.min(maxLines, n); k++) {
    const best = breaks(k);
    if (best) return best;
  }
  return null;

  // Exactly k lines; null when no break set fits.
  function breaks(k: number): string[] | null {
    const minLast = n >= 2 * k ? 2 : 1;
    // cost[j][l]: the best cost of setting words 0..j-1 on l lines; from[j][l]: where the last line starts.
    const cost: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
    const from: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(-1));
    cost[0]![0] = 0;
    for (let l = 1; l <= k; l++) {
      for (let j = 1; j <= n; j++) {
        for (let i = l - 1; i < j; i++) {
          if (cost[i]![l - 1] === Infinity) continue;
          const w = W(i, j);
          if (w > maxW + 0.5) continue;
          if (l === k && j === n && j - i < minLast) continue;
          const slack = maxW - w;
          // A line that ends on a short joining word costs more; a line that ends a phrase costs less.
          const last = words[j - 1]!;
          const weak = j < n && WEAK_END.has(last.toLowerCase()) ? (maxW * 0.2) ** 2 : 0;
          const phrase = j < n && /[.,;:!?]$/.test(last) ? (maxW * 0.15) ** 2 : 0;
          const c = cost[i]![l - 1]! + slack * slack + weak - phrase;
          if (c < cost[j]![l]!) { cost[j]![l] = c; from[j]![l] = i; }
        }
      }
    }
    if (cost[n]![k] === Infinity) return null;
    const out: string[] = [];
    for (let j = n, l = k; l > 0; l--) {
      const i = from[j]![l]!;
      out.unshift(words.slice(i, j).join(" "));
      j = i;
    }
    return out;
  }
}

/** The right edge that text may reach when its box goes below `bottom`: the low band at 9:16 ends earlier. */
export function textRight(ctx: Ctx, right: number, bottom: number): number {
  return bottom > ctx.safe.lowBandTop ? Math.min(right, ctx.safe.lowBandRight, ctx.safe.right) : Math.min(right, ctx.safe.right);
}

// ------------------------------------------------------------------ the block

export type QuoteProps = {
  id?: string;
  /** The block's box in px. The quote and the attribution fit inside it, centred on its height. */
  x: number; y: number; w: number; h: number;
  /** The statement, without quote marks. The block adds curly marks. Not used with `statements`. */
  text?: string;
  /**
   * Several statements by the same speaker, each in the same place, one after another. Each starts at its
   * own `at` and leaves at its `until` (default: in time for the next statement; the last one: the block's
   * `until`). The rule, the name and the role stay on screen while the statements change.
   * With statements, set the block's `at` to the first statement's `at`.
   */
  statements?: { text: string; at: number; until?: number; picture?: string; emphasis?: string }[];
  /**
   * One word of the statement, or a few words in a row, as the text writes them ("never"): set in the true italic of
   * the statement's face when the kit has one, else in the system's accent text colour. Never a slanted upright face.
   * A statement in `statements` gives its own `emphasis`.
   */
  emphasis?: string;
  /**
   * A picture under the statement: a prepared photo (media name) that fills the frame, dimmed behind type
   * (plate-dim: its light keeps the ink at 4.5:1), moving by the system's picture motion. The statement sits on it at
   * the width the block sets. A statement's own `picture` changes it: the next picture dissolves in under the next
   * statement. A picture beside the statement (stacked, or across its edge) is not this block's layout.
   */
  picture?: string;
  /**
   * "width": each statement is set in its role and then scaled so its widest line spans the box (FILL of the text
   * width), on the number of lines that sets it largest. "role" (the default, except in a system whose compose is
   * "fill", Nocturne): the role's size, about 30 characters a line.
   */
  fit?: "width" | "role";
  /** Who said it. */
  name: string;
  /** The speaker's job or relation, for example "Head of Nursing, Telofyngri Clinic". */
  job?: string;
  /** Force one type role for the statement. Default: the largest that fits. Before, this was `size`, and `role`
   *  held the job: both old forms still work, with a warning (a `role` that is not a type role is read as the job). */
  role?: "display" | "headline" | "body" | (string & {});
  /** @deprecated The old name of `role` (the statement's type role). */
  size?: "display" | "headline" | "body";
  /** "line" (default): each line rises out of its mask. "word": the words fade in one after another. */
  enter?: "line" | "word";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "line" | "word";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  at: number;
  /** When the quote starts to leave (the attribution too). */
  until?: number;
};

const OPEN = "“", CLOSE = "”";

/** How a role sets the emphasised words apart: its true italic, else the accent text colour; null when it cannot. */
type EmStyle = { italic: true } | { color: ColorRole };
function emStyle(ctx: Ctx, role: TypeRole): EmStyle | null {
  if (hasItalic(ctx.system, role)) return { italic: true };
  return colorOf(ctx.system, "accentText") !== colorOf(ctx.system, "ink") ? { color: "accentText" } : null;
}

/** The words of `text` that `emphasis` names (the first run that matches, by letters and case-blind), or null. */
function emWords(text: string, emphasis: string | undefined): { from: number; to: number } | null {
  if (!emphasis?.trim()) return null;
  const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const ws = text.trim().split(/\s+/).map(bare), es = emphasis.trim().split(/\s+/).map(bare);
  for (let k = 0; k + es.length <= ws.length; k++) if (es.every((e, j) => ws[k + j] === e)) return { from: k, to: k + es.length };
  return null;
}

/**
 * A measure for a role that counts the emphasised words in their italic face (a word that is wider in italic widens its
 * line): the upright width, plus each emphasised word's italic width less its upright width. The plain measure when no
 * word is set in italic.
 */
function emMeasure(ctx: Ctx, role: TypeRole, words: string[]): (s: string) => number {
  const m = (s: string) => ctx.measure(s, role);
  if (!words.length || !hasItalic(ctx.system, role)) return m;
  const delta = new Map(words.map((w) => [w, ctx.measure(w, role, { italic: true }) - m(w)]));
  return (s: string) => { let d = 0; for (const w of s.split(" ")) d += delta.get(w) ?? 0; return m(s) + d; };
}

/** The emphasised words of each statement, as the statement writes them (with their marks). */
const emTokens = (text: string, em: { from: number; to: number } | null) => (em ? text.trim().split(/\s+/).slice(em.from, em.to) : []);
const MAX_LINES: Record<"display" | "headline" | "body", number> = { display: 4, headline: 8, body: 10 };

/** The statements' lines (one list per statement) in one role, the attribution lines, and the height of the tallest. */
type Layout = { role: TypeRole; quotes: string[][]; attr: string[]; height: number };

/** Lays every statement out in `role` within a text width; null when one does not fit. */
function layoutIn(texts: string[], p: QuoteProps, ctx: Ctx, role: "display" | "headline" | "body", width: number, loose = false, em: string[] = []): Layout | null {
  const m = emMeasure(ctx, role, em);
  const hang = m(OPEN);
  // About 30 characters a line: a quote reads as phrases, not as a paragraph.
  const cap = (ctx.measure("abcdefghijklmnopqrstuvwxyz", role) / 26) * 30;
  const maxW = Math.min(width - hang, cap) - m(CLOSE);
  if (maxW <= 0) return null;
  const quotes: string[][] = [];
  for (const t of texts) {
    const q = wrapBalanced(t, maxW, m, loose ? Infinity : MAX_LINES[role]);
    if (!q) return null;
    quotes.push(q);
  }
  // The attribution starts at the hang, like the quote's letters, so it has the hang less to use.
  const attr = attribution(p, ctx, width - hang, loose ? Infinity : 3);
  if (!attr) return null;
  const rows = Math.max(...quotes.map((q) => q.length));
  const height = rows * ctx.lineHeight(role) + gapAfterQuote(ctx, role) + ruleGap(ctx) * 2 + attrHeight(ctx, attr);
  return { role, quotes, attr, height };
}

const gapAfterQuote = (ctx: Ctx, role: TypeRole) => Math.round(ctx.size(role) * 0.45);
const ruleGap = (ctx: Ctx) => Math.round(ctx.size("caption") * 0.6);
/** The name (caption) and the role (label, up to `maxLines` lines). */
function attribution(p: QuoteProps, ctx: Ctx, width: number, maxLines: number): string[] | null {
  if (ctx.measure(p.name, "caption") > width) return null;
  if (!p.role) return [];
  return wrapBalanced(p.role, width, (s) => ctx.measure(s, "label"), maxLines);
}
const attrHeight = (ctx: Ctx, roleLines: string[]) => ctx.lineHeight("caption") + roleLines.length * ctx.lineHeight("label");

/** How much of the text width a statement fitted to the width spans (Nocturne's signature asks 85 % of the safe width). */
const FILL = 0.92;
/** The most a fitted statement scales its role: a two-word statement does not grow past the frame's scale. */
const FILL_MAX = 2.4;

/** A statement fitted to the width: its lines in `role`, and the scale that sets its widest line (with the marks) at FILL. */
type Fitted = { lines: string[]; scale: number };

/** The least a fitted statement scales its role: a long statement steps down toward the headline's size, no further. */
const FILL_MIN = 0.6;

/**
 * The lines and scale that set `text` largest with its ink spanning FILL of `width` (the hanging open mark and the
 * close mark counted) in at most `maxH` px of height, or null. Two words a line or more, when that fits: a column of
 * single words is not a statement.
 */
function fitWidth(text: string, ctx: Ctx, role: "display" | "headline" | "body", width: number, maxH: number, em: string[] = []): Fitted | null {
  const m = emMeasure(ctx, role, em);
  const lh = ctx.lineHeight(role);
  const words = text.trim().split(/\s+/);
  const span = (ls: string[]) => m(OPEN) + Math.max(...ls.map((l, i) => m(l) + (i === ls.length - 1 ? m(CLOSE) : 0)));
  const options: (Fitted & { k: number })[] = [];
  for (let k = 1; k <= Math.min(MAX_LINES[role], words.length); k++) {
    // The narrowest wrap that gives k lines: the balanced breaks at a width found by halving.
    let lo = Math.max(...words.map((w) => m(w))), hi = m(text) + 1, got: string[] | null = null;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2, q = wrapBalanced(text, mid, m, k);
      if (q && q.length <= k) { hi = mid; got = q; } else lo = mid;
    }
    got ??= wrapBalanced(text, hi, m, k);
    if (!got || got.length !== k) continue;
    const scale = Math.min(FILL_MAX, (width * FILL) / span(got));
    if (scale >= FILL_MIN && k * lh * scale <= maxH) options.push({ lines: got, scale, k });
  }
  const pairs = options.filter((o) => o.k <= Math.max(1, Math.floor(words.length / 2)));
  const pool = pairs.length ? pairs : options;
  return pool.reduce<Fitted | null>((best, o) => (!best || o.scale > best.scale + 1e-6 ? { lines: o.lines, scale: o.scale } : best), null);
}

export const quote: Block<QuoteProps> = (p, ctx) => {
  const id = p.id ?? "quote";
  // One statement (text, at, until) or several. They share one layout.
  const list: { text: string; at: number; until?: number; picture?: string; emphasis?: string }[] = p.statements?.length ? [...p.statements].sort((a, b) => a.at - b.at)
    : [{ text: p.text ?? "", at: p.at, until: p.until, picture: p.picture, emphasis: p.emphasis }];
  if (p.picture && list[0] && !list[0].picture) list[0] = { ...list[0], picture: p.picture };
  const texts = list.map((st) => st.text);
  // The emphasised words of each statement; one that the statement does not hold is said, and left out.
  const ems = list.map((st) => {
    const e = emWords(st.text, st.emphasis);
    if (st.emphasis && !e) console.warn(`quote ${id}: the emphasis "${st.emphasis}" is not a word of the statement "${st.text.slice(0, 40)}"`);
    return e;
  });
  const emAll = list.flatMap((st, i) => emTokens(st.text, ems[i]!));
  const roles = p.size ? [p.size] : (["display", "headline", "body"] as const);
  const pick = (width: number) => {
    for (const r of roles) {
      const l = layoutIn(texts, p, ctx, r, width, false, emAll);
      if (l && l.height <= p.h) return l;
    }
    return null;
  };
  // First at the box width. If the text then reaches below the low band, wrap again at the narrower width there.
  const full = Math.min(p.x + p.w, ctx.safe.right) - p.x;
  let L = pick(full);
  if (L && p.y + (p.h - L.height) / 2 + L.height > ctx.safe.lowBandTop) {
    const narrow = textRight(ctx, p.x + p.w, Infinity) - p.x;
    if (narrow < full) L = pick(narrow);
  }
  if (!L) {
    // Last resort: body with no line limit. The quote may then run past the box; say so.
    console.warn(`quote ${id}: the quote is too long for the box; it uses body with no line limit and may overflow`);
    const narrow = textRight(ctx, p.x + p.w, Infinity) - p.x;
    L = layoutIn(texts, p, ctx, "body", narrow, true, emAll) ?? { role: "body", quotes: texts.map((t) => [t]), attr: p.role ? [p.role] : [], height: p.h };
  }

  const role = L.role;
  const lh = ctx.lineHeight(role);
  const style = ems.some(Boolean) ? emStyle(ctx, role) : null;
  if (ems.some(Boolean) && !style) console.warn(`quote ${id}: ${ctx.system.name} has no italic for its ${role} face and its accent text is its ink colour, so the emphasis is set as the rest of the statement`);
  const mEm = emMeasure(ctx, role, style && "italic" in style ? emAll : []);
  const hang = ctx.measure(OPEN, role);
  // Fitted to the width (fit "width", the default in a system whose compose is "fill"): each statement scales its role so
  // its widest line spans the text width, on the line count that sets it largest. The attribution keeps its slot under
  // the tallest statement.
  const fill = p.fit === "width" || (p.fit === undefined && DIRECTION[ctx.system.id]?.compose?.kind === "fill");
  const attrH = gapAfterQuote(ctx, role) + ruleGap(ctx) * 2 + attrHeight(ctx, L.attr);
  let fits: (Fitted | null)[] = list.map(() => null);
  // A fitted statement keeps the full text width, so it stays above the low band at 9:16 (under it the platform's
  // buttons narrow the width): its room is the box down to the low band's top, and the attribution follows under it.
  const room = Math.min(p.h - attrH, ctx.safe.lowBandTop - p.y);
  if (fill && room > lh && (role === "display" || role === "headline" || role === "body")) fits = texts.map((t, i) => fitWidth(t, ctx, role, full, room, emTokens(t, ems[i]!)));
  const fitted = fits.some(Boolean);
  const quotes = list.map((_, i) => fits[i]?.lines ?? L!.quotes[i]!);
  const scales = list.map((_, i) => fits[i]?.scale ?? 1);
  const rowsH = Math.max(...quotes.map((q, i) => q.length * lh * scales[i]!));
  const height = rowsH + attrH;
  const top = Math.round(p.y + Math.max(0, fitted ? (room - rowsH) / 2 : (p.h - height) / 2));
  const letterX = p.x + hang * Math.max(...scales);
  const out: Node[] = [];
  // Lines follow one another at three staggers, like phrases, but never slower than about half an
  // entrance, so a slow system does not drag.
  const per = Math.min(ctx.dur.stagger * 3, ctx.dur.enter * 0.6);

  // Each statement. The first line carries the hanging open mark; the last line carries the close mark.
  let firstLanded = 0, lastLanded = 0;
  list.forEach((st, si) => {
    // Every statement's letters share one left edge (the attribution's): the open mark hangs to its left at its scale.
    const q = quotes[si]!, sc = scales[si]!, slh = lh * sc, x0 = letterX - hang * sc;
    const text = q.map((l, i) => (i === 0 ? OPEN : "") + l + (i === q.length - 1 ? CLOSE : ""));
    // A statement leaves at its own until, else in time for the next statement: its lines sink a stagger apart, so the
    // last one is gone when the next statement starts. An until later than that (the next statement's start, the
    // natural thing to write) is moved to the latest time that keeps the two apart.
    const next = list[si + 1];
    const exitSpan = ctx.dur.exit + (text.length - 1) * ctx.dur.stagger + 1 / 30;
    const latest = next ? Math.max(st.at + ctx.dur.enter, next.at - exitSpan) : undefined;
    const exit = st.until !== undefined ? (latest !== undefined ? Math.min(st.until, latest) : st.until) : (latest ?? p.until);
    if (next && exit !== undefined && exit + exitSpan > next.at + 1e-6) console.warn(`quote ${id}: statement ${si + 1} is still leaving when statement ${si + 2} starts`);
    const sid = list.length > 1 ? `${id}-s${si}` : id;
    let landed: number;
    // The emphasised words of this statement, by line: [line, first word, last word + 1] in the line's words.
    const em = ems[si] && style ? (() => {
      const runs: [number, number, number][] = [];
      let k = 0;
      q.forEach((l, li) => { const n = l.split(" ").length; const a = Math.max(ems[si]!.from, k), b = Math.min(ems[si]!.to, k + n); if (a < b) runs.push([li, a - k, b - k]); k += n; });
      return runs;
    })() : [];
    const mark = (n: Node) => { if (n.kind === "text") { if ("italic" in style!) n.italic = true; else n.color = style!.color; } return n; };
    if (p.reveal === "word") {
      const w = wordNodes(ctx, { id: `${sid}-line`, lines: text.map((t, i) => ({ text: t, x: i === 0 ? x0 : letterX, y: top + i * slh })), role, color: "ink", at: st.at, until: exit, scale: sc,
        ...(em.length ? { em: em.map(([li, a, b]) => ({ line: li, from: a, to: b })), measure: mEm } : {}) });
      for (const n of w.nodes) { const m = n.id.match(/-(\d+)-w(\d+)$/); if (m && em.some(([li, a, b]) => li === +m[1]! && +m[2]! >= a && +m[2]! < b)) mark(n); }
      out.push(...w.nodes);
      landed = w.last + ctx.dur.enter;
    } else {
      text.forEach((line, i) => {
        const lx = i === 0 ? x0 : letterX, at = st.at + i * per, until = exit === undefined ? undefined : exit + (ctx.instant ? 0 : i * ctx.dur.stagger);
        // A line with emphasised words is set as runs (before, the words, after) that rise together, each placed by the
        // width of the runs before it. The first run keeps the line's id.
        const r = em.find(([li]) => li === i);
        const ws = q[i]!.split(" ");
        const runs = r ? [
          { text: (i === 0 ? OPEN : "") + ws.slice(0, r[1]).join(" ") + (r[1] ? " " : ""), em: false },
          { text: ws.slice(r[1], r[2]).join(" "), em: true },
          { text: (r[2] < ws.length ? " " : "") + ws.slice(r[2]).join(" ") + (i === text.length - 1 ? CLOSE : ""), em: false },
        ].filter((u) => u.text) : [{ text: line, em: false }];
        let dx = 0;
        runs.forEach((u, k) => {
          const rid = k === 0 ? `${sid}-line-${i}` : `${sid}-line-${i}-${u.em ? "em" : "after"}`;
          const [node] = lines(ctx, { id: rid, x: lx + dx * sc, y: top + i * slh, lines: [u.text], role, color: "ink", at, until });
          node!.id = rid;
          if (u.em) mark(node!);
          if (sc !== 1 && node!.kind === "text") { node!.origin = [0, 0]; node!.tracks = { ...node!.tracks, scale: [{ t: 0, v: sc }] }; }
          out.push(node!);
          dx += u.em && "italic" in style! ? ctx.measure(u.text, role, { italic: true }) : ctx.measure(u.text, role);
        });
      });
      landed = st.at + (text.length - 1) * per + ctx.dur.enter;
    }
    if (si === 0) firstLanded = landed;
    lastLanded = landed;
  });

  // The pictures under the statements: each fills the frame, dimmed behind type, from its statement to the next picture.
  const pics: Node[] = [];
  const withPic = list.map((st, i) => ({ st, i })).filter((x) => x.st.picture);
  withPic.forEach(({ st, i }, k) => {
    const nextPic = withPic[k + 1];
    const motion = MEDIA_SPEC[ctx.system.id]?.pictures.motion ?? "still";
    // The next picture dissolves in over this one, which holds until it has fully arrived, then cuts out under it.
    // It moves over its own span; the last one comes to rest when the last statement has landed, so the end holds still.
    const at = k ? st.at : Math.min(st.at, p.at), until = nextPic ? nextPic.st.at + ctx.dur.enter + 1 / 30 : p.until;
    const moving = nextPic ? (until ?? 0) - Math.max(0, at) : lastLanded - Math.max(0, at);
    pics.push(...photo({ id: `${id}-picture-${i}`, media: st.picture!, box: { x: 0, y: 0, w: ctx.width, h: ctx.height }, dim: true,
      motion: motion === "drift" || motion === "push" ? motion : "still", ...(moving > 0.5 ? { seconds: moving } : {}),
      ...(k ? { enter: "dissolve" as const } : {}), ...(nextPic ? { exit: "cut" as const } : {}), at, until }, ctx));
  });

  // The rule: a short hairline under the statement slot, drawn from the left after the first statement.
  const exit = p.until;
  const quoteEnd = firstLanded;
  const ruleY = px(top + rowsH + gapAfterQuote(ctx, role) + ruleGap(ctx));
  const ruleW = Math.round(ctx.size("caption") * 3);
  const rx = letterX;
  out.push({ id: `${id}-rule`, kind: "path", d: `M${px(rx)} ${crisp(ruleY, Math.round(ctx.stroke))}H${px(rx + ruleW)}`, stroke: "inkMuted", width: Math.max(1, Math.round(ctx.stroke)),
    tracks: { draw: go(ctx, quoteEnd - ctx.dur.enter * 0.5, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...appear(ctx, quoteEnd - ctx.dur.enter * 0.5, exit, 0) } });

  // The attribution: the name in caption, the role in label below it. Over a picture (this block's, or one built before
  // it under the attribution) the role line is set in ink: the picture behind type keeps the ink, not the muted ink, at
  // 4.5:1 (an agent's Nocturne film: the muted role line failed contrast over the picture).
  const ay = ruleY + ruleGap(ctx);
  const attrBox = { x: rx, y: ay, w: Math.max(ctx.measure(p.name, "caption"), ...L.attr.map((l) => ctx.measure(l, "label"))), h: attrHeight(ctx, L.attr) };
  const onPicture = pics.length > 0 || builtNodes(ctx).some((n) => n.kind === "image" && n.x <= attrBox.x && n.y <= attrBox.y && n.x + n.w >= attrBox.x + attrBox.w && n.y + n.h >= attrBox.y + attrBox.h);
  const attrAt = quoteEnd + ctx.dur.stagger * 2;
  // Masks clip each line to its own line box, so stacked lines in a tight leading never share a box.
  out.push({ id: `${id}-name`, kind: "text", x: rx, y: ay, text: p.name, role: "caption", color: "ink", mask: true, tracks: appear(ctx, attrAt, exit, 8) });
  L.attr.forEach((l, i) => out.push({ id: `${id}-role-${i}`, kind: "text", x: rx, y: ay + ctx.lineHeight("caption") + i * ctx.lineHeight("label"), text: l, role: "label", color: onPicture ? "ink" : "inkMuted", mask: true,
    tracks: appear(ctx, attrAt + ctx.dur.stagger * (i + 1), exit, 8) }));

  // Every text box must be in the text-safe area.
  for (const n of out) if (n.kind === "text") {
    const sc = n.tracks?.scale?.[0]?.v ?? 1;
    const b = { x: n.x, y: n.y, w: ctx.measure(n.text, n.role, n.italic ? { italic: true } : undefined) * sc, h: ctx.lineHeight(n.role) * sc };
    if (!textSafe(ctx, b)) console.warn(`quote ${id}: "${n.text}" is outside the text-safe area`);
  }
  return [...pics, ...out];
};
