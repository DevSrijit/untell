// The Pop reel: why popcorn pops, a fact card from Fimono, a fictional fact app (a random name draw).
// Fact: the water inside a kernel turns to steam as it heats; the pressure bursts the hull at about 180 °C (Virot
// and Ponomarenko, J. R. Soc. Interface, 2015).
//
// One character leads from the first frame to the last: the app's green mascot, a round face that bobs on the beat.
// 1. Frame 0: the question over the mascot, large in the middle; it grows in with an overshoot and bobs at once.
// 2. The heat: the question gives its place to a chunky meter, "Kernel heat, °C", which fills to the 180 °C mark; the
//    mascot moves down to make room.
// 3. The burst, on the track's drop: the meter goes, the mascot sinks lower, the popcorn (a cut-out sticker on a
//    disc) pops in over its head, and the answer takes the line's place.
// 4. The end: the app's lockup in the line's place, and a chunky Play button that sinks when it is pressed. The mascot
//    keeps a small idle bounce under them.
// No block draws a character with face states yet (Pop's block map names it as missing): the mascot is a circle with
// two eyes, and the same moves carry the face and the eyes.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { buttonSize, lineAndSubject, musicFrom } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "pop";
export const seconds = 12.5;

const TRACK = "pop-music-823";
/** The burst lands on the track's drop. */
const DROP = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left, cx = ctx.width / 2;
  const from = musicFrom({ media: TRACK, peakAt: DROP, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const at = (k: number) => g.cuts.find((b) => b >= k) ?? k;
  // The question holds 2.4 s (four words); the answer holds 3.3 s (seven words).
  const BURST = DROP, HEAT = at(2.4), END = at(BURST + 3.3), PRESS = at(END + 0.9);
  const out: Node[] = [];

  // 1. The question and the mascot: the pair on the optical centre. The line's slot is as tall as the meter that
  // takes it later, so the mascot moves down only by the difference.
  const Q = "Why does popcorn pop?";
  const qP = { id: "q", text: Q, x: S.left, y: S.top, w, role: "headline" as const, align: "center" as const, maxLines: 2 };
  const qH = Math.ceil(B.measure("title", { ...qP, at: -1 }, ctx).h);
  const L = lineAndSubject(ctx, { lineH: qH, area: 0.22 });
  const k = L.subject, r = k.w / 2, kc = { x: k.x + r, y: k.y + r };
  out.push(...B.title({ ...qP, y: L.line.y, exit: "cut", at: -1, until: HEAT }, ctx));
  const meterH = 300, gap = Math.round(ctx.lineHeight("body") * 0.6);
  const DOWN = Math.max(0, Math.round(L.line.y + meterH + gap - k.y));
  // At the burst the mascot sinks lower again, so the popcorn has room over its head.
  const aP = { ...qP, id: "answer", text: "The steam bursts the hull at 180 °C." };
  const aH = Math.ceil(B.measure("title", { ...aP, at: -1 }, ctx).h);
  const cornTop = L.line.y + aH + gap, side = Math.round(w * 0.42);
  const DOWN2 = Math.max(DOWN, Math.round(cornTop + side + gap * 2 - k.y));

  // The mascot bobs on the beat: up on one beat, down on the next; from the heat on it sits DOWN lower. Every part of
  // the face takes the same moves.
  const BOB = Math.round(r * 0.08);
  // A move takes longer than one beat, so the bob goes on every other beat.
  const moves = g.beats.filter((b, i) => i % 2 === 1 && b < seconds - 0.6).map((b, i) => {
    const base = b >= BURST ? DOWN2 : b >= HEAT ? DOWN : 0;
    return { at: b, to: [0, base - (i % 2 === 0 ? BOB : 0)] as [number, number] };
  });
  const face = B.shape({ id: "mascot", kind: "circle", ...k, fill: "accent", enter: "grow", moves, at: 0 }, ctx);
  const eye = (id: string, dx: number) => B.shape({ id, kind: "circle", x: kc.x + dx - r * 0.09, y: kc.y - r * 0.25, w: r * 0.18, h: r * 0.18, fill: "ink", enter: "grow", moves, at: 0.3 }, ctx);
  out.push(...face, ...eye("eye-l", -r * 0.32), ...eye("eye-r", r * 0.32));

  // 2. The heat: a chunky meter in the question's place. The scale runs past the mark, so the mark's label stays in
  // the text-safe area.
  const meterY = L.line.y;
  out.push(...B.meter({ id: "heat", x: S.left, y: meterY, w, h: meterH, title: "Kernel heat, °C", value: 180, target: 180, max: 220, targetLabel: "Pops at", at: HEAT, until: BURST }, ctx));

  // 3. The burst on the drop: the popcorn pops in over the mascot's head, in the meter's place; the answer over it.
  out.push(...B.title({ ...aP, y: L.line.y, replaces: "heat", at: BURST, until: END }, ctx));
  const cornFoot = k.y + DOWN2 - BOB - gap;
  const corn = B.photo({ id: "corn", media: "pop-popcorn", box: { x: Math.round(cx - side / 2), y: Math.round(cornTop + (cornFoot - cornTop - side) / 2), w: side, h: side }, shape: "circle", sticker: true, motion: "still", enter: "cut", at: BURST, until: END }, ctx);
  out.push(...corn);
  out.push(...B.reveal({ at: BURST }, ctx));

  // 4. The end: the app's lockup in the line's place, with the mascot's green disc as its mark, and the Play button
  // in the popcorn's place, pressed on a beat. The mascot bobs under them to the last frame.
  out.push(...B.lockup({ id: "app", name: "Fimono", line: "One fact a day.", mark: "circle", markColor: "accent", axis: "row", x: S.left, y: L.line.y, w, replaces: "answer", at: END }, ctx));
  const bs = buttonSize(ctx, "Play");
  const playY = Math.round(cornTop + (cornFoot - cornTop - bs.h) / 2);
  out.push(...B.button({ id: "play", x: Math.round(cx - bs.w / 2), y: playY, text: "Play", kind: "primary", depth: Math.round(bs.h * 0.25), press: [PRESS], at: at(END + 0.4) }, ctx));
  out.push(...B.hold({ at: PRESS + 0.4, until: seconds }, ctx));

  // Sound: the drop on the burst; a pop as the mascot lands, a pop as the popcorn lands, a pop as the button sinks.
  // The hits duck the bed under them by default.
  // The bed fades over the last second, so the duck under the press fits inside it.
  const bed = B.music({ media: TRACK, peakAt: DROP, until: seconds, fadeOut: 1 }, ctx);
  out.push(...bed);
  // The mascot's moves are arrivals too, so the landing pop takes the grow's own end, not the last arrival.
  out.push(...B.hit({ id: "hit-land", media: "pop-bubble", at: ctx.dur.enter, bed }, ctx));
  out.push(...B.hit({ id: "hit-corn", media: "pop-bubble", on: { nodes: corn, id: "corn" }, bed }, ctx));
  // The click (pop-click) was masked by the bed in 250-500 Hz even with the duck (listen mix): the press takes a pop.
  out.push(...B.hit({ id: "hit-play", media: "pop-bubble", at: PRESS, bed, duck: true }, ctx));
  return out;
};
