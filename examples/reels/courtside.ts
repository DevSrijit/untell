// The Courtside reel: a tryout call for the girls' basketball team of Zeko Academy (a fictional school; the name is
// a random draw). It is also the media test: `sceneCodeOnly` is the same film without its pictures.
//
// The track is the clock. Its drop lands on the frame where the volt panel covers the frame, and every word cut sits
// on a beat or on the strongest onset of its stretch (beats()). No sync time is typed by hand.
// 1. 0 s to the drop. The player from behind, cut out on black. EARN, EVERY, INCH.: one word a beat pair, in one
//    band, behind her head (placeBehind keeps every letter). A short push of the camera on each cut.
// 2. The drop. The volt panel sweeps up, and the ground stays volt. She keeps her place: 6 AM.
// 3. A tight shot on the next accent: her shoes on the court line, cut out on the volt. MONDAY.
// 4. A whip pan to the end card: TRYOUTS fills the width in volt, the school and the time under it,
//    over footage of the net. One impact on the landing, then a held finish.
//
// Pictures (their sources and licences are in assets/media.json): athlete-back, courtside-shoes, hoop-net. The player
// is drawn at 0.96 times her file, 1.11 at most under her push and the camera's: the file is 853 x 1280 px.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom } from "../../src/system/scene/blocks";
import { placeBehind } from "../../src/system/scene/cover";
import { beats, revealedAt } from "../../src/system/scene/beats";
import { anchor, withView } from "../../src/system/scene/context";

export const system = "courtside";
export const seconds = 12.4;

const TRACK = "m-sparta";
// The structure: where each part goes. The track's grid moves each one onto a beat.
const PANEL = 4;
const F = 1 / 30;

