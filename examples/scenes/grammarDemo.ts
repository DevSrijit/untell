// The grammar demo: a ten-second explainer of the thunder rule, built from the five grammar blocks.
// rows lay out every frame; highlight underlines the speed; carry takes "343" from the sentence into
// the sum; annotate names the answer; wipe changes to the rule of thumb, where a marker lands on "3 s".
// The three rows are used top to bottom in every beat: a label, the working, the point.
// Facts: sound moves at 343 m/s in air at 20 °C, so in 3 s it covers 1,029 m, about 1 km.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { appear, go, lines } from "../../src/system/scene/context";
import { textPlace } from "../../src/system/scene/blocks/carry";
import { baselineOf, inkOf, wordBox } from "../../src/system/scene/blocks/highlight";
import { linesAtBottom, rowBoxes, settle, wrap, type Row } from "../../src/system/scene/blocks/rows";
import { wipeOut, wipeTimes, type WipeProps } from "../../src/system/scene/blocks/wipe";
import type { Box } from "../../src/system/scene/blocks/util";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const [r0, r1, r2] = rowBoxes(ctx, 3) as [Row, Row, Row];
  const H = "headline" as const;
  const lh = ctx.lineHeight(H);
  const yLab = linesAtBottom(ctx, r0, "label", 1);
  const step = ctx.instant ? 1 / 30 : ctx.dur.move;

  // Beat 1 (0.3 s): the speed, with "343 m/s" underlined.
  const t1 = 0.3, cut1 = 3.0;
  const ls = wrap(ctx, "Sound moves at 343 m/s.", H, r2.w, ["343 m/s."]);
  const yS = linesAtBottom(ctx, r2, H, ls.length);
  const speed = wordBox(ctx, ls, r2.x, yS, H, "343 m/s")!;
  const li = Math.round((speed.y - yS) / lh);
  const line = ls[li]!, k = line.indexOf("343");
  const n343: Box = { x: speed.x, y: speed.y, w: ctx.measure("343", H), h: lh };
  const fade = (at: number, until?: number) => appear(ctx, at, until, 0);
  const sentence: Node[] = ls.flatMap((l, i): Node[] => {
    if (i !== li) return [{ id: `s-${i}`, kind: "text", x: r2.x, y: yS + i * lh, text: l, role: H, color: "ink", tracks: fade(t1 + 0.3, cut1) }];
    const out: Node[] = [{ id: `s-${i}-after`, kind: "text", x: n343.x + n343.w, y: n343.y, text: line.slice(k + 3), role: H, color: "ink", tracks: fade(t1 + 0.3, cut1) }];
    if (k > 0) out.push({ id: `s-${i}-before`, kind: "text", x: r2.x, y: n343.y, text: line.slice(0, k), role: H, color: "ink", tracks: fade(t1 + 0.3, cut1) });
    return out;
  });

  // Beat 2 (about 3.4 s): "343" travels up into the sum on the middle row; an arrow below names the answer.
  // It starts once the sentence has gone, so it never passes over the words.
  const move = cut1 + (ctx.instant ? 1 / 30 : ctx.dur.exit) + 0.1, landed = move + step;
  // The sum as column arithmetic: a rule, then the result aligned right under the first line.
  const sum = "343 m/s × 3 s", answer = "1,029 m";
  const ySum = linesAtBottom(ctx, r1, H, 1) - Math.round(lh * 1.35), yRes = ySum + Math.round(lh * 1.35);
  const to = textPlace(ctx, "343", H, r1.x, baselineOf(ctx, H, ySum));
  const sumW = ctx.measure(sum, H), ansW = ctx.measure(answer, H);
  const ansX = Math.round(r1.x + sumW - ansW);
  const ruleY = Math.round((inkOf(ctx, H, ySum, sum).bottom + inkOf(ctx, H, yRes, answer).top) / 2);
  const ansInk = inkOf(ctx, H, yRes, answer);
  const ansBox: Box = { x: ansX, y: ansInk.top, w: ansW, h: ansInk.bottom - ansInk.top };
  const sumBoxes: Box[] = [
    { x: r1.x, y: inkOf(ctx, H, ySum, sum).top, w: sumW, h: ruleY - inkOf(ctx, H, ySum, sum).top + 2 },
    ansBox,
    { x: r0.x, y: yLab, w: r0.w, h: ctx.lineHeight("label") },
  ];
  const note = { id: "ans", target: ansBox, label: "About 1 km", prefer: "below" as const, obstacles: sumBoxes, at: landed + 1.1 };

  const before: Node[] = [
    ...lines(ctx, { id: "lab1", x: r0.x, y: yLab, lines: ["The thunder rule"], role: "label", color: "inkMuted", at: t1, until: move }),
    ...sentence,
    ...B.highlight({ id: "u", target: speed, role: H, text: "343 m/s", style: "underline", at: t1 + 1.1, until: cut1 }, ctx),
    ...B.carry({ id: "n343", text: "343", role: H, from: n343, to, at: move, show: t1 + 0.3 }, ctx),
    { id: "sum1", kind: "text", x: to.x + to.w, y: ySum, text: sum.slice(3), role: H, color: "ink", tracks: fade(landed) },
    { id: "sumRule", kind: "path", d: `M${r1.x} ${ruleY}H${r1.x + sumW}`, stroke: "ink", width: Math.max(1, ctx.stroke * 0.75),
      tracks: { ...fade(landed + 0.25), draw: go(ctx, landed + 0.25, 0, 1, ctx.noOvershoot("move")) } },
    ...lines(ctx, { id: "sum2", x: ansX, y: yRes, lines: [answer], role: H, at: landed + 0.6 }),
    ...lines(ctx, { id: "lab2", x: r0.x, y: yLab, lines: ["Thunder 3 s after the flash"], role: "label", color: "inkMuted", at: move + 0.3 }),
    ...B.annotate(note, ctx),
  ];

  // Beat 3 (6.6 s): the system's wipe, then the rule of thumb with a marker on "3 s".
  const w: WipeProps = { id: "wipe", at: 6.6, direction: "right" };
  const wt = wipeTimes(ctx, w);
  // The rule at the largest role whose lines fit the narrower bottom row, set on the bottom anchor.
  const text = "Count 3 s for every kilometre.";
  const R = (["display", "headline"] as const).find((r) => wrap(ctx, text, r, r2.w, ["3 s"]).every((l) => ctx.measure(l, r) <= r2.w)) ?? H;
  const rule = wrap(ctx, text, R, r2.w, ["3 s"]);
  const yR = linesAtBottom(ctx, r2, R, rule.length);
  const three = wordBox(ctx, rule, r2.x, yR, R, "3 s")!;
  // The rule starts when the wipe has cleared every one of its lines.
  const at3 = Math.max(...rule.map((l, i) => wt.show({ x: r2.x, y: yR + i * ctx.lineHeight(R), w: ctx.measure(l, R), h: ctx.lineHeight(R) })));
  return [
    ...wipeOut(ctx, before, wt),
    ...B.wipe(w, ctx),
    ...lines(ctx, { id: "lab3", x: r0.x, y: yLab, lines: ["Rule of thumb"], role: "label", color: "inkMuted", at: wt.show({ x: r0.x, y: yLab, w: r0.w, h: lh }) }),
    ...settle(ctx, { id: "rule", x: r2.x, y: yR, lines: rule, role: R, at: at3 }),
    ...B.highlight({ id: "m", target: three, role: R, text: "3 s", style: "marker", at: at3 + 1.0 }, ctx),
  ];
};
