// The Schematic reel: how far does one turn of the pedals move a bicycle? The facts are arithmetic:
// - A 48-tooth chainring drives a 12-tooth rear cog. 48 / 12 = 4, so the rear wheel turns 4 times.
// - A 700 x 25c tyre (ISO 25-622) is about 622 + 2 x 25 = 672 mm across. One turn rolls pi x 672 mm = 2.11 m.
//   Four turns roll 8.445 m, shown as 8.44 m.
//
// One drawing sheet with two figures, and a status line at the top that changes with each step:
// 1. Frame 0: the full drawing in hairlines. The road (FIG. 2) runs across the frame under the status line; the drive
//    (FIG. 1) owns the frame under it, drawn upright: the chainring large at the foot, the cog over it, the chain
//    between. The gears keep the ratio of their teeth; the distance between them is shortened, as a schematic draws a
//    drive. The question sits in the status line.
// 2. The callouts lock on the parts. The pedals turn once; the chain runs in blue, and the cog turns four times.
// 3. On the road, at its own scale: the wheel rolls four turns, one every two beats. Each turn lays down its own
//    dimension, 2.11 m, end to end; its value lands on a beat with a dry tick.
// 4. The answer, 8.44 m, on the last bar: one blue dimension over the four turns, and the number in the status line.
// The drawing comes from the blocks: sheet, gear, belt, callout, dimension, shape and rule. Only one part is blue at
// a time: the chain while it runs, then the answer's dimension.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pictureSafe, ratioTurns } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "schematic";
export const seconds = 16;

