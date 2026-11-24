// The Studio reel: a launch film for the Bema running shoe (a fictional product; the name is a random draw).
// The object is a real model (studio-shoe: a glTF sample model with its maker's own materials, CC BY 4.0, recorded
// in assets/media.json). Each shot is a new angle of one object under one light, and the product block stands it
// on its contact shadow, so the film needs no photo drawn past its size.
//
// The one idea: a marathon is about 35 000 steps, and the shoe is made for every one.
// The fact is computed: a marathon is 42 195 m; at a step of 1.2 m that is 42 195 / 1.2 = 35 162.5, so 35 163 steps.
// The frame states the step length beside the count, so the number is checkable.
//
// Four shots on the bars of the track (108 BPM, one bar is 2.27 s), each cut on a held frame (Studio cuts or
// dissolves; it never wipes):
// 1. 0 to 3.47 s. The hook: the whole shoe, turning, under its line.
// 2. 3.47 to 8.0 s. Close on the heel and its foam, with the distance over the calm ground above it.
// 3. 8.0 to 11.97 s. The reveal, on the track's loudest bar: the count of steps in the system blue, the shoe from low.
// 4. 11.97 s to the end. The shoe from its other side, on its shadow; the name lands on the next bar, the turn ends
//    with it, and the frame holds to the end.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAbove, musicFrom, overflow } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";
import { anchor } from "../../src/system/scene/context";
import { standing } from "../../src/system/three/models";

export const system = "studio";
export const seconds = 15;

const TRACK = "studio-music-4";
/** The reveal: the count lands here, on the track's loudest bar (music peakAt, peak "loudest"). */
const REVEAL = 8;
const MARATHON_M = 42195, STEP_M = 1.2;
const STEPS = Math.round(MARATHON_M / STEP_M); // 35 163

/** The shoe, turned `turn` degrees about its vertical axis. */
const shoe = (turn: number) => [standing("shoe", "studio-shoe", { longest: 3 }, { rotation: [0, turn, 0] })];
/** One frame: a new shot starts one frame before the cut, so its canvas has drawn when the old shot goes. */
const F = 1 / 30;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const gap = Math.round(ctx.lineHeight("body"));
  const from = musicFrom({ media: TRACK, peakAt: REVEAL, peak: "loudest", until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const BAR = (g.bars[1] ?? 0) - (g.bars[0] ?? 0);
  const CUT1 = g.onBar(3.5), CUT2 = g.onBar(REVEAL), CUT3 = g.onBeat(CUT2 + 3.95);
  // The card lands on the bar after the cut to the last shot, so the cut and the card are two events.
  const LAND = Math.round((CUT2 + 2 * BAR) * 30) / 30;

  // The room under a block of height h at the text-safe top: the frame under it, a body line below it.
  const roomUnder = (h: number, foot = 0.95) => ({ x: 0, y: Math.round(S.top + h + gap), w: ctx.width, h: Math.round(ctx.height * foot - (S.top + h + gap)) });
  // The height a title sets at; the measure takes the title's own id, so it is not a second block in that place.
  const titleH = (id: string, text: string | string[], role: "display" | "headline") => Math.ceil(B.measure("title", { id, x: S.left, y: S.top, w, text, role, maxLines: 2, at: -10 }, ctx).h);

  // Shot 1: the whole shoe under its line (Studio's "top" composition). The line cuts out with its shot.
  const LINE1 = ["Made for", "the long run."];
  const h1 = titleH("line1", LINE1, "headline");
  const shot1 = B.product({ id: "s1", objects: shoe(-25), shot: "turntable", fill: 0.85, room: roomUnder(h1), at: 0, until: CUT1 }, ctx);
  const line1 = B.title({ id: "line1", text: LINE1, role: "headline", align: "center", maxLines: 2,
    ...lineAbove(ctx, anchor(shot1, "s1-object-extent"), h1), exit: "cut", at: g.beats[0] ?? 0.1, until: CUT1 }, ctx);

  // Shot 2: close on the heel and its foam. The camera aims above the heel, so the heel fills the lower frame and the
  // calm ground above it holds the distance.
  const LINE2 = ["A marathon:", "42.195 km."];
  const shot2 = B.product({ id: "s2", objects: shoe(-25), shot: "push", frame: "detail", detail: { point: [0.25, 0.95, 1], span: 0.75 }, at: CUT1 - F, until: CUT2 }, ctx);
  const line2 = B.title({ id: "line2", text: LINE2, role: "headline", align: "center", maxLines: 2, x: S.left, y: S.top, w, exit: "cut", replaces: "line1", at: g.onBeat(CUT1 + 0.5), until: CUT2 }, ctx);

  // Shot 3: the reveal. The count in display, in the system blue (the one accent of the film: the number that
  // matters), and what it counts in headline under it.
  const NUM = STEPS.toLocaleString("en-US");
  const numH = ctx.lineHeight("display");
  const UNIT = `steps of ${STEP_M} m.`;
  const unitY = Math.round(S.top + numH + ctx.lineHeight("label") * 0.5);
  const statH = unitY + ctx.lineHeight("headline") - S.top;
  const shot3 = B.product({ id: "s3", objects: shoe(20), shot: "orbit", fill: 0.85, room: roomUnder(statH, 0.97), at: CUT2 - F, until: CUT3 }, ctx);
  const num = B.title({ id: "num", text: NUM, role: "display", color: "accentText", align: "center", maxLines: 1, x: S.left, y: S.top, w, exit: "cut", at: CUT2, until: CUT3 }, ctx);
  const unit = B.title({ id: "unit", text: UNIT, role: "headline", align: "center", maxLines: 1, x: S.left, y: unitY, w, exit: "cut", at: g.onBeat(CUT2 + 0.5), until: CUT3 }, ctx);

  // Shot 4: the other side of the shoe under the card. The name in display (Studio's end): endCard sets its name in
  // headline and has no role prop, so the card is the lockup it draws, in display, landing on a bar.
  // The shoe stands on the centre of the frame, so the card does too: a box as wide as the text-safe area allows about
  // the centre. The text-safe area itself is wider on the left, and a card centred in it sat 33 px left of the shoe.
  const half = Math.min(ctx.width / 2 - S.left, S.right - ctx.width / 2);
  const L = { id: "card", name: "Bema", line: "Running shoe.", mark: "none" as const, role: "display" as const, x: Math.round(ctx.width / 2 - half),
    // The name's glyphs reach past its line box: the card starts that far under the text-safe top.
    y: S.top + overflow(ctx, "display").top, w: Math.round(2 * half), at: LAND };
  const card = B.lockup(L, ctx);
  const cardBox = B.measure("lockup", L, ctx);
  const room4 = { x: 0, y: Math.round(cardBox.y + cardBox.h + gap), w: ctx.width, h: Math.round(ctx.height * 0.95 - (cardBox.y + cardBox.h + gap)) };
  // The turn ends as the card lands, so the film closes on a held frame (Studio's end).
  const shot4 = B.product({ id: "s4", objects: shoe(155), shot: "turntable", fill: 0.85, room: room4, seconds: LAND - (CUT3 - F), at: CUT3 - F }, ctx);

  const bed = B.music({ media: TRACK, peakAt: REVEAL, peak: "loudest", until: seconds }, ctx);
  return [
    ...shot1, ...line1, ...shot2, ...line2, ...shot3, ...num, ...unit, ...shot4, ...card,
    ...B.reveal({ at: CUT2 }, ctx),
    ...B.hold({ at: LAND, until: seconds }, ctx),
    ...bed,
  ];
};
