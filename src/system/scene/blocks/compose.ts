// Compose: where a film's one subject and its one line go when the scene does not tune them. A fresh agent placed
// both from ctx.safe.top, so content sat in the top third and the lower half stayed empty (the defaults read-through,
// an agents' case).
//
// Rules:
// - The subject's size comes from the system's hook: its box covers `hook.area` of the frame (Direction), or 25 %
//   when the hook names no area. It keeps its aspect, and it stays inside the picture-safe area (the frame inside the
//   system's margin; graphics may use the lower band at 9:16).
// - One line and one subject stack as a pair, the line above, and the pair centres on the optical centre of the
//   area from the text-safe top to the picture-safe foot: a little above the middle (46 %).
// - The line keeps the text-safe area: its box is the text-safe width.
// - A system whose grammar places them elsewhere says so in its Direction `compose` line; these helpers are its
//   default "centred" form.
import { DIRECTION } from "../../direction";
import { MEDIA } from "../../media.gen";
import { hiddenBy } from "../cover";
import type { Ctx, Node } from "../types";
import type { TypeRole } from "../../systems";
import { pictureSafe } from "./sheet";

export type Box = { x: number; y: number; w: number; h: number };

/** The share of the frame the system's main subject covers by default: the hook's area, else 25 %. */
export const heroArea = (ctx: Pick<Ctx, "system">): number => DIRECTION[ctx.system.id]?.hook.area ?? 0.25;

/**
 * The box of a system's main subject (a mark, a stat's figure, a drawing, a shape) at aspect w / h: it covers the
 * hook's share of the frame, inside the picture-safe area (and inside `room`, when given), centred in it.
 */
export function heroBox(ctx: Ctx, aspect = 1, o: { area?: number; room?: Box } = {}): Box {
  const R = o.room ?? pictureSafe(ctx);
  const A = (o.area ?? heroArea(ctx)) * ctx.width * ctx.height;
  let w = Math.sqrt(A * aspect), h = w / aspect;
  const k = Math.min(1, R.w / w, R.h / h);
  w *= k; h *= k;
  return { x: Math.round(R.x + (R.w - w) / 2), y: Math.round(R.y + (R.h - h) / 2), w: Math.round(w), h: Math.round(h) };
}

/**
 * One line over one subject, as a pair centred on the optical centre (46 % down the area from the text-safe top to
 * the picture-safe foot). `lineH` is the line's height (ctx.lineHeight(role) times its lines). The subject covers
 * the hook's share of the frame where the room allows, at `aspect`.
 * Returns the line's box (text-safe width) and the subject's box.
 */
export function lineAndSubject(ctx: Ctx, o: { lineH: number; aspect?: number; area?: number; gap?: number }): { line: Box; subject: Box } {
  const P = pictureSafe(ctx), S = ctx.safe;
  const gap = o.gap ?? Math.round(ctx.lineHeight("body"));
  const top = S.top, foot = P.y + P.h;
  // The subject's room: the area under the line, and the picture-safe width.
  const subject0 = heroBox(ctx, o.aspect ?? 1, { area: o.area, room: { x: P.x, y: top + o.lineH + gap, w: P.w, h: foot - (top + o.lineH + gap) } });
  const pairH = o.lineH + gap + subject0.h;
  // The pair's centre on the optical centre, then held inside the area.
  const y0 = Math.min(foot - pairH, Math.max(top, Math.round(top + (foot - top) * 0.46 - pairH / 2)));
  const line = { x: S.left, y: y0, w: S.right - S.left, h: o.lineH };
  const subject = { ...subject0, y: y0 + o.lineH + gap };
  return { line, subject };
}

// ---------------------------------------------------------------- a line over a picture, a line over a 3D subject

