// The rows scene: the three states of water on three rows that fill the text-safe area, with the row
// guides drawn. Each row's word and its range sit on the row's bottom anchor, on one baseline.
// Facts: at sea level, water is ice below 0 °C and steam above 100 °C.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { baselineOf, layoutOf } from "../../src/system/scene/blocks/highlight";
import { linesAtBottom, rowBoxes, settle, type Row } from "../../src/system/scene/blocks/rows";

const STATES = [["Ice", "Below 0 °C"], ["Water", "0 to 100 °C"], ["Steam", "Above 100 °C"]] as const;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const rs = rowBoxes(ctx, 3) as Row[];
  // When any row is too narrow for the word and its range on one baseline (the low band at 9:16),
  // every row sets the range on the line above its word, so the rows stay alike.
  const fits = rs.every((r, i) => ctx.measure(STATES[i]![0], "display") + ctx.size("label") * 1.5 + ctx.measure(STATES[i]![1], "label") <= r.w);
  return [
    ...B.rows({ id: "grid", n: 3, at: 0.2 }, ctx),
    ...rs.flatMap((r, i) => {
      const [word, range] = STATES[i]!;
      const at = 0.9 + i * 0.6;
      const y = linesAtBottom(ctx, r, "display", 1);
      // The range shares the word's baseline and ends on the row's right edge.
      const base = baselineOf(ctx, "display", y);
      const ly = Math.round(base - baselineOf(ctx, "label", 0));
      const lw = ctx.measure(range, "label");
      const rx = fits ? Math.floor(r.x + r.w - lw) : r.x;
      const ry = fits ? ly : Math.round(layoutOf(ctx, "display", y).top - ctx.lineHeight("label") - ctx.size("label") * 0.3);
      return [
        ...settle(ctx, { id: `w${i}`, x: r.x, y, lines: [word], role: "display", at }),
        ...settle(ctx, { id: `r${i}`, x: rx, y: ry, lines: [range], role: "label", color: "inkMuted", at: at + 0.25 }),
      ];
    }),
  ];
};
