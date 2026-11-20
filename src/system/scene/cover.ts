// Type behind a cut-out, planned at build time. A scene that sets type behind a subject (the photo block
// with `over`) can ask how much of each letter the subject will hide, and can choose among layouts with
// placeBehind. The recorded film is still the judge: scripts/inspect/cover.py measures the real frames
// (letters at most 30 % hidden, words at most 15 %). This plan uses the media table's coarse mask and an
// estimate of each letter's ink, so placeBehind keeps a margin under those limits.
import { MEDIA, type MediaInfo } from "../media.gen";
import { layerOf } from "./layout";
import { evaluate } from "./time";
import type { Ctx, Node, TextNode } from "./types";

export type Rect = [number, number, number, number]; // x0, y0, x1, y1 in frame px
type ImageNode = Extract<Node, { kind: "image" }>;

/** The media name of an image node that shows a prepared cut-out (src "<name>/subject.png"), or null. */
function cutoutInfo(n: Node): MediaInfo | null {
  if (n.kind !== "image" || !n.cutout) return null;
  return MEDIA[n.src.split("/")[0]!] ?? null;
}

/** The share of a frame rect that a cut-out image hides at time t, by the mask's alpha (0 to 1). */
export function hiddenBy(ctx: Ctx, img: ImageNode, info: MediaInfo, r: Rect, t: number): number {
  const m = info.mask;
  if (!m) return 0;
  const v = evaluate(ctx.system, img.tracks, t);
  if (v.opacity <= 0.02) return 0;
  const iv = evaluate(ctx.system, img.inner, t);
  const [fx, fy] = img.focus ?? [0.5, 0.5];
  // Cover fit inside the box, then the inner scale about the focus point (as both renderers draw it).
  const s = img.fit === "contain" ? Math.min(img.w / info.width, img.h / info.height) : Math.max(img.w / info.width, img.h / info.height);
  const dw = info.width * s, dh = info.height * s;
  const ox = img.x + (img.w - dw) * fx, oy = img.y + (img.h - dh) * fy;
  const Fx = img.x + img.w * fx, Fy = img.y + img.h * fy;
  const z = iv.scale || 1;
  const n = 10;
  let sum = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    // The point in the image's own box: undo the node's own move (its x and y tracks) first, as the renderers apply it.
    const X = r[0] + ((i + 0.5) / n) * (r[2] - r[0]) - v.x, Y = r[1] + ((j + 0.5) / n) * (r[3] - r[1]) - v.y;
    if (X < img.x || X >= img.x + img.w || Y < img.y || Y >= img.y + img.h) continue; // the crop box
    // Undo the inner scale (about the focus) and the inner x shift, then the fit.
    const px = Fx + (X - iv.x - Fx) / z, py = Fy + (Y - iv.y - Fy) / z;
    const u = (px - ox) / dw, w = (py - oy) / dh;
    if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
    const c = Math.floor(u * m.cols), rr = Math.floor(w * m.rows);
    sum += parseInt(m.data[rr * m.cols + c] ?? "0", 16) / 15;
  }
  return (sum / (n * n)) * v.opacity;
}

/**
 * Each letter's ink box of a text node at time t, estimated from the role's metrics: the cap band of the
 * line box, letter edges from measured prefixes, then the node's own move and scale about its origin.
 */
