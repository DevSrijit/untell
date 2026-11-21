// Captions: subtitles from word timings, with the spoken word marked.
//
// Rules this block enforces:
// - The block groups the words into pages of one or two lines. A page ends at the end of a sentence,
//   at a pause in the speech, or when the next word does not fit. A page never holds more words than
//   the system's density limit.
// - A page of two lines breaks where the two lines are most equal in width, after a comma when it can.
// - The spoken word sits on a bar in the accent colour, set in onAccent. The bar marks the word, so the
//   mark never rides on colour alone, also in systems where the accent equals the ink.
//   Words that are still to come are muted; spoken words are ink.
// - Words keep a gap wider than the bar's padding, so a bar never touches the next word.
// - The lines sit at the foot of the caller's box (the caption zone) and every word passes textSafe.
// - Pages and bars cut on the frame of the word: subtitles follow speech, so nothing tweens late.
// - `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).
import { pin } from "../screen";
import { present, px, textSafe, onGrid } from "../context";
import type { Block, Node } from "../types";

export type CaptionWord = { text: string; /** Seconds. */ start: number; /** Seconds. */ end: number };

export type CaptionsProps = {
  id?: string;
  /** The caption zone in px. The lines sit at its foot. */
  x: number; y: number; w: number; h: number;
  /** The words in speech order, with their times. */
  words: CaptionWord[];
  /** One or two lines a page (default 2). */
  maxLines?: 1 | 2;
  /** At most this many words a page (default: the system's density limit). */
  maxWords?: number;
  /** Line alignment in the box (default centre). */
  align?: "center" | "left";
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  /** When the last page leaves (default: 0.8 s after the last word ends). */
  until?: number;
};

/** Moves a time to three quarters of a frame. A step segment then never has a sampled frame at its start or its midpoint, where the two renderers flip a step differently. */
/** A time on the frame grid that shows on the same frame as t (context.ts onGrid: the frame rule every block keeps). */
const snap = onGrid;

/** Words that never end a page: they lean on the word after them. */
const WEAK = new Set(["a", "an", "and", "the", "to", "of", "in", "on", "at", "by", "for", "from", "with", "or", "but", "about", "than", "that", "is", "are"]);

/** A pause longer than this ends a page. */
const PAUSE = 0.6;

type Laid = { lines: number[][]; widths: number[] };

