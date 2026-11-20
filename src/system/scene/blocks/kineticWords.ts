// Kinetic words: short phrases that fill a box one after another, each cut on its beat.
//
// Rules this block enforces:
// - Each phrase fills the box. The type role keeps its system size; a static `scale` track fits it.
//   The block tries every way to break the phrase into lines and keeps the one that sets the type largest.
// - In a system with bleed for the role (Kinetic, Courtside), the box widens to the frame margins and
//   each line scales to the full width, so the words run edge to edge. Elsewhere one scale sets the
//   whole phrase, and every word passes textSafe.
// - Phrases change on their beats: the old phrase cuts out on the beat, and the new one enters on it.
//   Two phrases never show at the same time.
// - Entrances follow the system's motion: a masked roll, word after word and line after line, or a
//   scale pop of the whole phrase about its centre. A line rolls only when the line above it has
//   cleared its mask, so two lines never show in the same place. Inside the safe area a line rolls only
//   as far as the box allows, so no text box ever leaves the box on the way in. With an overshooting enter curve, the fit leaves room for the overshoot,
//   so the phrase never passes its box.
// - The accent marks one word a phrase. Where the accent equals the ink (Spec, Noir, Title), the word
//   sits reversed out of a solid block, so the mark never rides on colour alone.
// - The block reports a phrase with more words than the system's density limit, or a phrase held
//   shorter than the system's minimum hold.
// - A phrase at 0 s (or before) shows whole and at rest from frame 0, with no entrance, so a film can
//   open on its first words instead of an empty frame.
// - Bleed words carry HyperFrames' safe-zone opt-out (the renderers add it for a role in system.bleed).
// - `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.
import { go, present, textSafe, windows, onGrid } from "../context";
import { caseCtx } from "./text";
import { inkMetrics, maskPad, maskTravel } from "../layout";
import { bezier, overshoots } from "../time";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Node, Origin } from "../types";

export type KineticPhrase = {
  /**
   * The words of the phrase, separated by spaces. Keep within the system's density limit. A line break ("\n") sets
   * where the lines break; with none, the block chooses the breaks that set the type largest, and avoids a last line
   * of one word under a line of two or more words when another break fits.
   */
  text: string;
  /** The beat on which the phrase enters, in seconds. */
  at: number;
  /** The word to mark: the word itself or its index. Default: the last word. null: no mark. */
  accent?: string | number | null;
  /** How the phrase enters. Default: roll and pop take turns. */
  motion?: "roll" | "pop";
  /**
   * The phrase's weight by meaning, not by its letter count. "fit" (the default): each line fills the box's width.
   * "bleed": the lines grow past the frame and the frame crops them (BLEED_CROP of the width on each side): a long
   * reveal word made larger. "hero": the cap height heroCap, as far as the frame lets the word read (HERO_CROP at most
   * cut off on each side). Default for a `reveal` phrase: "hero". No phrase is ever changed for another one: a reveal
   * wins its moment by the ways in reconcileReveals (the grow into the ground, an accent ground, a picture, its size).
   */
  size?: "fit" | "bleed" | "hero";
  /** This phrase is the film's reveal. The block warns when it is not the largest type of the film. */
  reveal?: boolean;
  /**
   * How the phrase leaves: "cut" (the default) on the next beat; "toGround": the accent word grows until its glyph fills
   * the frame, over the system's move before the next beat, and on that beat the frame becomes the accent ground
   * (Kinetic's word-to-ground move). Set the phrases on that ground with `onAccent`.
   */
  exit?: "cut" | "toGround";
  /** With exit "toGround": when the accent ground leaves (a cut). Default: it stays to the end of the film. */
  groundUntil?: number;
};

export type KineticWordsProps = {
  id?: string;
  /** The box the phrases fill, in px. */
  x: number; y: number; w: number; h: number;
  phrases: KineticPhrase[];
  /** When the last phrase leaves. Each other phrase leaves on the next phrase's beat. */
  until?: number;
  /** The type role (default display). */
  role?: TypeRole;
  /** The most lines a phrase may break into (default 3). */
  maxLines?: number;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /** The phrases sit on an accent-coloured ground (a panel wipe under them): every word is set in onAccent, and no word gets a mark. */
  onAccent?: boolean;
  /**
   * Screen space: the words stay where they are on screen while the camera pans or pushes, so a push on the picture
   * never scales edge-to-edge words off the frame (Courtside's pushes on each word cut).
   */
  pinned?: boolean;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};

