// The Noir reel: a teaser for "The Wet Mile", a fictional film by Vilu Soluse (the names are a random draw).
// One hard light comes from the upper left for the whole film: every shadow bar falls at one angle. The slats fall
// on the pictures, never on the type.
// 1. The hook: a wet street corner at night fills the frame, under hard slats. The credit is set in the light.
// 2. A shadow sweeps the frame dark on a bar, and the next scene is lit under it: a man walks away on a bridge,
//    framed low, its top eased into the dark. The tagline takes the band of dark ground above him.
// 3. The reveal on the track's peak: the title in the light at full measure, "This winter" under it, the street in
//    the lower band. One low boom lands when the title is fully set. The slats hold to the end.
// Pictures (their sources and licences are in assets/media.json): noir-corner (a vertical clip, drawn at its own
// size), noir-bridge and noir-lane (drawn under 1.15 times their files, in boxes narrower than the frame).
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineInBand, musicFrom } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "noir";
export const seconds = 12.4;

const TRACK = "noir-music-4";
const F = 1 / 30;
// The structure: where each part goes. The beat grid moves each one onto a bar.
const PLAN = { sweep: 5.4, reveal: 8.4 };
// The light: the slats fall at this angle, rising to the right, in every shot.
const ANGLE = -12;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width, H = ctx.height;
  const out: Node[] = [];
  const REVEAL = PLAN.reveal;
  const from = musicFrom({ media: TRACK, peakAt: REVEAL, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const CUT = g.onBar(PLAN.sweep);
  // The shadow starts to sweep one exit duration before the bar. The credit goes as it starts, and the tagline comes
  // after it has passed, so the shadow never crosses a letter.
  const SWEEP = CUT - ctx.dur.exit;
  out.push(...B.reveal({ at: REVEAL }, ctx));
  const lh = (r: "display" | "headline" | "label") => Math.round(ctx.lineHeight(r));

  // 1. The hook: the wet corner, at its own size, with a slow push. The credit sits in a lit band on frame 0.
  const corner = B.photo({ id: "corner", media: "noir-corner", clipStart: 1, dim: true, motion: "still", at: 0, until: CUT + F }, ctx);
  out.push(...corner);
  // The credit sits low, on the dark wet road, where the plate is calm; the building above is bright.
  const creditH = 2 * lh("headline") + 20;
  const creditAt = { x: S.left, y: S.bottom - creditH - 40, w: S.right - S.left, h: creditH };
  const credit = B.title({ id: "credit", text: ["Vilu Soluse", "presents"], role: "headline", maxLines: 2, enter: "cut",
    ...creditAt, exit: "cut", at: 0, until: Math.min(SWEEP, g.onBeat(2.6)) }, ctx);
  out.push(...credit);
  // The slats fall on the building above the credit, so no letter sits in a dark band.
  const below = (y: number) => ({ x: 0, y, w: W, h: H - y });
  out.push(...B.shadowBars({ id: "bars1", angle: ANGLE, duty: 0.5, period: 230, plane: { x: 0, y: 0, w: W, h: creditAt.y - 40 }, at: 0, until: CUT }, ctx));

  // 2. The shadow sweeps the frame dark, and the bridge is lit under it. The tagline takes the dark band above the
  //    man; the picture fills the frame under it, its top eased into the ground. The box is a little narrower than
  //    the frame, so the photo is drawn at 1.14 times its file at most (a 4 % push), not 1.19.
  out.push(...B.wipe({ id: "sweep", at: SWEEP, style: "sweep", fill: "ground", hold: F }, ctx));
  const tagH = 3 * lh("display") + 60;
  const band = lineInBand(ctx, { lineH: tagH });
  const bw = 1000;
  out.push(...B.photo({ id: "bridge", media: "noir-bridge", box: { x: Math.round((W - bw) / 2), y: band.picture.y, w: bw, h: band.picture.h }, fade: "top",
    motion: "push", amount: 0.04, at: CUT, until: REVEAL + F }, ctx));
  const tag = B.title({ id: "tag", text: ["Nobody", "crosses", "it twice."], role: "display", maxLines: 3, ...band.line, enter: "cut", exit: "cut", at: CUT + ctx.dur.enter, until: REVEAL }, ctx);
  out.push(...tag);
  out.push(...B.shadowBars({ id: "bars2", angle: ANGLE, duty: 0.5, period: 230, plane: band.picture, at: CUT, until: REVEAL }, ctx));

  // 3. The reveal: the title in the light at full measure, the street in the lower band, and the slats over both.
  const titleY = Math.round(H * 0.27);
  const title = B.title({ id: "title", text: ["The", "Wet Mile"], role: "display", maxLines: 2, enter: "cut", x: S.left, y: titleY, w: S.right - S.left, h: 2 * lh("display") + 20, at: REVEAL }, ctx);
  const when = B.text({ id: "when", text: "This winter", role: "label", x: S.left, y: titleY + 2 * lh("display") + 24, at: g.onBeat(REVEAL + 1), enter: "cut" }, ctx);
  out.push(...title, ...when);
  const low = Math.round(H * 0.56), lw = 920;
  out.push(...B.photo({ id: "street", media: "noir-lane", box: { x: Math.round((W - lw) / 2), y: low, w: lw, h: H - low }, fade: "top", clipStart: 12, motion: "still", at: REVEAL, until: seconds }, ctx));
  out.push(...B.shadowBars({ id: "bars3", angle: ANGLE, duty: 0.5, period: 230, plane: below(low), at: REVEAL }, ctx));

  // Sound. The track's peak lands on the title. A soft whoosh rides the sweep; one low boom lands when the title is
  // fully set (its file's first second: one attack, the rumble after it is cut).
  const bed = B.music({ media: TRACK, peakAt: REVEAL, at: 0, until: seconds }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "whoosh", media: "noir-whoosh", at: CUT, bed, duck: true }, ctx));
  out.push(...B.hit({ id: "boom", media: "mark-impact", on: { nodes: title, id: "title" }, bed, duck: true }, ctx));
  return out;
};
