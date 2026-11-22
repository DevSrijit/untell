// A copy of the untell package example ("The rule of 72"), to reproduce the detector findings on it here.
// An example film made with untell: how long money takes to double at each annual return.
// Every number is computed: years = ln 2 / ln(1 + r), compounded once a year.
// A film is a scene module. It names one design system and its length, and returns nodes from blocks.
// The system decides every colour, font, size, curve and duration. Change the system id to restyle it.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const system = "riso";
// The chart is complete at about 2.1 s, and its last value shows at about 3.1 s. Riso holds its finished print
// for 1.5 s to 3 s, and a closing line needs 2 s on screen, so the film ends at 5.2 s.
export const seconds = 5.2;

const rates = [2, 4, 6, 8, 10, 12];
const years = rates.map((r) => Math.log(2) / Math.log(1 + r / 100));

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, w = S.right - S.left, h = S.bottom - S.top;
  // The hook: Riso opens on a line in display type by 0.5 s. A short claim fits display size in two lines;
  // the title stays inside its box, so the chart starts below the box.
  const titleH = h * 0.45;
  const title = B.title({ id: "claim", text: "The rule of 72.", x, y: S.top, w, h: titleH, maxLines: 3, at: 0.1 }, ctx);
  const chartY = S.top + titleH + ctx.lineHeight("label") * 2;
  // The lower band (below the text-safe area) is for graphics, not text: a Riso sun prints there in the
  // accent ink from the first frame, half off the frame, behind the content.
  const r = ctx.width * 0.42;
  const sun = B.shape({ id: "sun", kind: "circle", x: ctx.width - r * 1.25, y: ctx.height - r * 1.05, w: 2 * r, h: 2 * r, fill: "accent", enter: "grow", layer: -1, at: 0 }, ctx);
  return [
    ...sun,
    ...title,
    ...B.barChart({
      id: "double",
      x, y: chartY, w, h: S.bottom - chartY,
      title: "Years for money to double, by annual return",
      categories: rates.map((r) => `${r} %`),
      series: [{ label: "Years", values: years }],
      key: 3, // 8 %: 72 / 8 = 9 years, and the exact value is 9.0
      format: { decimals: 1 },
      at: 1.0,
    }, ctx),
  ];
};