export function letterBoxes(ctx: Ctx, n: TextNode, t: number): { ch: string; r: Rect }[] {
  const v = evaluate(ctx.system, n.tracks, t);
  const role = ctx.system.type[n.role];
  const size = ctx.size(n.role), lh = size * role.leading;
  // The node's own box is its width and its line box; a mask's pads sit outside it (layout.maskBox), so the origin
  // for scale is a fraction of this box, masked or not.
  const opts = n.keepCase ? { keepCase: true } : undefined;
  const textW = ctx.measure(n.text, n.role, opts);
  const boxW = n.width ?? textW, boxH = lh;
  const left = n.x + (n.width && n.align === "center" ? (boxW - textW) / 2 : n.width && n.align === "right" ? boxW - textW : 0);
  const top = n.y;
  const mid = top + lh / 2;
  const [ox, oy] = n.origin ?? [0, 0.5];
  const Ox = n.x + boxW * ox, Oy = top + boxH * oy;
  const sx = v.scale * v.scaleX, sy = v.scale * v.scaleY;
  const map = (x: number, y: number): [number, number] => [Ox + v.x + sx * (x - Ox), Oy + v.y + sy * (y - Oy)];
  const out: { ch: string; r: Rect }[] = [];
  for (let i = 0; i < n.text.length; i++) {
    const ch = n.text[i]!;
    if (!ch.trim()) continue;
    const x0 = left + ctx.measure(n.text.slice(0, i), n.role, opts), x1 = left + ctx.measure(n.text.slice(0, i + 1), n.role, opts);
    const a = map(x0, mid - 0.37 * size), b = map(x1, mid + 0.33 * size);
    out.push({ ch, r: [a[0], a[1], b[0], b[1]] });
  }
  return out;
}

export type CoverReport = { id: string; text: string; t: number; letter: number; ch: string; word: number; inkHeight: number; fails: ("letter" | "word")[] };

/** The recorded check's limits (scripts/inspect/checks/cover_rule.py): one letter, the whole word, and the contrast at
 *  which a hidden letter still reads on the cut-out. */
export const COVER_RULE = { letterMax: 0.3, wordMax: 0.15, readsOnCutout: 3 };

/**
 * The one cover verdict, a direct port of cover_rule.py `judge`, so the kit and the detector judge a frame the same
 * way. Each letter is [char, hidden share 0-1, ink box area, contrast against the cut-out (optional)]. A letter that
 * reads on the cut-out (3:1 or more) counts half hidden. The word share is area-weighted. A text fails when one letter
 * is over 30 % hidden or the word over 15 %. examples/detector/cover_rule_cases.json holds the shared cases.
 */
export function judgeCover(letters: [string, number, number, (number | null)?][]): { letter: number; word: number; fails: ("letter" | "word")[]; detail: string; ch: string } {
  if (!letters.length) return { letter: 0, word: 0, fails: [], detail: "", ch: "" };
  const eff = letters.map(([ch, hidden, area, contrast]) => ({ ch, h: hidden * (contrast !== undefined && contrast !== null && contrast >= COVER_RULE.readsOnCutout ? 0.5 : 1), a: area }));
  const total = eff.reduce((s, x) => s + x.a, 0) || 1;
  const word = eff.reduce((s, x) => s + x.h * x.a, 0) / total;
  // The first letter with the largest share (Python's max keeps the first of equals).
  const top = eff.reduce((b, x) => (x.h > b.h ? x : b));
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const fails = ([["letter", top.h, COVER_RULE.letterMax], ["word", word, COVER_RULE.wordMax]] as const).filter(([, v, lim]) => v > lim).map(([r]) => r);
  return { letter: r3(top.h), word: r3(word), fails: [...fails], ch: top.ch, detail: `"${top.ch}" ${Math.round(top.h * 100)}% hidden; ${Math.round(word * 100)}% of the word hidden` };
}

/** For every text node shown at time t under a cut-out in `nodes`: its worst letter and its whole word, hidden. */
export function coverAt(ctx: Ctx, nodes: Node[], t: number): CoverReport[] {
  const cuts = nodes.flatMap((n) => { const info = cutoutInfo(n); return info ? [{ n: n as ImageNode, info }] : []; });
  if (!cuts.length) return [];
  const out: CoverReport[] = [];
  for (const n of nodes) {
    if (n.kind !== "text") continue;
    const v = evaluate(ctx.system, n.tracks, t);
    if (v.opacity < 0.5 || v.reveal > 5) continue;
    const over = cuts.filter((c) => layerOf(c.n) > layerOf(n));
    if (!over.length) continue;
    let ink = 0;
    const boxes = letterBoxes(ctx, n, t);
    const letters: [string, number, number][] = boxes.map((b) => {
      ink += b.r[3] - b.r[1];
      return [b.ch, 1 - over.reduce((p, c) => p * (1 - hiddenBy(ctx, c.n, c.info, b.r, t)), 1), (b.r[2] - b.r[0]) * (b.r[3] - b.r[1])];
    });
    // The verdict is the detector's (judgeCover); the kit knows no contrast on the cut-out, so a hidden letter counts in full.
    const j = judgeCover(letters);
    if (boxes.length) out.push({ id: n.id, text: n.text, t, letter: j.letter, ch: j.ch, word: j.word, inkHeight: ink / boxes.length, fails: j.fails });
  }
  return out;
}