/** How much of a frame rect a picture's subject takes at time t: its mask, else its subject box. 0 for a plate. */
function subjectIn(ctx: Ctx, img: Extract<Node, { kind: "image" }>, r: [number, number, number, number], t: number): number {
  const info = MEDIA[img.src.split("/")[0]!];
  if (!info) return 0;
  if (info.mask) return hiddenBy(ctx, img, info, r, t);
  const [sx0, sy0, sx1, sy1] = info.subject;
  // A plate (a shadow, rain, a wall) has no subject to keep clear of: its subject box is the whole picture.
  if ((sx1 - sx0) * (sy1 - sy0) >= 0.9) return 0;
  const s = Math.max(img.w / info.width, img.h / info.height), dw = info.width * s, dh = info.height * s;
  const [fx, fy] = img.focus ?? [0.5, 0.5];
  const ox = img.x + (img.w - dw) * fx, oy = img.y + (img.h - dh) * fy;
  const b = [ox + sx0 * dw, oy + sy0 * dh, ox + sx1 * dw, oy + sy1 * dh];
  const ix = Math.max(0, Math.min(r[2], b[2]!) - Math.max(r[0], b[0]!)), iy = Math.max(0, Math.min(r[3], b[3]!) - Math.max(r[1], b[1]!));
  return (ix * iy) / ((r[2] - r[0]) * (r[3] - r[1]));
}

/**
 * Where the line of a beat sits over a picture (a photo's image node), clear of its subject. The subject is the
 * picture's mask, else its subject box; a plate with no subject (a shadow, rain, a wall) has none. In this order:
 * 1. the largest calm area across the text-safe width: the first height from the top (prefer "top") or the one nearest
 *    the optical centre (prefer "centre") where the subject takes under 2 % of the line's box at every sampled time;
 * 2. a calm column beside the subject, at least 60 % of the text-safe width (the line wraps into it);
 * 3. none: `dim` is true and the line box is the least covered place. The block warns. Then do not set the line across
 *    the subject: plan it behind a cut-out subject (placeBehind), choose a picture with a calm part in the text-safe
 *    area, or give the line its own beat on a dimmed plate.
 * Give `lineH` as the height of the line at the full width; a column beside the subject is narrower, so its line takes
 * more rows: give `rows` (the height for a width, B.measure) to size it.
 */
export function lineOverPicture(ctx: Ctx, img: Node, lineH: number, o: { prefer?: "top" | "centre"; times?: number[]; rows?: (w: number) => number } = {}): { line: Box; clear: number; dim: boolean } {
  const S = ctx.safe, w = S.right - S.left;
  const times = o.times ?? [0, 1, 2, 3];
  if (img.kind !== "image") throw new Error("lineOverPicture: give the photo's image node");
  const mid = S.top + (S.bottom - S.top) * 0.46;
  const scan = (x: number, cw: number, h: number) => {
    const cands: { y: number; hit: number }[] = [];
    for (let y = S.top; y + h <= S.bottom; y += 8) {
      const r: [number, number, number, number] = [x, y, x + cw, y + h];
      cands.push({ y, hit: Math.max(...times.map((t) => subjectIn(ctx, img, r, t))) });
    }
    return cands;
  };
  const choose = (cands: { y: number; hit: number }[], h: number) => {
    const ok = cands.filter((c) => c.hit < 0.02);
    if (!ok.length) return undefined;
    return o.prefer === "centre" ? ok.reduce((a, b) => (Math.abs(b.y + h / 2 - mid) < Math.abs(a.y + h / 2 - mid) ? b : a)) : ok[0]!;
  };
  // 1. Across the text-safe width.
  const across = scan(S.left, w, lineH);
  const a = choose(across, lineH);
  if (a) return { line: { x: S.left, y: a.y, w, h: lineH }, clear: 1 - a.hit, dim: false };
  // 2. A column beside the subject, from the left or the right text-safe edge.
  for (const f of [0.8, 0.7, 0.6]) {
    const cw = Math.round(w * f), h = o.rows ? o.rows(cw) : Math.ceil(lineH / f);
    for (const x of [S.left, S.right - cw]) {
      const c = choose(scan(x, cw, h), h);
      if (c) return { line: { x, y: c.y, w: cw, h }, clear: 1 - c.hit, dim: false };
    }
  }
  // 3. No calm place: the least covered place across, and a warning.
  const least = across.reduce((p, q) => (q.hit < p.hit ? q : p), across[0] ?? { y: S.top, hit: 1 });
  console.warn(`lineOverPicture: the picture "${img.src}" leaves no calm part for a ${Math.round(lineH)} px line in the text-safe area; the line would cover ${Math.round(least.hit * 100)} % subject. Place it behind a cut-out subject (placeBehind), choose a picture with a calm part, or give the line its own beat on a dimmed plate.`);
  return { line: { x: S.left, y: least.y, w, h: lineH }, clear: 1 - least.hit, dim: true };
}

