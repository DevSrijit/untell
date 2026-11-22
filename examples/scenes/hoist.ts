// A Schematic film of a hoist with two wheels (how a 100 N pull lifts 200 N), made with the kit's drawing blocks and
// their default props: no label, dimension or rope is placed or drawn by hand.
// The facts, for an ideal hoist (no friction, a rope that does not stretch, wheels with no weight): two strands hold
// the moving wheel, so 2 T = W and T = W / 2 = 100 N; the tension is the same along the rope, so the pull F = 100 N.
// When the load rises by D, each of the two strands gets shorter by D, so the free end runs down by 2 D.
// Work in = work out: 100 N x 0.40 m = 200 N x 0.20 m.
// - fitDrawing with no area stands the drawing where Schematic puts a figure; the sheet lays a plate of that box.
// - pulley draws each wheel (rim, key marks); the moving wheel rises, the fixed one turns as the rope runs over it.
// - rope runs from the ceiling, under the moving wheel, over the fixed wheel, to the grip; its strands change length
//   as the wheel and the grip move, and the active path lights in blue.
// - figure() takes every part; each callout and dimension takes the figure and places itself.
// - Each tick lands with `hit({ on })` on the frame its label shows.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { figure, figureBox, fitDrawing, followPoint, pictureSafe, pointOf, rollDegrees, ropeStrandLength } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";
import type { Ctx, Node } from "../../src/system/scene/types";

export const system = "schematic";
export const seconds = 12;
// The bed enters on a section whose bars are among the track's loudest (beats().loudest), so the answer lands on one.
const TRACK = "schematic-music-2", SECTION = 220.2;

