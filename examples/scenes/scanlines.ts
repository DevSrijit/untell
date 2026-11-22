// Console's scanlines (effect "scanlines") and its weight split: a short build session in the terminal block.
// The renderers draw the scanlines over the whole frame; the terminal sets each command in bold and its output in
// regular. The fact: 2^20 = 1048576, so 1 MiB is 1048576 bytes.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 9;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const tall = ctx.height > ctx.width;
  // The panel spans the margins; its text column keeps to the text-safe area (inset).
  const m = Math.round(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const x = m, w = ctx.width - 2 * m;
  const y = S.top, h = (tall ? S.lowBandTop : S.bottom) - S.top;
  return [
    ...B.terminal({ id: "t", x, y, w, h, role: tall ? "body" : "headline", inset: { x: S.left - x + Math.round(ctx.size("label") * 0.4), y: Math.round(ctx.size("label") * 0.8) },
      prompt: "fjord $",
      session: [
        { command: "echo $((2**20))", output: [{ text: "1048576", result: true }] },
        { command: "du -b quill.bin", output: ["1048576  quill.bin"], pause: 0.9 },
      ],
      status: { left: "fjord", right: [{ text: "0.0 s", at: 0 }, { text: "1.2 s", at: 4 }] },
      at: 0 }, ctx),
    ...B.hold({ at: 6.5, until: seconds }, ctx),
  ];
};
