// Photo abilities and a row lockup: a circle crop with a sticker edge that rises into place, a stated focus, a
// title that cuts in, and a mark beside a name on one axis. The brand name is a random draw.
// The fact: a popcorn kernel pops at about 180 °C, when the steam inside reaches about 9 atm.
import { overflow, type BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const top = S.top + overflow(ctx, "headline").top;
  const head = B.title({ id: "head", text: "A kernel pops at about 180 °C.", role: "headline", keepCase: true, enter: "cut", x, y: top, w: W,
    h: (S.bottom - S.top) * 0.3, at: 0 }, ctx);
  const headBottom = Math.max(...head.map((n) => (n.kind === "text" ? n.y + ctx.lineHeight(n.role) : 0)));
  // The lockup sits under the title, in the text-safe area. The picture is a graphic, not text, so it fills the
  // room below it, the lower band included (at 9:16), and stays inside the frame by a margin.
  const gap = ctx.lineHeight("body");
  const lockY = headBottom + gap;
  const lockH = ctx.lineHeight("headline") + gap * 2;
  const m = ctx.width - S.right;
  const room = ctx.height - m - (lockY + lockH + gap);
  const side = Math.min(W, room);
  const box = { x: x + (W - side) / 2, y: lockY + lockH + gap, w: side, h: side };
  return [
    ...head,
    ...B.photo({ id: "corn", media: "pop-popcorn", box, shape: "circle", sticker: true, focus: [0.5, 0.45], motion: "still", enter: "rise", at: 0.6 }, ctx),
    ...B.lockup({ id: "brand", name: "Pellmora", line: "Fictional snacks", mark: "square", axis: "row", x, y: lockY, w: W, at: 2.4 }, ctx),
  ];
};
