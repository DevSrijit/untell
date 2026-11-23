// The Keynote reel: the launch of the Zodeno 7x50, a fictional pair of night binoculars (the name is a random draw).
// The subject is a real 3D model (keynote-binocular; its source and licence are in assets/media.json). It emerges
// lit on black, and a narrow band of light crosses it in each shot. Type is one masked line a scene.
//
// Four shots and an end card, cut on the bars of the track. The track is the clock of a swell: its loudest bar lands
// on the reveal (music peakAt with peak "loudest"), so the bed rises into it.
// 1. 0 s to the first cut. The binoculars at three-quarters, large, on a slow push. "Made for the dark."
// 2. To the reveal. A macro on one objective lens: the glass and its brass rim fill the frame. The light crosses the
//    glass.
// 3. The reveal, on the loudest bar. The binoculars in profile, on an orbit. The name enters.
// 4. One bar pair later. The eyepieces turn toward the viewer. One true fact: a 7x50 binocular magnifies 7 times.
// 5. The end. The binoculars small and centred, the full name under them in headline, the line in the link blue.
//    One low impact on the card, then a held finish.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAbove, musicFrom } from "../../src/system/scene/blocks";
import { anchor } from "../../src/system/scene/context";
import { beats } from "../../src/system/scene/beats";
import { standing } from "../../src/system/three/models";

export const system = "keynote";
export const seconds = 16;

const TRACK = "keynote-music-2";
const MODEL = "keynote-binocular";
// The structure: where each part goes in the film. The beat grid moves each one onto a bar.
const PLAN = { cut1: 3.6, reveal: 7.4, cut3: 10.6, end: 13.8 };

/** The binoculars, 2.4 units wide, turned `turn` degrees about the vertical axis. */
const bino = (turn: number) => [standing("bino", MODEL, { width: 2.4 }, { rotation: [0, turn, 0] })];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const out: Node[] = [];
  const S = ctx.safe;
  const from = musicFrom({ media: TRACK, peakAt: PLAN.reveal, peak: "loudest", until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const REVEAL = PLAN.reveal;
  const CUT1 = g.onBar(PLAN.cut1), CUT3 = g.onBar(PLAN.cut3), END = g.onBar(PLAN.end);
  out.push(...B.reveal({ at: REVEAL }, ctx));

  // Each line is centred on the frame, as the binoculars are: a box as wide as the safe area allows about the centre.
  const half = Math.min(ctx.width / 2 - S.left, S.right - ctx.width / 2);
  const centred = (b: { y: number; h: number }) => ({ x: Math.round(ctx.width / 2 - half), w: Math.round(2 * half), y: b.y, h: b.h });
  const lineH = (role: "display" | "headline", n = 1) => Math.round(ctx.lineHeight(role) * n);
  const gap = Math.round(ctx.lineHeight("body"));
  // The room each shot keeps for its line: under the line at the text-safe top, to the frame's foot.
  const roomUnder = (h: number) => ({ x: 0, y: S.top + h + gap, w: ctx.width, h: ctx.height - (S.top + h + gap) });

  // 1. The hook: the binoculars at three-quarters, large, on a slow push. The light crosses them at 1 s.
  const h1 = lineH("headline", 2);
  const shot1 = B.product({ id: "s1", objects: bino(-28), shot: "push", fill: 0.86, room: roomUnder(h1), sweep: 1.0, at: 0, until: CUT1, seconds: CUT1 }, ctx);
  out.push(...shot1);
  const l1 = lineAbove(ctx, anchor(shot1, "s1-object-extent"), h1, gap);
  out.push(...B.title({ id: "open", text: ["Made for", "the dark."], role: "headline", align: "center", maxLines: 2, ...centred(l1), exit: "cut", at: 0, until: CUT1 }, ctx));

  // 2. The macro: one objective lens fills the frame. The light crosses the glass and is brightest before the cut.
  out.push(...B.product({ id: "s2", objects: bino(-28), shot: "push", frame: "detail", detail: { point: [0.22, 0.5, 1], span: 1.1 },
    sweep: REVEAL - CUT1 - 1.4, at: CUT1, until: REVEAL, seconds: REVEAL - CUT1 }, ctx));

  // 3. The reveal on the loudest bar: the binoculars in profile, on an orbit. The name rises out of its mask.
  const h3 = lineH("display");
  const shot3 = B.product({ id: "s3", objects: bino(100), shot: "orbit", fill: 0.86, room: roomUnder(h3), sweep: 0.6, at: REVEAL, until: CUT3, seconds: CUT3 - REVEAL }, ctx);
  out.push(...shot3);
  const l3 = lineAbove(ctx, anchor(shot3, "s3-object-extent"), h3, gap);
  out.push(...B.title({ id: "name", text: "Zodeno", role: "display", align: "center", maxLines: 1, ...centred(l3), exit: "cut", at: REVEAL, until: CUT3 }, ctx));

  // 4. The eyepieces turn toward the viewer. One fact, true by the product's name: 7x50 magnifies 7 times.
  const h4 = lineH("headline", 2);
  const shot4 = B.product({ id: "s4", objects: bino(180), shot: "turntable", fill: 0.86, room: roomUnder(h4), sweep: 0.8, at: CUT3, until: END, seconds: END - CUT3 }, ctx);
  out.push(...shot4);
  const l4 = lineAbove(ctx, anchor(shot4, "s4-object-extent"), h4, gap);
  out.push(...B.title({ id: "fact", text: ["Seven times", "closer."], role: "headline", align: "center", maxLines: 2, ...centred(l4), exit: "cut", at: CUT3, until: END }, ctx));

  // 5. The end: the binoculars small and centred, the name under them in headline, the line in the link blue.
  const cardH = Math.round(ctx.lineHeight("headline") + ctx.lineHeight("body") * 1.4);
  // The name must end by the low band's right edge below lowBandTop, so the pair sits above it: the binoculars at the
  // text-safe top, the name under them, clear of the low band.
  const objRoom = { x: 0, y: S.top, w: ctx.width, h: Math.round(S.lowBandTop - S.top - ctx.lineHeight("headline") - 2 * gap) };
  const shot5 = B.product({ id: "s5", objects: bino(-20), shot: "still", fill: 0.5, room: objRoom, sweep: false, at: END }, ctx);
  out.push(...shot5);
  const obj = anchor(shot5, "s5-object-extent");
  const card = B.lockup({ id: "card", name: "Zodeno 7x50", line: "Made for the dark.", mark: "none", axis: "column", role: "headline",
    enter: "cut", lineColor: "accentText", ...centred({ y: obj.y + obj.h + gap, h: cardH }), at: END }, ctx);
  out.push(...card);

  // Sound. The bed is audible from frame 0 and rises into the reveal: its loudest bar is the swell. One low impact
  // lands on the end card's cut. (A swell effect on the reveal was masked by the bed there, so the bed carries it.)
  const bed = B.music({ media: TRACK, peakAt: REVEAL, peak: "loudest", at: 0, until: seconds }, ctx);
  out.push(...bed);
  // The part ends 2 s into the file, under -40 dB, so the tail ends before the film does.
  out.push(...B.hit({ id: "impact", media: "mark-impact", on: { nodes: card, id: "card" }, bed, duck: true, part: [0, 2] }, ctx));
  return out;
};
