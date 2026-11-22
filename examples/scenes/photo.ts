// The photo scene: a picture graded for the system, framed on its subject, with a slow push. The figure fills its
// frame, so no calm part holds the line: the line takes a band of its own and the picture fills the rest of the
// frame (lineInBand), cropped on its subject. A dark system eases the picture's top into the ground (fade "top").
// The box keeps the source sharp: the block reports the upscale, and this one stays under 1.25x.
// The fact is computed: steel grows about 12 µm per metre for each kelvin, so a 100 m span is 12 mm longer on a
// day 10 °C warmer.
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineInBand, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 6;
const LINE = "A 100 m steel span grows 12 mm on a day 10 °C warmer.";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const rows = (w: number) => Math.ceil(B.measure("title", { id: "m", x: S.left, y: S.top, w, text: LINE, role: "headline", keepCase: true, maxLines: 4, at: -10 }, ctx).h + ctx.size("headline") * 0.3);
  const L = lineInBand(ctx, { lineH: rows(S.right - S.left), rows });
  const dark = ctx.system.mode === "dark";
  return [
    ...B.photo({ id: "bridge", media: "noir-bridge", box: L.picture, ...(dark && L.side === "top" ? { fade: "top" as const } : {}), motion: "push", amount: 0.02, at: 0 }, ctx),
    ...B.title({ id: "line", text: LINE, role: "headline", keepCase: true, maxLines: 4, x: L.line.x, y: L.line.y, w: L.line.w, at: 0.3 }, ctx),
  ];
};