/** Moves a time to three quarters of a frame. A step segment then never has a sampled frame at its start or its midpoint, where the two renderers flip a step differently. */
/** A time on the frame grid that shows on the same frame as t (context.ts onGrid: the frame rule every block keeps). */
const snap = onGrid;
/** The largest static scale. Past this a short word turns into a texture, not a word. */
const MAX_SCALE = 3;
/** The scale a popped phrase starts from. */
const POP_FROM = 0.82;
/** The hero's cap height: this share of the frame's width (389 px at 1080 wide). A "hero" phrase is set this large,
 *  as far as the frame lets it read (HERO_CROP); no other phrase is changed for it. */
export const HERO_SHARE = 0.36;
/** How much of a hero line the frame may crop on each side (a share of the frame width), so the word still reads. */
export const HERO_CROP = 0.12;
/** How far a "bleed" line grows past each frame edge (a share of the frame width). */
export const BLEED_CROP = 0.06;
/** The cap height of the hero size in this frame, px. */
export const heroCap = (ctx: Pick<Ctx, "width">) => Math.round(HERO_SHARE * ctx.width);

/** The phrases built with one context (one scene build), for the reveal rule: their cap height, time, text, node ids,
 *  and whether the phrase grows into the ground or sits on one. */
type Built = { id: string; prefix: string; text: string; at: number; until?: number; cap: number; reveal: boolean; ground: boolean; frameW: number; frameH: number };
const FILM = new WeakMap<object, { phrases: Built[]; reveals: number[] }>();
const warned = new Set<string>();
const once = (m: string) => { if (!warned.has(m)) { warned.add(m); console.warn(m); } };
const filmOf = (ctx: object) => { let f = FILM.get(ctx); if (!f) FILM.set(ctx, (f = { phrases: [], reveals: [] })); return f; };
const shownAt = (b: Built, t: number) => t >= b.at - 1e-6 && (b.until === undefined || t < b.until - 1e-6);

/** For B.reveal: records the film's reveal time, so a kineticWords phrase shown then is held to the reveal rule. */
export function noteReveal(ctx: object, at: number): void {
  filmOf(ctx).reveals.push(at);
}

/** Is a node (an accent ground, a wipe panel, a picture) showing at time t over most of the frame? */
function fills(n: Node, t: number, W: number, H: number, share: number): boolean {
  if (n.kind !== "rect" && n.kind !== "image") return false;
  if (n.w * n.h < share * W * H) return false;
  const ks = n.tracks?.opacity;
  if (!ks?.length) return true;
  // The value at t: the last key at or before t (a cut), or the first key.
  let v = ks[0]!.v;
  for (const k of ks) if (k.t <= t + 1e-6) v = k.v;
  return v > 0.5;
}

/**
 * The reveal rule (the guard calls it after each kineticWords and reveal block, with every node built so far). The
 * reveal must be the largest thing on screen at its moment. In Kinetic that holds by any of these ways, and no other
 * phrase is ever changed for it (every phrase keeps filling the frame):
 * - its type is the largest of the film (`size: "hero"`, or a short word);
 * - it grows into the next ground (`exit: "toGround"`);
 * - it sits on an accent ground (`onAccent`, a `ground` or a `wipe` panel in the accent behind it);
 * - a picture fills the frame at that moment (a picture reveal).
 * A reveal (`reveal: true`, or the phrase shown at a B.reveal time) that meets none of them gets one warning that names
 * the ways. A long reveal word may bleed (`size: "bleed"`: the frame crops it) or break on two lines.
 */
export function reconcileReveals(ctx: object, nodes: readonly Node[]): void {
  const f = filmOf(ctx);
  const isReveal = (b: Built) => b.reveal || f.reveals.some((t) => shownAt(b, t));
  for (const r of f.phrases.filter(isReveal)) {
    if (r.ground) continue;
    const t = Math.max(r.at, f.reveals.find((x) => shownAt(r, x)) ?? r.at) + 1 / 30;
    if (nodes.some((n) => !n.id.startsWith(r.prefix) && ((n.kind === "rect" && n.fill === "accent") || n.kind === "image") && fills(n, t, r.frameW, r.frameH, 0.6))) continue;
    const big = f.phrases.filter((b) => b !== r && !isReveal(b)).reduce<Built | null>((a, b) => (!a || b.cap > a.cap ? b : a), null);
    if (big && big.cap > r.cap + 1) once(`kineticWords ${r.prefix.slice(0, -1)}: the reveal "${r.text}" (cap ${Math.round(r.cap)} px) is not the largest thing on screen at its moment: "${big.text}" (${big.prefix.slice(0, -1)}) is set larger (${Math.round(big.cap)} px). Make it win one of these ways: exit: "toGround" (the word grows into the accent ground), an accent ground behind it (onAccent on a ground or wipe in the accent), a picture that fills the frame then, or size: "hero" (a short word) or "bleed" (a long word, cropped by the frame).`);
  }
}