/**
 * The line in a band of its own and the picture beside it: the poster form for a picture whose subject fills the
 * frame (a figure), where no calm part holds the line.
 * - Tall frames (9:16): the line sits at the text-safe top; the band runs from the frame's top to one gap under the
 *   line; the picture fills the rest of the frame, full bleed at the sides and the foot.
 * - Wide frames (16:9, 1:1): the band is a column at the left (42 % of the frame); the line sits in it on the optical
 *   centre; the picture fills the rest of the frame, full bleed at the top, the right and the foot. A portrait
 *   picture cropped to a wide band would lose the figure's head.
 * Give the picture's box to `photo` (`box`); the photo crops on its subject, so the figure stays whole.
 * - `overlap` (tall frames): the picture starts this many px above the band's foot, so a cut-out subject (`photo`
 *   `over`) can rise in front of the line's foot (type behind the subject; check each letter with placeBehind).
 * - `rows`: the line's height at a width (B.measure), for the column's narrower width.
 * - `lines`: the line's text broken at a width (the title's lines): the column widens, up to half the frame, until the
 *   last line holds more than one word, when the measure allows it.
 * - What the band is belongs to the system: the paper (Riso: the inks knocked out under the type), the dark ground
 *   with the picture's edge eased into it (`photo` `fade: "top"` where `side` is "top": Noir), a band of the ground.
 * Returns the line's box, the band, the picture's box, and `side`: where the band is ("top" or "left").
 */
/**
 * How far a role's glyphs reach past its line box, top and bottom (textSafe checks the glyph box, about 1.4 x the size
 * tall). With no role: the largest role whose line fits in `lineH`. A bleed role (Kinetic and Courtside display) has
 * none: it may run past the safe area.
 */
export function glyphOverflow(ctx: Ctx, lineH: number, role?: TypeRole): number {
  // A role the system lets run past the safe area (bleed: Kinetic and Courtside display) is not held to textSafe.
  const of = (r: TypeRole) => (ctx.system.bleed?.includes(r) ? 0 : Math.max(0, (ctx.size(r) * 1.4 - ctx.lineHeight(r)) / 2));
  if (role) return Math.ceil(of(role));
  // No role given: the largest role whose line fits in lineH (the line is set in it, or in a smaller one that
  // overflows less when its leading is the same).
  const fits = (Object.keys(ctx.system.type) as TypeRole[]).filter((r) => ctx.lineHeight(r) <= lineH + 0.5).sort((a, b) => ctx.lineHeight(b) - ctx.lineHeight(a));
  return fits.length ? Math.ceil(of(fits[0]!)) : 0;
}

