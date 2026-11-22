// The drivetrain scene: a bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.
// The facts are geometry:
// - A chain's link pitch is 12.7 mm (half an inch). A sprocket's pitch radius is teeth x pitch / 2 pi:
//   48 teeth give 97.0 mm, 12 teeth give 24.3 mm.
// - With a 48-tooth ring and a 12-tooth cog, the cog turns 48 / 12 = 4 times for one turn of the ring.
// - The chainstay here is 410 mm, centre to centre.
// - The chain moves 2 pi x 97.0 mm = 610 mm for one ring turn, so one link rides the top run at that speed.
// It rebuilds the Schematic reel's chain with the belt block: the runs are outer tangents of the two pitch
// circles, so the chain never cuts through the ring.
// The drawing fills the picture-safe width (fitDrawing); its labels stay in the text-safe area, outside the
// drawing, with short leaders.
import type { Ctx, Node } from "../../src/system/scene/types";
import { beltGeometry, fitDrawing, pictureSafe, pitchRadius, ratioTurns, sheetLayout, tipRadius, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 10;

const PITCH = 12.7, RING = 48, COG = 12, STAY = 410; // mm
const TURN = { at: 3.2, until: 7.2 }; // one ring turn, s

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const tall = ctx.height > ctx.width;
  const R = pitchRadius(RING, PITCH), r = pitchRadius(COG, PITCH); // mm
  const tipR = tipRadius(R, RING), tipr = tipRadius(r, COG); // mm
  const lh = ctx.lineHeight("label"), bodyLh = ctx.lineHeight("body");
  const head = { x: S.left, y: S.top, w: S.right - S.left };
  const HEAD = "One pedal turn, four cog turns.";
  const headBottom = head.y + Math.round(ctx.size("body") * 0.2) + bodyLh * (ctx.measure(HEAD, "body") > head.w ? 2 : 1);
  // At 9:16 the text-safe area is narrow and its labels are small on a phone: the title block keeps one short cell
  // (FIG.). "SCALE 0.58 mm/px" is a line of 16 characters in the label role, under the size a phone reads a line at.
  const tbFor = (scale: string) => tall ? { fig: 1 } : { title: "CHAIN DRIVE", fig: 1, scale, sheet: "1/1" };
  const tbTop = sheetLayout(ctx, { titleBlock: tbFor("0.00 mm/px") }).titleBlock!.y;
  // The formula sits just above the title block.
  const fy = tbTop - Math.round(lh * 0.6) - bodyLh - Math.round(ctx.size("body") * 0.5);

  // The drawing is not text: it fills the picture-safe width (the full frame width inside the margin at 9:16).
  // The fit keeps room above it for the callout row and below it for the dimension and its label.
  const P = pictureSafe(ctx);
  const area = { x: P.x, y: headBottom + lh * 0.5, w: P.w, h: fy - lh * 0.5 - (headBottom + lh * 0.5) };
  // Above: one row of callouts (the link's tag rides inside the drawing). Below: the dimension line and its label.
  const fit = fitDrawing(ctx, { bounds: { x: -tipr, y: -tipR, w: tipr + STAY + tipR, h: 2 * tipR }, area, room: { top: lh * 1.8, bottom: lh * 2.7 } });
  const k = fit.k;
  const cogC = fit.at(0, 0), ringC = fit.at(STAY, 0);
  const cog = { x: Math.round(cogC.x), y: Math.round(cogC.y), r: r * k };
  const ring = { x: Math.round(ringC.x), y: Math.round(ringC.y), r: R * k };
  const g = beltGeometry(cog, ring);
  const TB = tbFor(fit.scale);
  const out: Node[] = [];

  // The sheet: the full grid from frame 0, the title block with the true scale.
  const sheetNodes = B.sheet({ id: "sheet", titleBlock: TB, at: 0 }, ctx);
  out.push(...sheetNodes);
  out.push(...B.text({ id: "head", text: HEAD, role: "body", x: head.x, y: head.y + Math.round(ctx.size("body") * 0.2), w: head.w, at: 0 }, ctx));

  // The parts, then the chain on their pitch circles. The outlines take the fit's weight.
  const parts = [
    ...B.gear({ id: "ring", cx: ring.x, cy: ring.y, r: ring.r, teeth: RING, weight: fit.weight, turns: [{ ...TURN, turns: 1 }], at: 0.4 }, ctx),
    ...B.gear({ id: "cog", cx: cog.x, cy: cog.y, r: cog.r, teeth: COG, weight: fit.weight, turns: [{ ...TURN, turns: ratioTurns(RING, COG, 1) }], at: 0.7 }, ctx),
    ...B.belt({ id: "chain", a: cog, b: ring, links: PITCH * k, weight: 1.5 * fit.weight, at: 1.2 }, ctx),
  ];
  out.push(...parts);

  // The centre distance, under the drive, and the ratio as a formula under it. They are placed first, so the
  // callouts keep clear of them.
  const dimOff = -(tipR * k + lh * 1.2);
  const dimNodes = B.dimension({ id: "stay", from: { x: cog.x, y: cog.y }, to: { x: ring.x, y: ring.y }, offset: dimOff, text: `${STAY} mm`, avoid: [...parts, ...sheetNodes], at: 2.6 }, ctx);
  out.push(...dimNodes);
  const fNodes = B.formula({ id: "ratio", text: `${RING} / ${COG} = 4 turns`, x: (cog.x + ring.x) / 2, y: fy, place: "below", role: "body", avoid: [...parts, ...dimNodes, ...sheetNodes], at: TURN.until }, ctx);
  out.push(...fNodes);

  // One link rides the top run while the ring turns: the chain moves 2 pi R per ring turn. It rides from a
  // 30 % of the way along the run to 50 %, and its callout ("12.7 mm", the link pitch) rides with it (follow).
  // Every callout gets the drawing's bounds (`outside`): the block puts each label outside the drawing, on the
  // side nearest its target, with a short leader, and keeps it clear of every part and label in `avoid`.
  const [a1, b1] = g.left;
  const along = (f: number): [number, number] => [a1[0] + (b1[0] - a1[0]) * f, a1[1] + (b1[1] - a1[1]) * f];
  const p0 = along(0.3), p1 = along(0.5);
  const speed = (2 * Math.PI * ring.r) / (TURN.until - TURN.at);
  const arrive = Math.round((TURN.at + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / speed) * 30) / 30;
  const fx = [{ t: 0, v: 0 }, { t: TURN.at, v: 0 }, { t: arrive, v: p1[0] - p0[0], curve: "linear" as const }];
  const fy2 = [{ t: 0, v: 0 }, { t: TURN.at, v: 0 }, { t: arrive, v: p1[1] - p0[1], curve: "linear" as const }];
  const headBox = [{ x: head.x, y: head.y, w: head.w, h: headBottom - head.y }];
  const outside = fit.box;
  const avoid0 = [...parts, ...dimNodes, ...fNodes];
  const ringCall = B.callout({ id: "c-ring", number: 1, label: `RING ${RING} T`, target: { x: ring.x, y: ring.y - ring.r }, outside, avoid: avoid0, obstacles: headBox, targetAt: 1.2, at: 2.0 }, ctx);
  out.push(...ringCall);
  const cogCall = B.callout({ id: "c-cog", number: 2, label: `COG ${COG} T`, target: { x: cog.x, y: cog.y - cog.r }, outside, avoid: [...avoid0, ...ringCall], obstacles: headBox, targetAt: 1.2, at: 2.3 }, ctx);
  out.push(...cogCall);
  // The link's tag rides on the chain, so it stays near the run (no `outside`): the block keeps its leader short.
  out.push(...B.callout({ id: "link", label: `${PITCH} mm`, target: { x: p0[0], y: p0[1] }, avoid: [...avoid0, ...ringCall, ...cogCall], obstacles: headBox,
    follow: { x: fx, y: fy2 }, color: "accentText", at: TURN.at - 0.4, until: arrive + 0.6 }, ctx));

  out.push(...B.hold({ at: TURN.until + 0.6, until: seconds }, ctx));
  return out;
};