type Layout = { lines: number[][]; scales: number[]; score: number };

/** Every way to break n words into at most k lines, in reading order. */
function partitions(n: number, k: number): number[][][] {
  const out: number[][][] = [];
  const rec = (start: number, acc: number[][]) => {
    if (start === n) { out.push(acc); return; }
    if (acc.length === k) return;
    for (let end = start + 1; end <= n; end++) rec(end, [...acc, Array.from({ length: end - start }, (_, i) => start + i)]);
  };
  rec(0, []);
  return out;
}

/** How far past the frame the word to ground grows: 10 % over the scale at which its stem covers the frame. */
const COVER_MARGIN = 1.1;

/** Letters whose left stem is solid ink from the baseline to the cap line in a heavy sans (the grow's pivot). */
const STEMMED = "BDEFHKLMNPRbdhklmnpr";

export const kineticWords: Block<KineticWordsProps> = (p, ctx0) => {
  const id = p.id ?? "kinetic";
  const ctx = caseCtx(ctx0, p.keepCase);
  const role = p.role ?? "display";
  const t = ctx.system.type[role];
  const size = ctx.size(role);
  const short = Math.min(ctx.width, ctx.height);
  const lh = size * t.leading; // the CSS line box
  const pad = maskPad(ctx.system, role, short);
  // Extra width on each masked word, so negative tracking never clips its last glyph. The fit counts it.
  const slack = Math.ceil(Math.max(0, -t.tracking) * size + size * 0.02);
  const bleed = !!ctx.system.bleed?.includes(role);
  const inkAccent = ctx.system.accentMode === "ink";
  const s = ctx.safe;

  // The box. With bleed it runs between the frame margins; else it stays inside the text-safe area.
  let box = { x: p.x, y: p.y, w: p.w, h: p.h };
  if (bleed) {
    const m = Math.round(ctx.system.margin * short);
    box = { x: m, y: p.y, w: ctx.width - 2 * m, h: p.h };
    // The frame, not the top of it: a box that is the text-safe box (the usual call) widens down to the line as far
    // under the frame's middle as the text-safe top is over it, so the stack sits on the frame's optical centre and a
    // tall stack fills the height. Words in the top third with the lower half empty (an agent's Kinetic film) cannot happen
    // by default. A box the scene drew smaller is kept.
    if (p.y <= s.top + 2 && p.y + p.h >= Math.min(s.bottom, s.lowBandTop) - 2 && ctx.height > ctx.width) box = { ...box, y: s.top, h: ctx.height - 2 * s.top };
    // A taller box than that is not used: the text-safe top and the same depth at the foot keep the words clear of the
    // platform's buttons and captions. Say so, so a scene that drew a larger box knows where the words go.
    if (p.y < box.y - 2 || p.y + p.h > box.y + box.h + 2)
      console.warn(`kineticWords ${id}: the box runs from y ${Math.round(p.y)} to ${Math.round(p.y + p.h)}, past the room the words may use (y ${Math.round(box.y)} to ${Math.round(box.y + box.h)}: the text-safe top, and as far under the frame's middle). The words fill that room; a larger box does not set them larger.`);
  } else {
    const x0 = Math.max(p.x, s.left), y0 = Math.max(p.y, s.top), y1 = Math.min(p.y + p.h, s.bottom);
    const right = Math.min(p.x + p.w, y1 > s.lowBandTop ? s.lowBandRight : s.right);
    if (x0 !== p.x || y0 !== p.y || right !== p.x + p.w || y1 !== p.y + p.h) console.warn(`kineticWords ${id}: the box was cut to the text-safe area`);
    box = { x: x0, y: y0, w: right - x0, h: y1 - y0 };
  }
  // An overshooting enter curve pops past 1: fit to the peak, so the phrase stays inside the box.
  const curve = ctx.system.motion.enter;
  let peak = 1;
  if (!ctx.instant && overshoots(curve)) for (let i = 0; i <= 100; i++) peak = Math.max(peak, POP_FROM + (1 - POP_FROM) * bezier(curve, i / 100));
  const fitW = box.w / peak, fitH = box.h / peak;

  const gapOf = (sc: number) => Math.round(size * 0.06 * sc);
  // Inside the safe area the box must also hold what reaches past the line box: the glyphs' own
  // content area above and below a tight line (about 1.3 em), and the padding of an accent block.
  // Below the last line, a word that rises in shows inside its mask's bottom padding, so that padding counts too.
  const over = bleed ? 0 : Math.max(0, (size * 1.3 - lh) / 2);
  // The last line also keeps 40 % of a roll's travel free below it, so it can rise into view.
  const travel0 = maskTravel(ctx.system, role, short);
  const under = bleed ? 0 : Math.max(over, pad.bottom, travel0 * 0.4) + 1;
  // The roll's curve, and the share of the travel after which a rising line no longer shows below its
  // own line box (its mask reaches pad.bottom further down).
  const rollCurve = ctx.noOvershoot("enter");
  const clearAt = pad.bottom / travel0;
  /** Seconds after a roll from `from` (%) starts until its line shows only inside its own line box. */
  const clearAfter = (from: number) => {
    if (ctx.instant) return 0;
    const b = rollCurve === "linear" ? null : ctx.system.motion[rollCurve as "enter" | "move" | "exit"];
    for (let i = 0; i <= 60; i++) {
      const e = b ? bezier(b, i / 60) : i / 60;
      if ((from / 100) * (1 - e) <= clearAt) return Math.ceil((i / 60) * ctx.dur.enter * 30) / 30;
    }
    return ctx.dur.enter;
  };
  const side = !bleed && inkAccent ? Math.round(size * 0.07) : 0;
  // Cap heights: the hero's comes from the frame.
  /** A point inside a letter's stem of `word`, in the node's own px (unscaled): x across the stem, y at mid cap height. */
  const stemPoint = (word: string, sz: number) => {
    let i = [...word].findIndex((c) => STEMMED.includes(c) || (c === "I" || c === "T" || c === "l"));
    if (i < 0) i = 0;
    const c = word[i]!;
    const x0 = i ? ctx.measure(word.slice(0, i), role) : 0;
    const x = c === "I" || c === "T" || c === "l" ? x0 + ctx.measure(c, role) / 2 : x0 + 0.13 * sz;
    let base = lh * 0.78;
    try {
      const m = inkMetrics(ctx.system, role);
      const A = Math.round(m.ascent * sz), D = Math.round(m.descent * sz);
      base = Math.floor((lh - (A + D)) / 2) + A;
    } catch { /* no ink table for this font: an estimate */ }
    return { x, y: base - (capFrac * sz) / 2 };
  };
  const capFrac = (() => { try { return inkMetrics(ctx.system, role).cap; } catch { return 0.72; } })();
  const capOf = (sc: number) => sc * size * capFrac;
  // The scale at which a shape about a pivot at (px, py), reaching halfW to each side and halfH up and down, covers the
  // frame, plus COVER_MARGIN for the stem's estimate. The grow ends there on its beat: with the exit curve the frame
  // fills on the last frames of the move, so the change to the ground is on the beat, not frames before it.
  const coverScale = (px: number, py: number, halfW: number, halfH: number) =>
    COVER_MARGIN * Math.max(Math.max(px, ctx.width - px) / halfW, Math.max(py, ctx.height - py) / halfH);
  const heroScale = heroCap(ctx) / (size * capFrac);
  const layoutOf = (words: string[], given?: number[][], kind: "fit" | "bleed" | "hero" = "fit"): Layout => {
    // + 1: each word's mask is a whole number of px wide.
    const wOf = (ids: number[]) => ctx.measure(ids.map((i) => words[i]).join(" "), role) + slack + 1;
    // How wide a line may run: the box, the frame with its bleed crop, or the frame with the hero's crop.
    const runW = !bleed ? fitW : kind === "hero" ? ctx.width * (1 + 2 * HERO_CROP) : kind === "bleed" ? ctx.width * (1 + 2 * BLEED_CROP) : fitW;
    const most = kind === "hero" ? heroScale : MAX_SCALE;
    let best: Layout | null = null, whole: Layout | null = null;
    // An orphan: a last line of one word under a line of two or more words.
    const orphan = (ls: number[][]) => ls.length > 1 && ls[ls.length - 1]!.length === 1 && ls[ls.length - 2]!.length >= 2;
    for (const lines of given ? [given] : partitions(words.length, Math.max(1, p.maxLines ?? 3))) {
      const widths = lines.map(wOf);
      let scales: number[];
      if (bleed) {
        // Each line fills its run (the width, or past the frame for bleed and hero); then all shrink together when the
        // stack is too tall.
        scales = widths.map((w) => Math.min(most, runW / w));
        const tall = scales.reduce((a, sc) => a + lh * sc + gapOf(sc), 0) - gapOf(scales[scales.length - 1]!);
        if (tall > fitH) scales = scales.map((sc) => (sc * fitH) / tall);
      } else {
        const sc = Math.min(MAX_SCALE, fitW / (Math.max(...widths) + 2 * side), fitH / (lines.length * lh + (lines.length - 1) * gapOf(1) + over + under));
        scales = lines.map(() => sc);
      }
      // Score: the area the type covers. Unequal line sizes and extra lines cost a little.
      const area = lines.reduce((a, _, i) => a + widths[i]! * scales[i]! * lh * scales[i]!, 0) / (fitW * fitH);
      const ratio = Math.max(...scales) / Math.min(...scales);
      const score = area * (ratio > 2.2 ? 0.6 : 1) * (1 - 0.05 * (lines.length - 1)) * (bleed ? 1 : Math.min(...scales));
      if (!best || score > best.score) best = { lines, scales, score };
      if (!orphan(lines) && (!whole || score > whole.score)) whole = { lines, scales, score };
    }
    return whole ?? best!;
  };

  const out: Node[] = [];
  // The last phrase at 0 or before is shown from frame 0 (`still`); a phrase before it ended before the film. The
  // others go on the frame grid (onGrid), so each shows on frameOf of its time.
  const lastBefore = p.phrases.reduce((k, ph, i) => (ph.at <= 0 ? i : k), -1);
  const phrases = p.phrases.map((ph, i) => ({ ...ph, gone: ph.at <= 0 && i < lastBefore, still: ph.at <= 0, at: ph.at <= 0 ? 0 : snap(ph.at) }));
  const accentOf = (ph: KineticPhrase, words: string[]) => ph.accent === null ? -1
    : typeof ph.accent === "number" ? ph.accent
    : ph.accent !== undefined ? words.findIndex((w) => w.toLowerCase() === String(ph.accent).toLowerCase())
    : words.length - 1;
  /** The word that grows into the ground: the accent word, else the longest word. */
  const accentIdxOf = (ph: KineticPhrase, words: string[]) => { const a = accentOf(ph, words); return a >= 0 ? a : words.reduce((b, w, i) => (w.length > words[b]!.length ? i : b), 0); };
  const kindOf = (ph: KineticPhrase): "fit" | "bleed" | "hero" => ph.size ?? (ph.reveal ? "hero" : "fit");
  const film = filmOf(ctx0);
  phrases.forEach((ph, pi) => {
    if (ph.gone) return;
    // Explicit lines ("\n") keep the author's breaks.
    const given0 = ph.text.split("\n").map((l) => l.split(/\s+/).filter(Boolean)).filter((l) => l.length);
    const words = given0.flat();
    let gi = 0;
    const given = given0.length > 1 ? given0.map((l) => l.map(() => gi++)) : undefined;
    if (words.length > ctx.system.density.maxWords) console.warn(`kineticWords ${id}: "${ph.text}" has more words than ${ctx.system.id} allows on screen`);
    const t0 = ph.at;
    const tEnd = pi + 1 < phrases.length ? phrases[pi + 1]!.at : p.until !== undefined ? snap(p.until) : undefined;
    const hold = ctx.system.density.minHoldBase + ctx.system.density.minHoldPerWord * words.length;
    if (tEnd !== undefined && tEnd - t0 < hold - 1e-6) console.warn(`kineticWords ${id}: "${ph.text}" holds ${(tEnd - t0).toFixed(2)} s; ${ctx.system.id} asks for ${hold.toFixed(2)} s`);
    const motion = ctx.instant || ph.still ? "roll" : (ph.motion ?? (pi % 2 === 0 ? "roll" : "pop"));
    // Shown from `at` until the next beat. A still phrase is already shown at frame 0.
    const shown = (at: number) => ph.still
      ? { opacity: windows([[0, until(tEnd)]]) }
      : present(at, until(tEnd));
    const accentIdx = accentOf(ph, words);

    // Geometry: lines stacked, centred in the box as a block; lines left-aligned.
    const L = layoutOf(words, given, kindOf(ph));
    film.phrases.push({ id: `${id}-p${pi}`, prefix: `${id}-p${pi}-`, text: ph.text.replace(/\n/g, " "), at: t0, until: tEnd, cap: capOf(Math.max(...L.scales)), reveal: !!ph.reveal || ph.size === "hero",
      ground: ph.exit === "toGround" || !!p.onAccent, frameW: ctx.width, frameH: ctx.height });
    // Word to ground: from `grow` the accent word grows until its glyph fills the frame; on tEnd the ground is accent.
    const toGround = ph.exit === "toGround" && tEnd !== undefined;
    if (ph.exit === "toGround" && tEnd === undefined) once(`kineticWords ${id}: "${ph.text}" has exit "toGround" but no next phrase and no until: give until, the beat on which the ground changes`);
    const grow = toGround && !ctx.instant ? Math.max(t0 + 2 / 30, onGrid(tEnd! - ctx.dur.move)) : undefined;
    const growerIdx = accentIdxOf(ph, words);
    const until = (end: number | undefined) => (grow !== undefined ? grow : end);
    const heights = L.scales.map((sc) => lh * sc);
    const total = heights.reduce((a, b) => a + b, 0) + L.scales.slice(0, -1).reduce((a, sc) => a + gapOf(sc), 0);
    const blockW = Math.max(...L.lines.map((ids, i) => (ctx.measure(ids.map((k) => words[k]).join(" "), role) + slack + 1) * L.scales[i]!));
    // Left-aligned, inset by the room an overshooting pop needs, so the pop never passes the box edge.
    const left = bleed ? box.x + (box.w - blockW) / 2 : box.x + (box.w - fitW) / 2 + side * L.scales[0]!;
    const sc0 = L.scales[0]!;
    let y = box.y + (box.h - total - (over + under) * sc0) / 2 + over * sc0;
    const O: [number, number] = [left + blockW / 2, box.y + box.h / 2]; // the phrase's centre: the pop's pivot

    // Exit: a hard cut on the next beat. Every system that uses this block cuts on the beat, and a cut
    // leaves no half-gone word or block on screen.
    // The roll: each line rises out of its mask, word after word. A line's mask reaches into the next
    // line, so the next line starts only when the line above it shows inside its own line box.
    // The text box slides with the text, even where the mask hides it, so inside the safe area a line
    // rises only as far as the room below it in the box allows (checkers read the box, not the mask).
    let lineAt = t0;
    L.lines.forEach((ids, li) => {
      const sc = L.scales[li]!;
      const roomBelow = (box.y + box.h - (y + lh * sc)) / (travel0 * sc);
      const rollFrom = bleed ? 100 : 100 * Math.max(0, Math.min(1, roomBelow));
      const wordAt = (j: number) => lineAt + j * ctx.dur.stagger;
      ids.forEach((wi, j) => {
        const word = words[wi]!;
        const before = ids.slice(0, j).map((k) => words[k]).join(" ");
        const X = left + (j ? ctx.measure(before + " ", role) : 0) * sc;
        const Y = y;
        const ww = ctx.measure(word, role);
        // Place the node so that, scaled by sc about O, its line box lands at (X, Y).
        const nx = O[0] + (X - O[0]) / sc, ny = O[1] + (Y - O[1]) / sc;
        // The origin is a fraction of the node's own box: its width and its line box (the mask's pads sit outside it).
        const divW = Math.ceil(ww) + slack;
        const origin: Origin = [(O[0] - nx) / divW, (O[1] - ny) / lh];
        const at = motion === "roll" ? wordAt(j) : t0;
        const scale: Key[] = motion === "pop" ? go(ctx, t0, sc * POP_FROM, sc, "enter") : [{ t: 0, v: sc }];
        const reveal: Key[] = ctx.instant || ph.still ? [{ t: 0, v: 0 }]
          : motion === "roll" ? go(ctx, at, rollFrom, 0, rollCurve, 1, "enter") : [{ t: 0, v: 0 }];
        const isAccent = !p.onAccent && wi === accentIdx;
        const box2 = { x: X, y: Y, w: (ww + slack) * sc, h: lh * sc };
        if (!bleed && !textSafe(ctx, box2)) console.warn(`kineticWords ${id}: "${word}" is outside the text-safe area`);
        out.push({ id: `${id}-p${pi}-w${wi}`, kind: "text", x: nx, y: ny, text: word, role, mask: true, width: divW, origin,
          color: p.onAccent ? "onAccent" : isAccent ? (inkAccent ? "onAccent" : "accentText") : "ink", z: 1, ...(p.keepCase ? { keepCase: true } : {}),
          tracks: { reveal, scale, ...shown(motion === "pop" ? t0 : at) } });
        if (grow !== undefined && wi === growerIdx && !inkAccent) {
          // The grower: the same word in the accent (the colour the ground becomes), scaled about a point inside a
          // letter's stem, so the stem's ink covers the frame on the beat. No blur: only a camera whip blurs.
          const pv = stemPoint(word, size);
          const fx = pv.x / divW, fy = pv.y / lh;
          // The stem: about 0.16 of the size wide, the cap height tall, with the pivot at its middle.
          const K = coverScale(X + pv.x * sc, Y + pv.y * sc, 0.08 * size, (capFrac * size) / 2) / sc;
          out.push({ id: `${id}-p${pi}-grow`, kind: "text", x: X - fx * divW * (1 - sc), y: Y - fy * lh * (1 - sc), text: word, role, mask: true, width: divW,
            origin: [fx, fy], color: "accent", z: 2, ...(p.keepCase ? { keepCase: true } : {}),
            tracks: { reveal: [{ t: 0, v: 0 }], scale: [{ t: 0, v: sc }, { t: grow, v: sc }, { t: tEnd!, v: sc * K, curve: "exit" }], ...present(grow, tEnd) } });
        }
        if (isAccent && inkAccent) {
          // The block behind the marked word: it wipes in with a roll and scales with a pop.
          // It spans the em box from just above the capitals to just below the descenders, which reach
          // under a tight line box. The line gap keeps it clear of the next line's capitals.
          const bx = side * sc, em = Y + ((lh - size) / 2) * sc;
          const r = { x: X - bx, y: em + 0.07 * size * sc, w: ww * sc + 2 * bx, h: 1.03 * size * sc };
          const tracks = ph.still ? shown(0)
            : motion === "pop"
            ? { scale: go(ctx, t0, POP_FROM, 1, "enter"), ...present(t0, until(tEnd)) }
            : { scaleX: go(ctx, at, 0, 1, ctx.noOvershoot("enter"), 1, "enter"), ...present(at, until(tEnd)) };
          const rOrigin: Origin = motion === "pop" ? [(O[0] - r.x) / r.w, (O[1] - r.y) / r.h] : [0, 0.5];
          out.push({ id: `${id}-p${pi}-bar`, kind: "rect", ...r, fill: "accent", radius: 0, origin: rOrigin, tracks });
          if (grow !== undefined && wi === growerIdx) {
            // Where the accent is a block (accent = ink), the block itself grows until it covers the frame.
            const K = coverScale(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2);
            out.push({ id: `${id}-p${pi}-grow`, kind: "rect", ...r, fill: "accent", radius: 0, origin: [0.5, 0.5], z: 2,
              tracks: { scale: [{ t: 0, v: 1 }, { t: grow, v: 1 }, { t: tEnd!, v: K, curve: "exit" }], ...present(grow, tEnd) } });
          }
        }
      });
      y += heights[li]! + gapOf(sc);
      lineAt = wordAt(ids.length - 1) + clearAfter(rollFrom);
    });
    if (toGround) out.push({ id: `${id}-p${pi}-ground`, kind: "rect", x: 0, y: 0, w: ctx.width, h: ctx.height, fill: "accent", layer: -2, tracks: present(tEnd!, ph.groundUntil) } as Node);
  });
  return p.pinned ? out.map((n) => ({ ...n, pinned: true })) : out;
};

/** For scenes: how long a phrase of `words` words holds in this system: its minimum hold, rounded up to whole beats, at least two. */
export function holdFor(ctx: Ctx, words: number, beat: number): number {
  const d = ctx.system.density;
  return Math.max(2, Math.ceil((d.minHoldBase + d.minHoldPerWord * words) / beat - 1e-9)) * beat;
}