export function lineInBand(ctx: Ctx, o: { lineH: number; gap?: number; overlap?: number; role?: TypeRole; rows?: (w: number) => number; lines?: (w: number) => string[] }): { line: Box; band: Box; picture: Box; side: "top" | "left" } {
  // The line sits by its ink, not its line box: its glyphs stay inside the text-safe area (before: a line at the
  // text-safe top made the text block warn). `role` names the line's role; without it, the most any role needs.
  const g = glyphOverflow(ctx, o.lineH, o.role);
  const S = { ...ctx.safe, top: ctx.safe.top + g, bottom: ctx.safe.bottom - g };
  const gap = o.gap ?? Math.round(ctx.lineHeight("body"));
  if (ctx.width > ctx.height * 1.05) {
    // The column: 42 % of the frame. With `lines` (the line's text broken at a width), it widens in steps, up to half
    // the frame, while the last line holds one word alone ("each / time."): the measure allows a better break.
    const lone = (w: number) => { const ls = o.lines!(w); return ls.length > 1 && !ls[ls.length - 1]!.trim().includes(" "); };
    let colW = Math.round(ctx.width * 0.42);
    if (o.lines) for (let f = 0.42; f <= 0.5 + 1e-9 && lone(colW - S.left - gap); f += 0.02) colW = Math.round(ctx.width * f);
    const w = colW - S.left - gap;
    const h = Math.round(o.rows ? o.rows(w) : o.lineH);
    const y = Math.round(Math.min(S.bottom - h, Math.max(S.top, S.top + (S.bottom - S.top) * 0.46 - h / 2)));
    return { line: { x: S.left, y, w, h }, band: { x: 0, y: 0, w: colW, h: ctx.height }, picture: { x: colW, y: 0, w: ctx.width - colW, h: ctx.height }, side: "left" };
  }
  const line = { x: S.left, y: S.top, w: S.right - S.left, h: Math.round(o.lineH) };
  const foot = Math.round(S.top + o.lineH + gap);
  const top = Math.max(0, foot - (o.overlap ?? 0));
  return { line, band: { x: 0, y: 0, w: ctx.width, h: foot }, picture: { x: 0, y: top, w: ctx.width, h: ctx.height - top }, side: "top" };
}

/**
 * The line of a beat above a subject whose drawn bounds are known (a product's anchors, at its largest moment): it
 * ends one gap above the subject's top; when that leaves it above the text-safe top, it goes under the subject.
 */
export function lineAbove(ctx: Ctx, subject: Box, lineH: number, gap = Math.round(ctx.lineHeight("body"))): Box {
  const S = ctx.safe;
  const y = subject.y - gap - lineH;
  // A subject framed to a room under the line rests on the room's top within a px or two of rounding: the line fits.
  if (y >= S.top - 2) return { x: S.left, y: Math.max(S.top, Math.min(y, Math.round(S.top + (subject.y - S.top - lineH) / 2))), w: S.right - S.left, h: lineH };
  return { x: S.left, y: Math.min(S.bottom - lineH, subject.y + subject.h + gap), w: S.right - S.left, h: lineH };
}

/** The union of boxes: a subject at its largest across its moments (a product's start and end anchors). */
export function unionBox(...bs: Box[]): Box {
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * A block under its line: the line at the text-safe top (its box is the text-safe width), the block's box from one gap
 * under the line to the text-safe foot, and the room a graphic part may take: the same top, down to the picture-safe
 * foot (the lower band at 9:16), across the picture-safe width. Use it when the subject is a block with text (a chart, a
 * list, code, a diagram): its text keeps to `block`, and a panel, a picture or a drawing under it may run on to
 * `graphic`'s foot, so the lower part of a 9:16 frame is not left empty by habit.
 */
export function lineAndBlock(ctx: Ctx, o: { lineH: number; gap?: number }): { line: Box; block: Box; graphic: Box } {
  const S = ctx.safe, P = pictureSafe(ctx);
  const gap = o.gap ?? Math.round(ctx.lineHeight("body"));
  const line = { x: S.left, y: S.top, w: S.right - S.left, h: Math.round(o.lineH) };
  const top = Math.round(S.top + o.lineH + gap);
  return { line, block: { x: S.left, y: top, w: S.right - S.left, h: S.bottom - top }, graphic: { x: P.x, y: top, w: P.w, h: P.y + P.h - top } };
}