const captionsNodes: Block<CaptionsProps> = (p, ctx) => {
  const id = p.id ?? "captions";
  const role = "caption" as const;
  const size = ctx.size(role);
  const lh = Math.ceil(size * ctx.system.type[role].leading);
  const padX = Math.round(size * 0.16);
  const gap = Math.max(ctx.measure(" ", role), padX * 2 + Math.round(size * 0.14));
  const lineGap = Math.round(size * 0.14);
  const maxLines = p.maxLines ?? 2;
  const maxWords = Math.max(1, p.maxWords ?? ctx.system.density.maxWords);
  const ww = p.words.map((w) => ctx.measure(w.text, role));
  // A line's width counts the bar's padding at both ends, so a bar on the first or last word stays in the box.
  const widthOf = (ids: number[]) => ids.reduce((a, i) => a + ww[i]!, 0) + gap * Math.max(0, ids.length - 1) + padX * 2;

  /** Lays out words on one line, or on two balanced lines. Returns null when they do not fit. */
  const layout = (ids: number[]): Laid | null => {
    if (widthOf(ids) <= p.w) return { lines: [ids], widths: [widthOf(ids)] };
    if (maxLines < 2 || ids.length < 2) return null;
    let best: Laid | null = null, score = Infinity;
    for (let k = 1; k < ids.length; k++) {
      const a = ids.slice(0, k), b = ids.slice(k);
      const wa = widthOf(a), wb = widthOf(b);
      if (wa > p.w || wb > p.w) continue;
      // Equal lines first; a break after a comma counts as a little more equal.
      const s = Math.abs(wa - wb) - (/[,;:]$/.test(p.words[a[a.length - 1]!]!.text) ? size * 2 : 0);
      if (s < score) { score = s; best = { lines: [a, b], widths: [wa, wb] }; }
    }
    return best;
  };

  // Pages, greedy in speech order.
  const pages: { ids: number[]; laid: Laid }[] = [];
  let cur: number[] = [];
  const flush = () => { if (cur.length) { pages.push({ ids: cur, laid: layout(cur)! }); cur = []; } };
  p.words.forEach((w, i) => {
    if (ww[i]! + padX * 2 > p.w) console.warn(`captions ${id}: "${w.text}" is wider than the box`);
    const next = [...cur, i];
    if (cur.length && (next.length > maxWords || !layout(next))) {
      // A page never ends on a weak word ("and", "the", "to"): that word starts the next page instead.
      const carry: number[] = [];
      while (cur.length > 2 && WEAK.has(p.words[cur[cur.length - 1]!]!.text.toLowerCase())) carry.unshift(cur.pop()!);
      flush();
      cur = carry;
    }
    cur.push(i);
    const after = p.words[i + 1];
    if (/[.?!]$/.test(w.text) || (after && after.start - w.end > PAUSE)) flush();
  });
  if (cur.length) {
    if (!layout(cur)) console.warn(`captions ${id}: a word does not fit the box`);
    pages.push({ ids: cur, laid: layout(cur) ?? { lines: [cur], widths: [widthOf(cur)] } });
  }

  const out: Node[] = [];
  const last = p.words[p.words.length - 1];
  const finalEnd = snap(p.until ?? (last ? last.end + 0.8 : 0));
  pages.forEach((pg, pi) => {
    const start = snap(p.words[pg.ids[0]!]!.start);
    const end = pi + 1 < pages.length ? snap(p.words[pages[pi + 1]!.ids[0]!]!.start) : finalEnd;
    const n = pg.laid.lines.length;
    const top = p.y + p.h - n * lh - (n - 1) * lineGap;
    if (top < p.y - 0.5) console.warn(`captions ${id}: page ${pi} needs ${n} lines; the box is ${p.h} px tall`);
    pg.laid.lines.forEach((ids, li) => {
      const y = top + li * (lh + lineGap);
      let x = (p.align === "left" ? p.x : p.x + (p.w - pg.laid.widths[li]!) / 2) + padX;
      x = Math.round(x);
      ids.forEach((wi) => {
        const w = p.words[wi]!;
        const k = pg.ids.indexOf(wi);
        // The word is marked from its start until the next word on the page starts, or a moment after it ends.
        const hs = Math.max(start, snap(w.start));
        const nextOnPage = pg.ids[k + 1];
        const he = Math.min(end, nextOnPage !== undefined ? snap(p.words[nextOnPage]!.start) : snap(w.end + 0.3));
        if (!textSafe(ctx, { x, y, w: ww[wi]!, h: lh })) console.warn(`captions ${id}: "${w.text}" is outside the text-safe area`);
        const base = { kind: "text" as const, x, y, text: w.text, role };
        // Still to come: muted. Marked: onAccent on the bar. Spoken: ink. Exactly one shows at a time.
        if (hs > start) out.push({ ...base, id: `${id}-p${pi}-w${wi}-next`, color: "inkMuted", tracks: present(start, hs) });
        out.push({ ...base, id: `${id}-p${pi}-w${wi}-now`, color: "onAccent", z: 1, tracks: present(hs, he) });
        if (he < end) out.push({ ...base, id: `${id}-p${pi}-w${wi}-said`, color: "ink", tracks: present(he, end) });
        const barH = Math.round(size * 1.24);
        out.push({ id: `${id}-p${pi}-w${wi}-bar`, kind: "rect", x: px(x - padX), y: px(y + (lh - barH) / 2), w: Math.round(ww[wi]! + padX * 2), h: barH,
          fill: "accent", radius: Math.min(ctx.radius, barH / 4), tracks: present(hs, he) });
        x += ww[wi]! + gap;
      });
    });
  });
  return out;
};

export const captions: Block<CaptionsProps> = (p, ctx) => (p.pinned ? pin(captionsNodes(p, ctx)) : captionsNodes(p, ctx));