// The drawing in cm, y down; the ceiling's underside is y 0.
const R = 25, RF = 40; // groove radii: the moving wheel, the fixed wheel
const D = 20; // the lift, cm
const W_N = 200, F_N = W_N / 2;
const XM = 0, XF = XM + R + RF; // the middle strand leaves both wheels at one x, so it is vertical
const XA = XM - R, XE = XF + RF; // the anchor over the moving wheel's left side; the free end down the fixed wheel's right
const YF = 46, GAP = 8;
const YM = YF + RF + R + 4 + D + GAP; // the moving wheel's centre at rest
const STRAP = 8, LOAD = { w: 70, h: 24 }, GRIP0 = 120, GRIP = { w: 10, h: 6 };
const PER_N = 0.24; // a force arrow's length, cm per N: W and F to one scale
const CEIL = { x0: XM - LOAD.w / 2, x1: XF + 12, h: 6 };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, g = beats(TRACK, { from: SECTION, until: seconds });
  const bar = g.bars; // 0, 1.94, 3.87, 5.81, 7.74, 9.68, 11.62
  const T = { name: 0.5, path: bar[1]!, line2: bar[2]!, pull: bar[3]!, dimRise: bar[3]! + 1.2, line3: bar[4]!, answer: bar[5]! };
  const bottom = YM + R + 2 + STRAP + LOAD.h + W_N * PER_N;
  // The rise's dimension measures from the load's top, so its value needs that point in the text-safe area. Where the
  // system states a figure place (Schematic) the drawing stands on its foot and the point is there. Where it does not
  // (Spec at 9:16), the drawing centres in the picture-safe area and the load's top falls under the text-safe foot:
  // keep room under the drawing until the point is above the foot (the dimension's own message names this fix).
  // The labels name the parts from the text column, so the drawing keeps to it across (as a figure place does), with
  // room on the left for the rise's dimension and its value: the load is the drawing's left edge.
  const bounds = { x: CEIL.x0, y: -CEIL.h, w: XE + GRIP.w / 2 - CEIL.x0, h: bottom + CEIL.h };
  const PS = pictureSafe(ctx), placed = figureBox(ctx).y !== PS.y;
  // Its top: under the two rows of the line and a label row, where a figure place begins (Schematic: figureBox).
  const side = placed ? {} : { top: Math.max(0, Math.round(S.top + 2 * ctx.lineHeight("headline") + ctx.lineHeight("label")) - PS.y),
    left: Math.max(0, S.left - PS.x) + Math.ceil(ctx.measure(`${D} cm`, "label") + 2 * ctx.lineHeight("label")), right: Math.max(0, PS.x + PS.w - S.right) };
  let below = 0, fit = fitDrawing(ctx, { bounds, unit: "cm", ...(placed ? {} : { room: side }) });
  for (let i = 0; i < 4 && !placed; i++) {
    const over = fit.at(XM, YM + R + 2 + STRAP).y - (S.bottom - 4);
    if (over <= 0) break;
    below += Math.ceil(2 * over);
    fit = fitDrawing(ctx, { bounds, unit: "cm", room: { ...side, bottom: below } });
  }
  // Where the drawing has no figure place, a scale of a whole px for each 5 cm puts the wheels' radii, and so the
  // vertical strands, on whole px (Schematic's figure place gives such a scale already), and the drawing's left edge
  // goes to a whole px: a hairline on a half pixel blurs.
  if (!placed) {
    const k5 = Math.floor(fit.k * 5) / 5, room = { ...side, bottom: below };
    fit = fitDrawing(ctx, { bounds, unit: "cm", room, maxK: k5 });
    const dx = Math.round(fit.box.x) - fit.box.x;
    if (Math.abs(dx) > 1e-6) fit = fitDrawing(ctx, { bounds, unit: "cm", room: { ...room, left: (room.left ?? 0) + 2 * dx }, maxK: k5 });
  }
  const P = (x: number, y: number) => fit.at(x, y), k = fit.k, wt = fit.weight;
  const lift = D * k;
  // A dimension's value starts to fade in 1.5 move times after its start and shows (opacity 0.5) 4 frames later:
  // start it so the value shows on its bar.
  const lands = (t: number) => t - 1.5 * ctx.dur.move - 4 / 30;

  const c0 = P(CEIL.x0, -CEIL.h);
  const ceiling = B.shape({ id: "ceiling", kind: "rect", ...c0, w: (CEIL.x1 - CEIL.x0) * k, h: CEIL.h * k, stroke: "ink", weight: wt, at: -1 }, ctx);
  const fc = P(XF, YF), mc = P(XM, YM);
  const fixed = B.pulley({ id: "fixed", cx: fc.x, cy: fc.y, r: RF * k, turns: [{ at: T.pull, by: rollDegrees(2 * lift, RF * k) }], weight: wt, at: -1 }, ctx);
  // The moving wheel rises and does not turn on screen: a wheel that turns while it moves reads as a drifting pivot in
  // the HyperFrames check (pulley's header). The fixed wheel turns as the rope runs over it.
  const moving = B.pulley({ id: "moving", cx: mc.x, cy: mc.y, r: R * k, moves: [{ at: T.pull, to: [0, -lift] }], weight: wt, at: -1 }, ctx);
  const hanger = B.rule({ id: "hanger", x1: fc.x, y1: P(XF, 0).y, x2: fc.x, y2: pointOf(fixed, "top").y, color: "ink", weight: wt, enter: "cut", at: -1 }, ctx);
  const rimFoot = pointOf(moving, "bottom");
  const strap = B.shape({ id: "strap", kind: "rect", x: rimFoot.x - 1.5 * k, y: rimFoot.y, w: 3 * k, h: STRAP * k, stroke: "ink", weight: wt, on: { part: moving, at: "bottom", upright: true }, at: -1 }, ctx);
  const strapFoot = pointOf(strap, "bottom");
  const load = B.shape({ id: "load", kind: "rect", x: strapFoot.x - (LOAD.w / 2) * k, y: strapFoot.y, w: LOAD.w * k, h: LOAD.h * k, stroke: "ink", weight: wt, on: { part: strap, at: "bottom", upright: true }, at: -1 }, ctx);
  const g0 = P(XE, GRIP0);
  const grip = B.shape({ id: "grip", kind: "rect", x: g0.x - (GRIP.w / 2) * k, y: g0.y, w: GRIP.w * k, h: GRIP.h * k, stroke: "ink", weight: wt, moves: [{ at: T.pull, to: [0, 2 * lift] }], at: -1 }, ctx);
  const rope = B.rope({ id: "rope", run: [P(XA, 0), { wheel: moving, turn: "ccw" }, { wheel: fixed, turn: "cw" }, { ...pointOf(grip, "top"), follow: followPoint(ctx, grip, "top") }],
    weight: wt, light: { from: 0, to: 2, at: T.path }, at: -1 }, ctx);
  // The rope keeps its length through the pull (the drawing does not lie).
  if (Math.abs(ropeStrandLength(rope, 0) - ropeStrandLength(rope, seconds)) > 1) throw new Error("hoist: the rope's length changes in the pull");

  // The forces, to one scale: W under the load, F under the grip; each rides with its part.
  const lf = pointOf(load, "bottom"), gf = pointOf(grip, "bottom");
  const wArrow = B.arrow({ id: "w-arrow", from: [lf.x, lf.y], to: [lf.x, lf.y + W_N * PER_N * k], key: true, follow: followPoint(ctx, load, "bottom"), at: -1 }, ctx);
  const fArrow = B.arrow({ id: "f-arrow", from: [gf.x, gf.y], to: [gf.x, gf.y + F_N * PER_N * k], key: true, follow: followPoint(ctx, grip, "bottom"), at: -1 }, ctx);
  // Where the load's top and the grip were before the pull: dashed, so the dimensions measure from them.
  const lt = pointOf(load, "top-left"), gt = pointOf(grip, "top-left");
  const datums = [
    ...B.rule({ id: "datum-load", x1: lt.x - 9 * k, y1: lt.y, x2: lt.x - 1 * k, y2: lt.y, dash: true, color: "inkMuted", at: T.pull }, ctx),
    ...B.rule({ id: "datum-grip", x1: gt.x - 8 * k, y1: gt.y, x2: gt.x - 1 * k, y2: gt.y, dash: true, color: "inkMuted", at: T.pull }, ctx),
  ];
  const fig = figure(ctx, [...ceiling, ...fixed, ...moving, ...hanger, ...strap, ...load, ...grip, ...rope, ...wArrow, ...fArrow, ...datums]);

  // The names first, then the measures: each places itself.
  const strandY = (yTop: number) => (yTop + mc.y - lift) / 2; // a point that is rope at every time
  const names = [
    ...B.callout({ id: "c-w", label: `${W_N} N`, target: pointOf(load, "top-right"), follow: followPoint(ctx, load, "top-right"), figure: fig, at: T.name }, ctx),
    ...B.callout({ id: "c-fixed", label: "FIXED", target: pointOf(fixed, "top-right"), figure: fig, at: T.name + 0.4 }, ctx),
    ...B.callout({ id: "c-moving", label: "MOVING", target: pointOf(moving, "top-left"), follow: followPoint(ctx, moving, "top-left"), figure: fig, at: T.name + 0.8 }, ctx),
    ...B.callout({ id: "c-left", label: `${F_N} N`, color: "accentText", target: { x: P(XA, 0).x, y: strandY(P(0, 0).y) }, figure: fig, at: T.path }, ctx),
    ...B.callout({ id: "c-mid", label: `${F_N} N`, color: "accentText", target: { x: P(XM + R, 0).x, y: strandY(fc.y) }, figure: fig, at: T.path }, ctx),
    ...B.callout({ id: "c-f", label: `${F_N} N`, target: { x: P(XE, 0).x, y: (fc.y + g0.y) / 2 }, figure: fig, at: T.line2 + 0.9 }, ctx),
  ];
  const dims = [
    ...B.dimension({ id: "dim-rise", from: { x: lt.x, y: lt.y }, to: { x: lt.x, y: lt.y - lift }, figure: fig, side: "left", text: `${D} cm`, at: lands(T.dimRise) }, ctx),
...B.dimension({ id: "dim-rope", from: { x: gt.x, y: gt.y }, to: { x: gt.x, y: gt.y + 2 * lift }, figure: fig, side: "left", text: `${2 * D} cm`, at: lands(T.answer) }, ctx),
  ];

  const lineY = S.top + Math.max(0, (ctx.size("headline") * 1.4 - ctx.lineHeight("headline")) / 2), w = S.right - S.left;
  const bed = B.music({ media: TRACK, align: { track: SECTION, film: 0 }, until: seconds }, ctx);
  const all = [...names, ...dims];
  const tick = (id: string, on: string) => B.hit({ id, media: "schematic-tick", on: { nodes: all, id: on }, bed }, ctx);
  return [
    ...bed,
    ...B.sheet({ id: "sheet", grid: "lines", plate: true, at: -1 }, ctx),
    ...B.text({ id: "line1", text: `How does a ${F_N} N pull lift ${W_N} N?`, role: "headline", x: S.left, y: lineY, w, pinned: true, at: -1, until: T.line2 }, ctx),
    ...B.text({ id: "line2", text: "Two strands hold the load. Each takes half.", role: "headline", x: S.left, y: lineY, w, pinned: true, replaces: "line1", at: T.line2, until: T.line3 }, ctx),
    ...B.text({ id: "line3", text: "Half the force, twice the rope.", role: "headline", x: S.left, y: lineY, w, pinned: true, replaces: "line2", at: T.line3 }, ctx),
    ...ceiling, ...hanger, ...fixed, ...moving, ...strap, ...load, ...grip, ...rope, ...wArrow, ...fArrow, ...datums,
    ...all,
    ...tick("tick-w", "c-w"), ...tick("tick-path", "c-left"), ...tick("tick-f", "c-f"), ...tick("tick-rise", "dim-rise"), ...tick("tick-rope", "dim-rope"),
    ...B.reveal({ at: T.answer, of: "dim-rope" }, ctx),
    ...B.hold({ id: "rest", at: T.answer + ctx.dur.enter, until: seconds }, ctx),
  ];
};