export type PlaceOptions = {
  /**
   * When to look, seconds: every step from `from` to `to`, and `to` itself. Default step: every frame (1/30 s), as the
   * recorded cover check looks; a coarser step missed the last frame of a push (an agent's film: 39 % hidden at 6.83 s).
   */
  from: number; to: number; step?: number;
  /** The planning limits, under the recorded check's 30 % and 15 % to leave room for the estimate. */
  letterMax?: number; wordMax?: number;
  /** Do not warn when no candidate passes (the caller tries other layouts and checks `ok`). */
  quiet?: boolean;
};

/**
 * Builds each candidate layout with `build`, adds the nodes in `scene` (the photo and its cut-out), and
 * keeps the candidate whose type is largest while no letter and no word passes the limits at any sampled
 * time. Among candidates within 3 % of that size, it keeps the one the subject overlaps most (still within
 * the limits), so the type sits behind the subject on purpose and still reads.
 * Returns the chosen candidate, whether it is inside the limits (`ok`), and its worst numbers. With no
 * candidate inside the limits, it warns (unless `quiet`) and returns the one that hides least.
 * It reads each node in the world, at its own tracks. It does not apply the camera: a push or a pan, and pinned text
 * that the camera does not move, are not in its plan. The recorded cover check reads the frames with the camera, so
 * run the check after it. It tries only the candidates you give: step them by 20 px or less (in a first-use
 * test, candidates 100 px apart found no place; 20 px steps found one).
 */
export function placeBehind<T>(ctx: Ctx, scene: Node[], candidates: T[], build: (c: T) => Node[], o: PlaceOptions): { pick: T; ok: boolean; letter: number; word: number; inkHeight: number } {
  const letterMax = o.letterMax ?? 0.22, wordMax = o.wordMax ?? 0.1, step = o.step ?? 1 / 30;
  const times: number[] = [];
  for (let t = o.from; t < o.to - 1e-6; t += step) times.push(t);
  times.push(o.to);
  const scored = candidates.map((c) => {
    const nodes = [...scene, ...build(c)];
    let letter = 0, word = 0, ink = 0, k = 0, fails = false;
    for (const t of times) {
      for (const r of coverAt(ctx, nodes, t)) { letter = Math.max(letter, r.letter); word = Math.max(word, r.word); ink += r.inkHeight; k++; fails ||= r.fails.length > 0; }
    }
    return { c, letter, word, ink: k ? ink / k : 0, fails };
  });
  // A candidate must pass the detector's verdict (judgeCover) and the planning limits under it.
  const ok = scored.filter((s) => !s.fails && s.letter <= letterMax && s.word <= wordMax && s.ink > 0);
  if (!ok.length) {
    const best = scored.reduce((a, b) => (b.letter < a.letter ? b : a));
    if (!o.quiet) console.warn(`placeBehind: no layout keeps every letter under ${Math.round(letterMax * 100)} % hidden; the best hides ${Math.round(best.letter * 100)} %`);
    return { pick: best.c, ok: false, letter: best.letter, word: best.word, inkHeight: best.ink };
  }
  const big = Math.max(...ok.map((s) => s.ink));
  const best = ok.filter((s) => s.ink >= big * 0.97).reduce((a, b) => (b.letter > a.letter ? b : a));
  return { pick: best.c, ok: true, letter: best.letter, word: best.word, inkHeight: best.ink };
}
