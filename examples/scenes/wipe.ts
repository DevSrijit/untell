// The wipe scene: two units of distance, one after the other, with the system's own wipe between them.
// Facts: a light-year is 9.4607 trillion km; a parsec is 3.2616 light-years, about 30.86 trillion km.
// Each card draws its measure as a bar on one scale: the light-year a short bar, the parsec 3.26 times as long, with a
// tick where one light-year ends. At 9:16 the bars sit in the lower band (marks only); at 16:9 at the top of the
// bottom row, above the note.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lines } from "../../src/system/scene/context";
import { linesAtBottom, rowBoxes, settle, wrap, type Row } from "../../src/system/scene/blocks/rows";
import { wipeOut, wipeTimes, type WipeProps } from "../../src/system/scene/blocks/wipe";
import { pictureSafe } from "../../src/system/scene/blocks/sheet";
import { cut, go } from "../../src/system/scene/context";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const [r0, r1, r2] = rowBoxes(ctx, 3) as [Row, Row, Row];
  const w: WipeProps = { id: "wipe", at: 3.0, direction: "right" };
  const wt = wipeTimes(ctx, w);
  const lhH = ctx.lineHeight("headline"), lhL = ctx.lineHeight("label");

  // One card: a label on the top row, the measure on the middle row, a note on the bottom row.
  const card = (id: string, label: string, measure: string, note: string | null, at: (b: { x: number; y: number; w: number; h: number }) => number) => {
    const ms = wrap(ctx, measure, "headline", r1.w);
    const yL = linesAtBottom(ctx, r0, "label", 1), yM = linesAtBottom(ctx, r1, "headline", ms.length);
    const out: Node[] = [
      ...lines(ctx, { id: `${id}-lab`, x: r0.x, y: yL, lines: [label], role: "label", color: "inkMuted", at: at({ x: r0.x, y: yL, w: r0.w, h: lhL }) }),
      ...lines(ctx, { id: `${id}-m`, x: r1.x, y: yM, lines: ms, role: "headline", at: at({ x: r1.x, y: yM, w: r1.w, h: lhH }) + ctx.dur.stagger * 2 }),
    ];
    if (note) {
      const ns = wrap(ctx, note, "caption", r2.w);
      const yN = linesAtBottom(ctx, r2, "caption", ns.length);
      out.push(...settle(ctx, { id: `${id}-n`, x: r2.x, y: yN, lines: ns, role: "caption", at: at({ x: r2.x, y: yN, w: r2.w, h: ctx.lineHeight("caption") }) + 0.8 }));
    }
    return out;
  };
  // The scale: a parsec fills the picture-safe width at 9:16 (the text-safe width at 16:9).
  const P = pictureSafe(ctx), tall = ctx.height > ctx.width, S = ctx.safe;
  const barH = tall ? Math.round(ctx.height * 0.06) : Math.round(ctx.size("headline") * 0.7);
  const bx = tall ? P.x : S.left, full = tall ? P.w : S.right - S.left;
  // 16:9: at the top of the bottom row, above the note (the note sits at the row's foot).
  const by = tall ? Math.round(S.bottom + (P.y + P.h - S.bottom - barH) / 2) : Math.round(r2.y + lhL * 0.5);
  const ly = Math.round(full / 3.2616);
  const bar = (id: string, w: number, at: number, fill: "series1" | "series3"): Node =>
    ({ id, kind: "rect", x: bx, y: by, w, h: barH, fill, origin: [0, 0.5], tracks: { opacity: at <= 0 ? [{ t: 0, v: 1 }] : [{ t: 0, v: 0 }, ...cut(at, 0, 1)], scaleX: go(ctx, Math.max(0, at), at <= 0 ? 1 : 0, 1, ctx.noOvershoot("move"), 1, "move") } });
  const bShow = wt.show({ x: bx, y: by, w: full, h: barH });
  const tick: Node = { id: "b-tick", kind: "path", d: `M${bx + ly} ${by - barH * 0.35}V${by + barH * 1.35}`, stroke: "ink", width: Math.max(2, ctx.stroke), tracks: { opacity: [{ t: 0, v: 0 }, ...cut(bShow + ctx.dur.move, 0, 1)] } };
  return [
    ...wipeOut(ctx, [bar("a-bar", ly, -1, "series1")], wt),
    bar("b-bar", full, bShow, "series1"),
    tick,
    ...wipeOut(ctx, card("a", "One light-year", "9.46 trillion km", null, () => 0), wt),
    ...B.wipe(w, ctx),
    ...card("b", "One parsec", "3.26 light-years", "About 30.9 trillion km.", (b) => wt.show(b)),
  ];
};
