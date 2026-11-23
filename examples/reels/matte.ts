// The Matte reel: a launch film for the Humave lounge chair (a fictional product; the name is a random draw).
// The chair is a real 3D model by an artist (model-armchair; its source and licence are in assets/media.json): oiled
// wood arms and a black leather cushion, with the maker's own materials. It stands on a dark floor that reflects it.
// The film used a code-drawn pepper mill before; a real model now takes the place of code-drawn 3D.
//
// Five shots, cut on the bars of the track. The track opens on the start of a section with a pulse (Matte's entry
// rule: `section`), so the first frame already has its beat.
// 1. 0 s to the third bar. The chair on its floor at three-quarters, large, on a slow orbit, with one line at the top.
//    On the track's first rise the light crosses it.
// 2. A macro: where the wooden arm meets the leather cushion. The camera pushes in.
// 3. A closer view: the seat cushion between the two arms, from the front. The light crosses it.
// 4. The reveal: the whole chair from the other side, on a turntable. The light crosses it, and a soft swell lands
//    on the cut. The name enters.
// 5. The end: a clean front view on a bar, the name and the kind of object above the chair, held.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAbove } from "../../src/system/scene/blocks";
import { anchor } from "../../src/system/scene/context";
import { beats } from "../../src/system/scene/beats";
import { standing } from "../../src/system/three/models";

export const system = "matte";
export const seconds = 15.2;

const TRACK = "matte-music-3";
// The section of the track where the drums and the bass come in (listen.md: bars 79-103, from 202.7 s).
const SECTION = 202.7;

/** The chair, 3 units tall, turned `turn` degrees about the vertical axis. */
const chair = (turn: number) => [standing("chair", "model-armchair", { height: 3 }, { rotation: [0, turn, 0] })];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const out: Node[] = [];
  const S = ctx.safe;
  const g = beats(TRACK, { from: SECTION, until: seconds });
  // The bars of the section: 0, 2.83, 5.40, 7.97, 10.53 and 13.10 s. Each shot starts on one.
  const bar = (n: number) => g.bars[n]!;
  const CUT1 = bar(2), CUT2 = bar(3), REVEAL = bar(4), END = bar(5);
  out.push(...B.reveal({ at: REVEAL }, ctx));

  const gap = Math.round(ctx.lineHeight("body"));
  const lineH = (n: number) => Math.round(ctx.lineHeight("headline") * n);
  const roomUnder = (h: number) => ({ x: 0, y: S.top + h + gap, w: ctx.width, h: ctx.height - (S.top + h + gap) });

  // Each line leaves one exit duration before its cut, so it is gone when the next shot shows.
  // 1. The hook: the chair on its floor, large, on a slow orbit. The line at the text-safe top.
  // The line is on frame 0, at the top. The light sweep crosses the chair on the strongest onset of the first bar
  // (2.13 s into the section).
  const RISE = g.strongest(bar(0) + 1.5, bar(1))?.t ?? bar(1);
  const h1 = lineH(2);
  const s1 = B.product({ id: "s1", objects: chair(-75), shot: "orbit", room: roomUnder(h1), sweep: RISE, at: 0, until: CUT1, seconds: CUT1 }, ctx);
  out.push(...s1);
  out.push(...B.text({ id: "open", text: ["Sit low.", "Stay long."], role: "headline", ...lineAbove(ctx, anchor(s1, "s1-object-extent"), h1, gap), at: 0, until: CUT1 - ctx.dur.exit }, ctx));

  // 2. A macro that explains the chair: the oiled arm over the leather cushion. The camera pushes in.
  out.push(...B.product({ id: "s2", objects: chair(-30), shot: "push", frame: "detail", detail: { point: [0.12, 0.55, 0.85], span: 0.4 },
    sweep: 0.5, at: CUT1, until: CUT2, seconds: CUT2 - CUT1 }, ctx));

  // 3. A closer view of the seat from the front: the cushion between the two arms. The light crosses it and is
  //    brightest before the cut.
  out.push(...B.product({ id: "s3", objects: chair(-30), shot: "push", frame: "detail", detail: { point: [0.5, 0.42, 0.95], span: 0.55 },
    sweep: REVEAL - CUT2 - 1.6, at: CUT2, until: REVEAL, seconds: REVEAL - CUT2 }, ctx));

  // 4. The reveal: the whole chair from the other side, on a turntable. The name at the text-safe top.
  const h4 = lineH(1);
  const s4 = B.product({ id: "s4", objects: chair(55), shot: "turntable", room: roomUnder(h4), sweep: 0.4, at: REVEAL, until: END, seconds: END - REVEAL }, ctx);
  out.push(...s4);
  out.push(...B.text({ id: "name", text: "Humave", role: "headline", ...lineAbove(ctx, anchor(s4, "s4-object-extent"), h4, gap), at: REVEAL + 0.2, until: END - ctx.dur.exit }, ctx));

  // 5. The end: a clean front view on the last bar. The name and the kind of object above the chair, held.
  // Matte asks for the name beside the object; the endCard block centres its lockup in a box, so the box is the
  // band above the chair (a block for an end card beside an object is not in the catalog yet).
  const cardH = Math.round(ctx.lineHeight("headline") + ctx.lineHeight("label") * 1.6);
  const s5 = B.product({ id: "s5", objects: chair(0), shot: "still", room: roomUnder(cardH), sweep: false, at: END }, ctx);
  out.push(...s5);
  const card = lineAbove(ctx, anchor(s5, "s5-object-extent"), cardH, gap);
  const endNodes = B.endCard({ id: "card", name: "Humave", line: "Lounge chair", box: card, place: "middle", enter: "cut", at: END, until: seconds }, ctx);
  out.push(...endNodes);

  // Sound. The bed opens on the section's first bar. A soft swell (a reversed cymbal) peaks on the reveal's cut,
  // as the light crosses the leather into it.
  const bed = B.music({ media: TRACK, align: { track: SECTION, film: 0 }, at: 0, until: seconds }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "swell", media: "matte-swell", at: REVEAL, bed, duck: true }, ctx));
  return out;
};