/** The sync plan from the panel's nodes: when it covers the frame, where the track enters, the grid and the cut times. */
function syncPlan(ctx: Ctx, panel: Node[]) {
  // The panel's arrival is its cover (the end of its sweep up); the plan keys on the end of its sweep off, the move
  // after it, so `after` names that move.
  const cover = revealedAt(ctx.system, panel, "volt", PANEL + 0.2);
  const from = musicFrom({ media: TRACK, peakAt: cover, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const accent = (a: number, b: number) => g.onBeat(g.strongest(a, b)?.t ?? a);
  return { cover, g, accent };
}

function build(ctx: Ctx, B: typeof BLOCKS, media: boolean): Node[] {
  const S = ctx.safe, W = ctx.width;
  const out: Node[] = [];
  // The volt panel sweeps up behind her on the drop (it draws in the backdrop layer, under the cut-out).
  const panel = B.wipe({ id: "volt", at: PANEL, from: "bottom", style: "panel", fill: "accent", layer: -1 }, ctx);
  const P = syncPlan(ctx, panel);
  const COVER = P.cover;
  const EVERY = P.g.onBeat(1), INCH = P.g.onBeat(2);
  const SIX = P.accent(COVER + 0.3, COVER + 1.4);
  const SHOES = P.accent(COVER + 1.6, COVER + 3.4);
  const END = P.accent(9.2, 10.2);
  const WHIP = END - 5 * F;
  out.push(...B.reveal({ at: COVER }, ctx));

  // The player, cut out, framed low and to the right; her head sits under the words. No plate: the photo is too
  // small to fill the frame, and the cut-out keeps her sharp.
  const pw = 820, ph = Math.round(pw * 1.5);
  const player = B.photo({ id: "player", media: "athlete-back", box: { x: W - pw + 20, y: ctx.height - ph, w: pw, h: ph }, plate: false, over: true,
    motion: "push", amount: 0.05, seconds: SHOES, at: 0, until: SHOES }, ctx);

  // Part 1: three words in one band, behind her head. placeBehind picks the band where no letter is lost.
  const bands: { x: number; y: number; w: number; h: number }[] = [];
  for (const h of [300, 360, 420]) for (let y = S.top + 1; y + h <= S.bottom - 1; y += 20) bands.push({ x: S.left, y, w: S.right - S.left, h });
  // (wordSeries keeps one cap height but has no `pinned`; kineticWords is pinned, so the pushes move only the picture.)
  const part1 = (b: (typeof bands)[number]) => B.kineticWords({ id: "w1", ...b, until: COVER, pinned: true, maxLines: 1,
    phrases: [{ text: "Earn", at: 0, accent: null, motion: "pop" }, { text: "Every", at: EVERY, accent: null, motion: "pop" }, { text: "Inch.", at: INCH, accent: "Inch.", motion: "pop" }] }, ctx);
  const p1 = placeBehind(ctx, player, bands, part1, { from: 0.1, to: COVER - F });
  // Part 2: one word on the volt, behind her head again.
  const part2 = (b: (typeof bands)[number]) => B.kineticWords({ id: "six", ...b, onAccent: true, pinned: true, until: SHOES, phrases: [{ text: "6 AM.", at: SIX, accent: null, motion: "pop" }] }, ctx);
  const p2 = placeBehind(ctx, player, bands, part2, { from: SIX + 0.2, to: SHOES - F });
  if (media) out.push(...player);
  out.push(...part1(p1.pick), ...part2(p2.pick));

  // A slow push from frame 0, a short push on each word cut, a slow push under 6 AM., so the picture moves with the beat; the words are pinned and stay put.
  // The camera pulls back as the panel covers the frame, and whips right to the end card.
  const push = 6 * F / ctx.dur.move;
  out.push(...B.camera({ moves: [{ at: 0, zoom: 1.03, scale: 4 * push }, { at: EVERY, zoom: 1.06, scale: push }, { at: INCH, zoom: 1.1, scale: push },
      { at: PANEL, zoom: 1, scale: push }, { at: SIX, zoom: 1.08, scale: (SHOES - SIX) / ctx.dur.move }, { at: SHOES, zoom: 1, scale: push }],
    whips: [{ at: WHIP, dx: W, frames: 5 }] }, ctx));

  // The drop: the volt panel sweeps up behind her, and the volt ground stays until the whip lands.
  out.push(...panel);
  out.push(...B.ground({ color: "accent", at: COVER - F, until: END, enter: "cut", exit: "cut", bleed: W + 40 }, ctx));

  // Part 3: the tight shot. Her shoes on the court line, cut out on the volt, with the day above them.
  const shoeW = 1300, shoeBox = { x: Math.round((W - shoeW) / 2) - 60, y: ctx.height - 980, w: shoeW, h: Math.round(shoeW * 850 / 1280) };
  if (media) out.push(...B.photo({ id: "shoes", media: "courtside-shoes", box: shoeBox, plate: false, over: true, motion: "push", amount: 0.06, at: SHOES, until: END }, ctx));
  out.push(...B.fitText({ id: "monday", text: "Monday.", x: S.left, y: S.top + 1, w: S.right - S.left, h: shoeBox.y - S.top - 40, color: "onAccent", enter: "cut", at: SHOES, until: END }, ctx));

  // The end card, one frame wide to the right in the world: the whip lands on it. The offer fills the width in volt.
  const vctx = withView(ctx, { x: W });
  const card = B.endCard({ id: "card", name: "Tryouts", line: "Zeko Academy, Mon 6 AM", color: "accent", enter: "cut", place: "upper",
    box: { x: S.left + W, y: S.top + 1, w: S.right - S.left, h: 1200 }, at: END, until: seconds }, vctx);
  out.push(...card);
  if (media) {
    // The footage starts under the line: the name's box, then the line (body, 0.4 of a line under it), then a gap.
    const land = anchor(card, "card-land");
    const top = Math.round(land.y + land.h + ctx.lineHeight("body") * 2.4);
    out.push(...B.photo({ id: "hoop", media: "hoop-net", box: { x: W, y: top, w: W, h: ctx.height - top }, fade: "top", clipStart: 2, motion: "push", amount: 0.04, at: END, until: seconds }, vctx));
  } else {
    out.push(...B.hold({ at: END + 1, until: seconds }, ctx));
  }

  // Sound: the drop on the panel's full cover, one impact on the landing (the bed dips under it). A whoosh 3 frames
  // before it would need its own dip, and two dips that close do not fit, so the whip is silent.
  if (media) {
    const bed = B.music({ media: TRACK, peakAt: COVER, at: 0, until: seconds }, ctx);
    out.push(...bed);
    out.push(...B.hit({ id: "boom", media: "cutout-stamp", at: END, bed }, ctx));
  }
  return out;
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => build(ctx, B, true);
export const sceneCodeOnly = (ctx: Ctx, B: typeof BLOCKS): Node[] => build(ctx, B, false);