const TRACK = "schematic-music-2";
// The section where the drums and the bass come in (listen.md: bars 9-39, from 15.0 s): the film opens on its first bar.
const SECTION = 15.0;
// The drive: the teeth set the gears' sizes (a gear's pitch radius grows with its teeth).
const RING_T = 48, COG_T = 12;
// The tyre: 672 mm across, so one turn rolls pi x 672 mm.
const TYRE = 672, ROLL_MM = Math.PI * TYRE;
const metres = (mm: number) => (Math.floor(mm / 10) / 100).toFixed(2);

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, P = pictureSafe(ctx);
  const out: Node[] = [];
  const g = beats(TRACK, { from: SECTION, until: seconds });
  const bar = (n: number) => g.bars[n]!;
  // The steps, each on a bar: the callouts, the pedal turn, the road, the answer.
  const CALL = g.beats.find((t) => t >= 0.4) ?? bar(0), TURN = bar(0), PEDAL = bar(1), ROAD = bar(3), ANSWER = bar(6);
  const lh = (r: "headline" | "label" | "body") => Math.round(ctx.lineHeight(r));

  // The status line at the top: the question, then each step's fact. One text at a time.
  // A small inset from the text-safe top: the line's ascenders stay inside it in both renderers.
  const statusY = S.top + 16;
  const status = (id: string, text: string, at: number, until?: number, replaces?: string) =>
    B.text({ id, x: S.left, y: statusY, w: S.right - S.left, text, role: "headline", enter: "cut", at, until, replaces }, ctx);
  out.push(...status("q", "How far does one pedal turn go?", 0, PEDAL));
  out.push(...status("s1", "The cog turns 4 times.", PEDAL, ROAD, "q"));
  out.push(...status("s2", "Each turn rolls 2.11 m.", ROAD, ANSWER, "s1"));

  // FIG. 2 (the road), under the status line, above the low band, across the picture-safe width. At its own scale,
  // four turns of the wheel end where the last turn's value (centred on its turn) keeps the text-safe right edge.
  const half = ctx.measure(`${metres(ROLL_MM)} m`, "label", { keepCase: true }) / 2 + 4;
  const L = (S.right - half - P.x) / (3.5 + 1 / (2 * Math.PI)), d = Math.round(L / Math.PI);
  const roadY = Math.round(S.lowBandTop - 34);
  const x0 = P.x + d / 2;
  out.push(...B.sheet({ id: "sheet", grid: "lines", figures: [{ fig: 2, name: "ROAD", x: S.left, y: roadY + 14, at: -1 }], at: -1 }, ctx));
  out.push(...B.rule({ id: "road", x1: P.x, y1: roadY, x2: P.x + P.w, y2: roadY, color: "ink", at: -1 }, ctx));

  // FIG. 1 (the drive), upright under the road: the chainring at the picture-safe foot, the cog over it. The ring is
  // a third of the frame's width across in radius; the cog has a quarter of its teeth, so a quarter of its radius.
  const rRing = Math.round(ctx.width * 0.296), rCog = Math.round((rRing * COG_T) / RING_T);
  const ring = { x: Math.round(ctx.width / 2), y: Math.round(P.y + P.h - rRing - 8) };
  const cog = { x: ring.x, y: Math.round(roadY + 60 + rCog + 20) };
  const weight = 1.5;
  const PEDAL_END = bar(2);
  const ringG = B.gear({ id: "ring", cx: ring.x, cy: ring.y, r: rRing, teeth: RING_T, weight, turns: [{ at: TURN, until: PEDAL_END, turns: 1 }], at: -1 }, ctx);
  out.push(...ringG);
  const cogG = B.gear({ id: "cog", cx: cog.x, cy: cog.y, r: rCog, teeth: COG_T, weight, turns: [{ at: TURN, until: PEDAL_END, turns: ratioTurns(RING_T, COG_T, 1) }], at: -1 }, ctx);
  out.push(...cogG);
  // The chain: ink at rest, blue while it runs. One link a tooth: the pitch along the ring's rim.
  const a = { x: ring.x, y: ring.y, r: rRing }, b = { x: cog.x, y: cog.y, r: rCog };
  const link = (2 * Math.PI * rRing) / RING_T;
  out.push(...B.belt({ id: "chain", a, b, color: "ink", weight, links: link, at: -1, until: TURN }, ctx));
  out.push(...B.belt({ id: "chain-run", a, b, color: "accent", weight, links: link, at: TURN, until: PEDAL_END }, ctx));
  out.push(...B.belt({ id: "chain-rest", a, b, color: "ink", weight, links: link, at: PEDAL_END }, ctx));
  // The callouts, on the left of the parts, inside the text-safe area (in the low band, a label ends by its right
  // edge): the cog's beside it, the ring's over its rim, above the text-safe foot.
  out.push(...B.callout({ id: "c2", number: 2, label: `COG ${COG_T} T`, target: { x: cog.x - rCog, y: cog.y }, x: S.left, y: Math.round(cog.y - lh("label") / 2), at: CALL }, ctx));
  const c1y = Math.min(Math.round(S.bottom - lh("label") - 8), Math.round(ring.y - rRing - lh("label") - 12));
  out.push(...B.callout({ id: "c1", number: 1, label: `RING ${RING_T} T`, target: { x: Math.round(ring.x - rRing * 0.6), y: Math.round(ring.y - rRing * 0.8) }, x: S.left, y: c1y, at: CALL + 0.5 }, ctx));

  // FIG. 2: the wheel: the tyre's outline and one spoke. It rolls one circumference to the right every two beats,
  // from the bar of the road.
  const k0 = Math.max(0, g.beats.findIndex((t) => t >= ROAD - 0.05));
  const turnAt = [0, 1, 2, 3].map((i) => g.beats[k0 + 2 * i]!);
  const rolls = turnAt.map((t, i) => ({ at: t, to: [Math.round(L * (i + 1)), 0] as [number, number] }));
  const wheelBox = { x: Math.round(x0 - d / 2), y: roadY - d, w: d, h: d };
  out.push(...B.shape({ id: "tyre", kind: "circle", ...wheelBox, stroke: "ink", weight: 1.5, moves: rolls, at: -1 }, ctx));
  out.push(...B.shape({ id: "spoke", kind: "sector", angles: [-4, 4], ...wheelBox, fill: "ink", moves: rolls, turns: turnAt.map((t) => ({ at: t, by: 360 })), at: -1 }, ctx));
  // Each turn lays down its own dimension as the wheel lands: its extension rises where the wheel stops, and its value
  // lands 3 frames after the beat four beats after the turn starts (a dimension's value shows 1.5 move durations after
  // its time; it starts a frame early, so the value is on screen on the frame the tick plays). Schematic's hits follow
  // the picture, not the beat (its bed is a bed, not a clock): off the hi-hat on the beat, the dry tick is heard with
  // a small dip of the bed, not a deep one on every turn.
  const dimY = roadY - d - 30;
  const valueIn = 1.5 * ctx.dur.move;
  const lands = turnAt.map((t) => g.onBeat(t + ctx.dur.move + valueIn) + 3 / 30);
  lands.forEach((t, i) => {
    const from = { x: x0 + L * i, y: dimY }, to = { x: x0 + L * (i + 1), y: dimY };
    out.push(...B.dimension({ id: `turn${i}`, from, to, offset: 40, text: `${metres(ROLL_MM)} m`, color: "ink", at: t - valueIn - 1 / 30 }, ctx));
  });
  // The answer on the last bar: one blue dimension over the four turns, its value landing on the bar, and the number
  // in the status line.
  out.push(...B.dimension({ id: "total", from: { x: x0, y: dimY }, to: { x: x0 + 4 * L, y: dimY }, offset: 110, text: `${metres(4 * ROLL_MM)} m`, color: "accent", textColor: "ink", at: ANSWER - valueIn - 1 / 30 }, ctx));
  out.push(...B.text({ id: "answer", x: S.left, y: statusY + 24, w: S.right - S.left, text: `${metres(4 * ROLL_MM)} m`, role: "display", replaces: "s2", at: ANSWER }, ctx));
  out.push(...B.text({ id: "answer-line", x: S.left, y: statusY + 24 + lh("headline") * 1.6, w: S.right - S.left, text: "One pedal turn, 4 wheel turns.", role: "body", color: "inkMuted", at: ANSWER }, ctx));
  out.push(...B.reveal({ at: ANSWER }, ctx));

  // Sound: the bed opens on the section's first bar. A dry tick as each turn's value lands.
  const bed = B.music({ media: TRACK, align: { track: SECTION, film: 0 }, at: 0, until: seconds }, ctx);
  out.push(...bed);
  lands.forEach((t, i) => out.push(...B.hit({ id: `tick${i}`, media: "schematic-tick", at: t, bed }, ctx)));
  return out;
};
